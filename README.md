# ShowTime Booking

A movie ticket booking website inspired by BookMyShow. You can browse movies, save them to a watchlist, and book tickets with a test payment through Stripe. I built it for the 2nd year website copy project (the one that needs a working backend).

Live site: <your-render-url>

## What it does

- Sign up, log in and log out (passwords are hashed, sessions are saved in the database)
- Browse movies, search by title and filter by genre
- Open a movie to see upcoming shows, prices and how many tickets are left
- Watchlist: add a movie, give it a rating out of 5, write a note, remove it
- Book 1 to 6 tickets for a show and pay through Stripe (test mode)
- Dashboard with your watchlist and your bookings

Seating is first come, first served. There is no seat map.

## Tech used

- Frontend: HTML, CSS and plain JavaScript
- Backend: Node.js with Express (it also serves the frontend files)
- Database: PostgreSQL on Supabase, using the `pg` library with plain SQL (no ORM)
- Login: `bcryptjs` for password hashing, `express-session` with `connect-pg-simple` to keep sessions in Postgres
- Payments: Stripe Checkout in test mode
- Hosting: Render for the app

I kept the stack small on purpose so I could explain every part of it.

## How the pieces connect

```
Browser  ->  Express server  ->  PostgreSQL
                  |
                  +-->  Stripe
```

The browser talks to the Express server with `fetch()`. The server runs SQL on the database and talks to Stripe for payments.

## Running it on your computer

You need Node.js 18 or newer, a PostgreSQL database, and a free Stripe account.

1. Clone the repo and install:
```
   git clone <your-repo-url>
   cd showtime-booking
   npm install
```

2. Copy `.env.example` to `.env` and fill it in:
```
   PORT=3000
   NODE_ENV=development
   BASE_URL=http://localhost:3000
   DATABASE_URL=postgresql://user:password@host:5432/postgres
   SESSION_SECRET=any_long_random_string
   STRIPE_SECRET_KEY=sk_test_...
```
   If your database password has special characters, encode them in the URL. For example `@` becomes `%40`.

3. Create the tables and add the movies:
```
   node seed.js
```
   This runs `schema.sql` and `seed.sql`, then adds upcoming shows.

   Be careful: `seed.sql` starts with `TRUNCATE`, which deletes everything. Only run it once when setting up, not after people have created accounts.

4. Start it:
```
   npm start
```
   Then open http://localhost:3000

## Stripe test mode

Make a free Stripe account, turn on Test mode, and copy the secret key from Developers > API keys. It starts with `sk_test_`. No real money is used.

| Card number | Result |
|---|---|
| 4242 4242 4242 4242 | Payment works |
| 4000 0000 0000 9995 | Card is declined |

Use any future expiry date, any 3 digit CVC and any postal code.

## Deploying on Render

1. Push the code to GitHub. `.env` is in `.gitignore`, so your keys are not uploaded.
2. On Render, create a new Web Service from the repo.
3. Build command: `npm install`. Start command: `node server.js`.
4. Add these environment variables:

| Name | Value |
|---|---|
| NODE_ENV | production |
| BASE_URL | your Render URL, like https://your-app.onrender.com |
| DATABASE_URL | your Supabase connection string (use the Session pooler one) |
| SESSION_SECRET | a long random string |
| STRIPE_SECRET_KEY | your sk_test key |

5. Set up the database once by running `node seed.js` on your own computer with `DATABASE_URL` in `.env` pointing at the same Supabase database.

Note: Render's free plan goes to sleep when nobody uses it, so the first load can be slow. Supabase's free plan also pauses after a week of no activity.

## Time zone

The database runs on UTC, but the shows are in Indian time. All checks for "has this show started" use `NOW() AT TIME ZONE 'Asia/Kolkata'`. Without this, the results would be wrong between midnight and 5:30 AM IST.

## How some of it works

**How does login work?**
When you sign up, the password is hashed with bcrypt and only the hash is saved. On login, the server compares what you typed with the hash. If it matches, it creates a new session ID (so nobody can reuse an old one), saves your user id in the session table, and sends you a cookie. The cookie is `httpOnly` so JavaScript on the page cannot read it.

**How do you stop two people booking the last ticket?**
If two people check the count at the same moment, both see "1 left" and both book it. To avoid that, the booking runs inside a transaction that locks the show's row with `SELECT ... FOR UPDATE`. The second person has to wait until the first is done, and then sees the real remaining count. If there aren't enough tickets they get an error.

**What is the 30 minute hold?**
A new booking starts as `pending` and counts against the available tickets for 30 minutes. If the person never pays, the booking stops counting after that, so the tickets free up without needing any cleanup job.

**Why check the payment with Stripe again?**
After paying, Stripe sends the browser back to the site with a session id in the URL. Anyone could type that URL by hand, so the server doesn't trust it. It asks Stripe directly whether that session was paid, then checks that the session belongs to this booking, the amount and currency match, the booking belongs to the logged in user, and it is still pending.

**What if someone pays and closes the tab?**
They never come back to the confirm page. When they open the dashboard, the page calls `POST /api/bookings/reconcile`, which checks their recent pending bookings with Stripe and marks the paid ones as paid.

**What is `refund_needed`?**
If someone pays after their 30 minute hold ran out and the tickets are gone, the booking is marked `refund_needed` instead of `paid`. In test mode I refund it by hand from the Stripe dashboard.

**Why no React or ORM?**
I wanted to understand the basics properly: the DOM, `fetch`, and writing the SQL myself. Row locks and transactions are also easier to show with plain SQL.

## Things I tested

- [ ] Sign up, log out, log in again
- [ ] Signing up with an email that already exists shows an error
- [ ] Wrong password shows an error
- [ ] Still logged in after refreshing the page
- [ ] Dashboard doesn't open when logged out
- [ ] Watchlist: add, edit rating and note, remove
- [ ] A second account can't see the first account's watchlist or bookings
- [ ] Booking more tickets than are left is rejected
- [ ] Shows that already started aren't listed or bookable
- [ ] Test card 4242 shows the booking as paid
- [ ] Declined card leaves the booking unpaid
- [ ] Going back from the Stripe page cancels and frees the tickets
- [ ] Paying and closing the tab, then opening the dashboard, marks it paid
- [ ] Server refuses to start without `STRIPE_SECRET_KEY` or `BASE_URL`

## Limitations

- No seat selection
- Payments are test mode only
- Paid bookings can't be cancelled from the site. Refunds are manual in the Stripe dashboard.
- Movie data is sample data

## Folder structure

```
showtime-booking/
├── server.js       routes, sessions, Stripe
├── db.js           database connection
├── schema.sql      tables
├── seed.sql        movies and first shows
├── seed.js         runs the SQL files and adds new shows
└── public/         pages, css, js, images
```

## Credits

Movie posters come from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.