// =============================================================================
// movie.js - ShowTime Booking
// Movie detail page: loads movie info, shows, handles booking
// =============================================================================
//
// API field names (flat SQL columns from Express):
//   GET /api/movies/:id  → { id, title, genre, rating, poster_url, description, release_year }
//   GET /api/movies/:id/shows → [{ id, movie_id, theatre, show_date, show_time, price,
//                                   capacity, tickets_left }]
//   show_date arrives as "YYYY-MM-DDT..." ISO string (pg returns Date as ISO)
//   show_time arrives as "HH:MM:SS" string
// =============================================================================

let currentShow = null;
let currentMovieId = null;

// ---------------------------------------------------------------------------
// formatShowDate: safely formats a show_date string to "3 Oct" style
// ---------------------------------------------------------------------------
function formatShowDate(showDate) {
  if (!showDate) return '—';
  // show_date from pg arrives as "YYYY-MM-DDT00:00:00.000Z" or "YYYY-MM-DD"
  // Slice to just the date portion to avoid UTC→local shift
  const datePart = String(showDate).slice(0, 10); // "YYYY-MM-DD"
  const [year, month, day] = datePart.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day} ${months[month - 1]}`;
}

// ---------------------------------------------------------------------------
// formatShowTime: safely formats a show_time "HH:MM:SS" to "HH:MM IST"
// ---------------------------------------------------------------------------
function formatShowTime(showTime) {
  if (!showTime) return '—';
  // show_time arrives as "HH:MM:SS" from pg TIME column
  const parts = String(showTime).split(':');
  return `${parts[0]}:${parts[1]} IST`;
}

async function loadMovie() {
  const urlParams = new URLSearchParams(window.location.search);
  currentMovieId = urlParams.get('id');

  if (!currentMovieId) {
    document.getElementById('movie-header').innerHTML = '<h2>Movie not found.</h2>';
    return;
  }

  try {
    const res = await fetch(`/api/movies/${currentMovieId}`);
    if (!res.ok) throw new Error('Not found');
    // API columns: id, title, genre, rating, poster_url, description, release_year
    const movie = await res.json();

    document.title = `${movie.title} - ShowTime`;

    document.getElementById('movie-header').innerHTML = `
      <img src="${movie.poster_url || '/images/poster-placeholder.svg'}"
           alt="${Auth.escapeHtml(movie.title)}"
           onerror="this.onerror=null;this.src='/images/poster-placeholder.svg';"
           style="width:180px; border-radius:8px; flex-shrink:0;">
      <div style="flex: 1;">
        <h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">${Auth.escapeHtml(movie.title)}</h1>
        <div style="margin-bottom: 1rem;">
          <span class="promo-pill" style="margin-top:0;">★ ${movie.rating}</span>
          <span style="margin-left: 1rem;">${Auth.escapeHtml(movie.genre || '')} &bull; ${movie.release_year || ''}</span>
        </div>
        <p style="color: #ccc; max-width: 600px; margin-bottom: 1.5rem;">${Auth.escapeHtml(movie.description || '')}</p>
        <button class="btn btn-watchlist" onclick="handleAddToWatchlist('${movie.id}', this)">Add to Watchlist</button>
      </div>
    `;

    await loadShows();
  } catch (err) {
    document.getElementById('movie-header').innerHTML = '<h2>Error loading movie.</h2>';
  }
}

async function loadShows() {
  const container = document.getElementById('shows-container');
  try {
    const res = await fetch(`/api/movies/${currentMovieId}/shows`);
    const shows = await res.json();

    if (!Array.isArray(shows) || shows.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);">No upcoming shows available. Check back soon!</p>';
      return;
    }

    // Group shows by theatre (API column name: "theatre")
    const theatres = {};
    shows.forEach(show => {
      const name = show.theatre; // correct column name
      if (!theatres[name]) theatres[name] = [];
      theatres[name].push(show);
    });

    let html = '';
    for (const [theatreName, tShows] of Object.entries(theatres)) {
      html += `
        <div class="theatre-card">
          <div class="theatre-name">${Auth.escapeHtml(theatreName)}</div>
          <div class="showtimes">
      `;

      tShows.forEach(show => {
        // Use correct API column names: show_date, show_time, tickets_left, price
        const dateStr = formatShowDate(show.show_date);
        const timeStr = formatShowTime(show.show_time);
        const ticketsLeft = Number(show.tickets_left);
        const price = Number(show.price);

        // Encode show data for onclick — use data attributes to avoid quote escaping issues
        const showJson = JSON.stringify({
          id: show.id,
          theatre: show.theatre,
          dateStr,
          timeStr,
          price,
          tickets_left: ticketsLeft
        }).replace(/'/g, '&#39;');

        if (ticketsLeft <= 0) {
          html += `
            <button class="showtime-btn sold-out" disabled>
              ${timeStr}<br>
              <small>${dateStr} &bull; SOLD OUT</small>
            </button>
          `;
        } else {
          html += `
            <button class="showtime-btn" onclick='selectShow(${showJson})'>
              ${timeStr}<br>
              <small>${dateStr} &bull; ₹${price} &bull; ${ticketsLeft} left</small>
            </button>
          `;
        }
      });

      html += `</div></div>`;
    }
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<p>Error loading shows.</p>';
  }
}

function selectShow(show) {
  currentShow = show;
  const dock = document.getElementById('booking-dock');
  dock.classList.add('active');

  // Use correct fields: show.theatre, show.dateStr, show.timeStr
  document.getElementById('dock-theatre').textContent = show.theatre;
  document.getElementById('dock-time').textContent = `${show.dateStr} · ${show.timeStr}`;
  updateTotal();
}

function updateTotal() {
  if (!currentShow) return;
  const qty = parseInt(document.getElementById('dock-qty').value, 10);
  document.getElementById('dock-total').textContent = (qty * currentShow.price).toFixed(2);
}

document.getElementById('dock-qty').addEventListener('change', updateTotal);

document.getElementById('dock-book-btn').addEventListener('click', async () => {
  if (!Auth.currentUser) {
    window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.href)}`;
    return;
  }

  if (!currentShow) return;

  const qty = parseInt(document.getElementById('dock-qty').value, 10);
  const btn = document.getElementById('dock-book-btn');
  btn.disabled = true;
  btn.textContent = 'Booking...';

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId: currentShow.id, quantity: qty })
    });

    const data = await res.json();

    if (res.ok) {
      window.location.href = data.checkoutUrl;
    } else {
      alert(data.error || 'Failed to book. Tickets may have just sold out.');
      btn.disabled = false;
      btn.textContent = 'Book Now';
      loadShows(); // reload to show updated availability
    }
  } catch (err) {
    alert('Network error. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Book Now';
  }
});

async function handleAddToWatchlist(movieId, btn) {
  if (!Auth.currentUser) {
    window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.href)}`;
    return;
  }
  try {
    btn.disabled = true;
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movieId })
    });
    if (res.ok) {
      btn.textContent = '✓ Added to Watchlist';
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to add to watchlist.');
      btn.disabled = false;
    }
  } catch (err) {
    alert('Network error.');
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', loadMovie);
