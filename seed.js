const fs = require('fs');
const path = require('path');

async function refreshShows(db) {
  const theatreOptions = [
    { name: 'PVR Superplex: Mall of India', times: ['14:30', '19:00'], prices: [250, 320] },
    { name: 'INOX Megaplex: Inorbit Mall', times: ['11:30', '18:45'], prices: [280, 350] },
    { name: 'Cinepolis: Grand Central', times: ['21:15', '15:30'], prices: [240, 300] },
    { name: 'PVR IMAX: Vega City Mall', times: ['14:00', '20:00'], prices: [420, 450] },
    { name: 'INOX: Garuda Mall', times: ['17:45', '21:45'], prices: [260, 340] },
  ];

  const moviesRes = await db.query('SELECT id FROM movies');
  for (let movie of moviesRes.rows) {
    const movieId = movie.id;
    const showsRes = await db.query(
      `SELECT theatre, show_date, show_time FROM shows
       WHERE movie_id = $1
         AND (show_date::date + show_time::time) > (NOW() AT TIME ZONE 'Asia/Kolkata')`,
      [movieId]
    );
    const existingShows = showsRes.rows;
    if (existingShows.length < 2) {
      const showsToAdd = 3 - existingShows.length;
      let added = 0;
      for (let i = 0; i < showsToAdd; i++) {
        const theatreIdx = Math.floor(Math.random() * theatreOptions.length);
        const theatre = theatreOptions[theatreIdx];
        const timeIdx = Math.floor(Math.random() * theatre.times.length);
        const time = theatre.times[timeIdx];
        const price = theatre.prices[timeIdx];
        const dayOffset = i + 1;
        const capacity = Math.floor(Math.random() * 91) + 60; // 60-150

        // Skip if exists
        const exists = existingShows.some(s => s.theatre === theatre.name && s.show_time === time);
        if (!exists) {
          await db.query(
            `INSERT INTO shows (movie_id, theatre, show_date, show_time, price, capacity)
             VALUES ($1, $2, (NOW() AT TIME ZONE 'Asia/Kolkata')::date + $3::integer, $4::time, $5::numeric, $6)`,
            [movieId, theatre.name, dayOffset, time, price, capacity]
          );
          added++;
        }
      }
      if (added > 0) {
        console.log(`Added ${added} shows for movie ${movieId}`);
      }
    }
  }
}

async function runFullSeed(db) {
  console.log('Starting full seed...');
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
  
  await db.query(schemaSql);
  console.log('Schema executed.');
  await db.query(seedSql);
  console.log('Initial seed executed.');
  
  await refreshShows(db);
  console.log('Seed completed.');
}

module.exports = { refreshShows, runFullSeed };

if (require.main === module) {
  const db = require('./db');
  runFullSeed(db)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
