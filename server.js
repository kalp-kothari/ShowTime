require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');
const { refreshShows } = require('./seed');

// ====== STARTUP GUARDS ======
// Stripe is always required — there is no fallback payment mode.
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey || !/^sk_(test|live)_/.test(stripeKey)) {
  console.error('\n❌  FATAL: STRIPE_SECRET_KEY is missing or invalid.');
  console.error('   Set it to your Stripe secret key (sk_test_... or sk_live_...) in .env');
  console.error('   Get your test key at: https://dashboard.stripe.com/test/apikeys\n');
  process.exit(1);
}

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
  console.error('\n❌  FATAL: BASE_URL is missing.');
  console.error('   Set BASE_URL=http://localhost:3000 in .env (or your production domain)\n');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('\n❌  FATAL: SESSION_SECRET is required in production.\n');
  process.exit(1);
}

const stripe = require('stripe')(stripeKey);
const app = express();
const PORT = process.env.PORT || 3000;

// ====== MIDDLEWARE ======
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new pgSession({
    pool: db.pool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-key-do-not-use-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// ====== HELPERS ======
function generateBookingRef() {
  return 'BMS-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ---------------------------------------------------------------------------
// confirmBookingPayment
//
// Verifies the Stripe session then, inside a locked transaction:
//   - Re-counts available tickets (excluding this booking's own quantity)
//   - Sets status = 'paid'        when seats are still available
//   - Sets status = 'refund_needed' when seats ran out after the hold expired
//
// stripeSession: the Stripe session object retrieved from the Stripe API.
//   Every caller MUST supply it. Verification is always mandatory.
// ---------------------------------------------------------------------------
async function confirmBookingPayment(client, booking, stripeSession) {
  // ---- Strict Stripe verification (always required) ----------------------
  if (
    stripeSession.id !== booking.stripe_session_id ||
    stripeSession.payment_status !== 'paid' ||
    stripeSession.currency.toLowerCase() !== 'inr' ||
    stripeSession.amount_total !== Math.round(Number(booking.total_amount) * 100)
  ) {
    throw new Error('Stripe verification failed: session does not match booking');
  }

  // ---- Guard: only pending bookings may be confirmed ---------------------
  if (booking.status !== 'pending') {
    return { result: booking.status };
  }

  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;

    // Lock the show row so no concurrent booking can race us
    const showRes = await client.query('SELECT * FROM shows WHERE id = $1 FOR UPDATE', [booking.show_id]);
    const show = showRes.rows[0];

    // Recompute availability excluding this booking
    const bookedRes = await client.query(
      `SELECT COALESCE(SUM(quantity), 0) AS booked
       FROM bookings
       WHERE show_id = $1
         AND id != $2
         AND (status = 'paid'
              OR (status = 'pending' AND created_at >= NOW() - INTERVAL '30 minutes'))`,
      [show.id, booking.id]
    );
    const ticketsLeft = show.capacity - Number(bookedRes.rows[0].booked);

    let resultStatus;
    if (booking.quantity <= ticketsLeft) {
      await client.query("UPDATE bookings SET status = 'paid' WHERE id = $1", [booking.id]);
      resultStatus = 'paid';
    } else {
      // Payment received but no seats left — needs manual refund in Stripe dashboard
      await client.query("UPDATE bookings SET status = 'refund_needed' WHERE id = $1", [booking.id]);
      resultStatus = 'refund_needed';
    }

    await client.query('COMMIT');
    return { result: resultStatus, ticketsLeft };
  } catch (err) {
    if (inTransaction) await client.query('ROLLBACK');
    throw err;
  }
}

const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// ====== AUTH ROUTES ======
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;
    if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });

    const hash = await bcrypt.hash(password, 12);
    const r = await db.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name',
      [name.trim(), email.trim().toLowerCase(), hash]
    );
    const user = r.rows[0];
    // Regenerate session ID to prevent session fixation
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      req.session.userId = user.id;
      req.session.userName = user.name;
      res.json({ success: true, user });
    });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'An account with this email already exists. Please log in.' });
    console.error('Signup error:', e.message);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const r = await db.query('SELECT * FROM users WHERE email = $1', [email?.toLowerCase()]);
    const user = r.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    // Regenerate session ID to prevent session fixation
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      req.session.userId = user.id;
      req.session.userName = user.name;
      res.json({ success: true, user: { id: user.id, name: user.name } });
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ loggedIn: true, user: { id: req.session.userId, name: req.session.userName } });
  } else {
    res.json({ loggedIn: false });
  }
});

// ====== MOVIES ROUTES ======
app.get('/api/movies', async (req, res) => {
  try {
    const { search, genre } = req.query;
    let query = 'SELECT * FROM movies WHERE 1=1';
    let params = [];
    // Title/description search uses substring matching
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      query += ` AND (title ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }
    // Genre uses exact match (prevents 'Action' matching 'Animation')
    if (genre && genre !== 'All') {
      params.push(genre.trim());
      query += ` AND genre ILIKE $${params.length}`;
    }
    query += ' ORDER BY rating DESC';
    const r = await db.query(query, params);
    res.json(r.rows);
  } catch (e) {
    console.error('Movies fetch error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/movies/:id', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM movies WHERE id = $1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/movies/:id/shows', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT s.*,
        (s.capacity - COALESCE(
          (SELECT SUM(quantity) FROM bookings b
           WHERE b.show_id = s.id
             AND (b.status = 'paid'
                  OR (b.status = 'pending' AND b.created_at >= NOW() - INTERVAL '30 minutes'))
          ), 0
        ))::integer AS tickets_left
       FROM shows s
       WHERE s.movie_id = $1
         AND (s.show_date::date + s.show_time::time) > (NOW() AT TIME ZONE 'Asia/Kolkata')
       ORDER BY s.show_date, s.show_time`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('Shows fetch error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ====== WATCHLIST ROUTES ======
app.get('/api/watchlist', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT w.*, m.title, m.poster_url, m.genre, m.release_year
       FROM watchlist w JOIN movies m ON w.movie_id = m.id
       WHERE w.user_id = $1 ORDER BY w.created_at DESC`,
      [req.session.userId]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/watchlist', requireAuth, async (req, res) => {
  try {
    const { movieId, personalRating, note } = req.body;
    const r = await db.query(
      `INSERT INTO watchlist (user_id, movie_id, personal_rating, note) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, movie_id) DO UPDATE SET personal_rating = EXCLUDED.personal_rating, note = EXCLUDED.note RETURNING *`,
      [req.session.userId, movieId, personalRating, note]
    );
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/watchlist/:id', requireAuth, async (req, res) => {
  try {
    const { personalRating, note } = req.body;
    const r = await db.query(
      'UPDATE watchlist SET personal_rating = $1, note = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [personalRating, note, req.params.id, req.session.userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/watchlist/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM watchlist WHERE (id = $1 OR movie_id = $1) AND user_id = $2', [req.params.id, req.session.userId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ====== BOOKINGS ROUTES ======

// POST /api/bookings — create a booking and open a Stripe Checkout session
app.post('/api/bookings', requireAuth, async (req, res) => {
  const { showId, quantity } = req.body;
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty < 1 || qty > 6 || !showId) {
    return res.status(400).json({ error: 'Invalid input: quantity must be 1–6 and showId is required.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Lock the show row to prevent concurrent overselling
    const showRes = await client.query('SELECT * FROM shows WHERE id = $1 FOR UPDATE', [showId]);
    if (!showRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Show not found.' });
    }
    const show = showRes.rows[0];

    // Reject past shows (IST comparison)
    const pastCheck = await client.query(
      `SELECT ($1::date + $2::time) <= (NOW() AT TIME ZONE 'Asia/Kolkata') AS is_past`,
      [show.show_date, show.show_time]
    );
    if (pastCheck.rows[0].is_past) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This show has already started.' });
    }

    // Availability: count paid + active-pending tickets
    const bookedRes = await client.query(
      `SELECT COALESCE(SUM(quantity), 0) AS booked FROM bookings
       WHERE show_id = $1
         AND (status = 'paid' OR (status = 'pending' AND created_at >= NOW() - INTERVAL '30 minutes'))`,
      [showId]
    );
    const ticketsLeft = show.capacity - Number(bookedRes.rows[0].booked);
    if (qty > ticketsLeft) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Not enough tickets available.' });
    }

    // Compute total server-side (never trust client-supplied price)
    const total_amount = Number(show.price) * qty;

    // Insert booking with retry on booking_ref collision (error code 23505)
    let booking_ref, booking;
    for (let attempt = 0; attempt < 5; attempt++) {
      booking_ref = generateBookingRef();
      try {
        const r = await client.query(
          'INSERT INTO bookings (user_id, show_id, quantity, total_amount, booking_ref) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [req.session.userId, showId, qty, total_amount, booking_ref]
        );
        booking = r.rows[0];
        break;
      } catch (e) {
        if (e.code === '23505' && attempt < 4) continue; // retry on unique collision
        throw e;
      }
    }

    await client.query('COMMIT');

    // Create Stripe Checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'inr',
          product_data: {
            name: 'Movie Tickets',
            description: `Show ID ${show.id} · ${qty} ticket(s)`,
          },
          unit_amount: Math.round(Number(show.price) * 100), // paise
        },
        quantity: qty,
      }],
      mode: 'payment',
      success_url: `${BASE_URL}/api/bookings/confirm?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${BASE_URL}/booking-cancelled.html?booking_id=${booking.id}`,
      client_reference_id: booking.id.toString(),
      expires_at: Math.floor(Date.now() / 1000) + 1860, // 31 minutes (Stripe minimum is 30)
    });

    await db.query('UPDATE bookings SET stripe_session_id = $1 WHERE id = $2', [checkoutSession.id, booking.id]);

    res.json({ checkoutUrl: checkoutSession.url, bookingRef: booking_ref });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('POST /api/bookings error:', err.message);
    res.status(500).json({ error: 'Could not create booking. Please try again.' });
  } finally {
    client.release();
  }
});

// GET /api/bookings/confirm — Stripe redirects the browser here after payment.
// The server re-verifies the payment with Stripe's API before confirming.
// This is idempotent: hitting it twice for a paid booking just redirects again.
app.get('/api/bookings/confirm', requireAuth, async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.redirect('/booking-cancelled.html?error=no_session');

  const client = await db.getClient();
  try {
    // Always verify payment directly with Stripe — never trust the browser URL alone
    const stripeSession = await stripe.checkout.sessions.retrieve(session_id);

    const bookingRes = await client.query('SELECT * FROM bookings WHERE id = $1', [stripeSession.client_reference_id]);
    if (!bookingRes.rows.length) return res.status(404).send('Booking not found.');
    const booking = bookingRes.rows[0];

    // Return 404 (not 403) to prevent booking ID enumeration
    if (booking.user_id !== req.session.userId) return res.status(404).send('Not found.');

    // Idempotent: already confirmed
    if (booking.status === 'paid') return res.redirect('/booking-success.html?ref=' + booking.booking_ref);

    // Cancelled or refund_needed — a cancelled booking must never become paid
    if (booking.status === 'cancelled' || booking.status === 'refund_needed') {
      return res.redirect('/booking-cancelled.html');
    }

    const result = await confirmBookingPayment(client, booking, stripeSession);
    if (result.result === 'paid') {
      res.redirect('/booking-success.html?ref=' + booking.booking_ref);
    } else {
      // refund_needed: payment received but tickets ran out during the hold window
      res.redirect('/booking-cancelled.html?reason=refund');
    }
  } catch (e) {
    console.error('Confirm route error:', e.message);
    res.redirect('/booking-cancelled.html?error=server');
  } finally {
    client.release();
  }
});

// POST /api/bookings/reconcile — called by dashboard.js on page load.
// Picks up payments made when the user closed the tab before the redirect.
app.post('/api/bookings/reconcile', requireAuth, async (req, res) => {
  const client = await db.getClient();
  try {
    // Only consider pending bookings with a Stripe session created in the last 35 min
    const pending = await client.query(
      `SELECT * FROM bookings
       WHERE user_id = $1
         AND status = 'pending'
         AND stripe_session_id IS NOT NULL
         AND created_at >= NOW() - INTERVAL '35 minutes'`,
      [req.session.userId]
    );

    for (const booking of pending.rows) {
      try {
        const stripeSession = await stripe.checkout.sessions.retrieve(booking.stripe_session_id);

        if (stripeSession.payment_status === 'paid') {
          // Confirm (same locked logic as the confirm route)
          await confirmBookingPayment(client, booking, stripeSession);
        } else {
          // Hold expired (> 30 min) and not paid — cancel and release tickets
          const isOld = new Date(booking.created_at).getTime() < Date.now() - 30 * 60 * 1000;
          if (isOld) {
            await client.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [booking.id]);
            try { await stripe.checkout.sessions.expire(booking.stripe_session_id); } catch (_) {}
          }
        }
      } catch (err) {
        // Per-booking errors are non-fatal; log and continue
        console.error(`Reconcile error for booking ${booking.id}:`, err.message);
      }
    }

    // Return the full (now-updated) booking list so the dashboard can re-render
    const updated = await db.query(
      `SELECT b.*, s.show_date, s.show_time, s.theatre, m.title, m.poster_url
       FROM bookings b JOIN shows s ON b.show_id = s.id JOIN movies m ON s.movie_id = m.id
       WHERE b.user_id = $1 ORDER BY b.created_at DESC`,
      [req.session.userId]
    );
    res.json(updated.rows);
  } catch (e) {
    console.error('Reconcile error:', e.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/bookings — read-only list of the current user's bookings
app.get('/api/bookings', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT b.*, s.show_date, s.show_time, s.theatre, m.title, m.poster_url
       FROM bookings b JOIN shows s ON b.show_id = s.id JOIN movies m ON s.movie_id = m.id
       WHERE b.user_id = $1 ORDER BY b.created_at DESC`,
      [req.session.userId]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/bookings/:ref — fetch a single booking by its booking_ref (for success page)
app.get('/api/bookings/:ref', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT b.*, s.show_date, s.show_time, s.theatre, m.title, m.poster_url
       FROM bookings b JOIN shows s ON b.show_id = s.id JOIN movies m ON s.movie_id = m.id
       WHERE b.booking_ref = $1 AND b.user_id = $2`,
      [req.params.ref, req.session.userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/bookings/:id/cancel — cancel a pending booking and release the hold.
// If the Stripe session was already paid, confirm the booking instead of cancelling.
app.post('/api/bookings/:id/cancel', requireAuth, async (req, res) => {
  const client = await db.getClient();
  try {
    const bookingRes = await client.query(
      "SELECT * FROM bookings WHERE id = $1 AND user_id = $2 AND status = 'pending'",
      [req.params.id, req.session.userId]
    );
    if (!bookingRes.rows.length) return res.status(404).json({ error: 'Not found or not pending' });
    const booking = bookingRes.rows[0];

    if (booking.stripe_session_id) {
      const stripeSession = await stripe.checkout.sessions.retrieve(booking.stripe_session_id);
      if (stripeSession.payment_status === 'paid') {
        // Payment was actually received — confirm instead of cancelling
        const result = await confirmBookingPayment(client, booking, stripeSession);
        return res.json({ success: true, status: result.result });
      }
      // Not paid — expire the session to free the Stripe checkout link
      try { await stripe.checkout.sessions.expire(booking.stripe_session_id); } catch (_) {}
    }

    await client.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [booking.id]);
    res.json({ success: true, status: 'cancelled' });
  } catch (e) {
    console.error('Cancel error:', e.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ====== ERROR HANDLERS ======
app.use('/api/*', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ====== STARTUP ======
async function startServer() {
  try {
    await refreshShows(db);
    console.log('✅ Show freshness check complete.');
  } catch (err) {
    console.error('Show refresh error (non-fatal):', err.message);
  }

  const server = app.listen(PORT, () => {
    console.log(`🎬 ShowTime Booking running on port ${PORT}`);
    console.log(`💳 Stripe: ${stripeKey.startsWith('sk_test_') ? 'TEST mode' : 'LIVE mode'}`);
    console.log(`🌐 Open: ${BASE_URL}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌  Port ${PORT} is already in use.`);
      console.error(`   Stop the other process or set a different PORT in .env\n`);
      process.exit(1);
    } else {
      throw err;
    }
  });
}
startServer();
