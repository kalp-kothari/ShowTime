-- ============================================================
-- WARNING: This file uses TRUNCATE which WIPES ALL USER DATA
-- (watchlist, bookings, shows, movies) and resets IDs.
-- DO NOT run this after real user accounts exist.
-- Safe for initial setup and development only.
-- ============================================================

TRUNCATE TABLE watchlist, bookings, shows, movies RESTART IDENTITY CASCADE;

INSERT INTO movies (title, genre, rating, poster_url, description, release_year) VALUES
('Inception', 'Sci-Fi', 8.8, 'https://image.tmdb.org/t/p/w500/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg', 'A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.', 2010),
('The Dark Knight', 'Action', 9.0, 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg', 'When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.', 2008),
('Interstellar', 'Sci-Fi', 8.7, 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity''s survival.', 2014),
('Oppenheimer', 'Drama', 8.9, 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', 'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.', 2023),
('Dune: Part Two', 'Sci-Fi', 8.6, 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', 'Paul Atreides unites with Chani and the Fremen while on a warpath of revenge against the conspirators who destroyed his family.', 2024),
('Spider-Man: Across the Spider-Verse', 'Animation', 8.7, 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg', 'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence.', 2023),
('Parasite', 'Thriller', 8.5, 'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', 'Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.', 2019),
('Spirited Away', 'Animation', 8.6, 'https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg', 'During her family''s move to the suburbs, a sullen 10-year-old girl wanders into a world ruled by gods, witches, and spirits, and where humans are changed into beasts.', 2001),
('RRR', 'Action', 8.0, 'https://image.tmdb.org/t/p/w500/wE0Q2qqg04gK8W71n4K8m1r95Wv.jpg', 'A fictitious story about two legendary revolutionaries and their journey away from home before they started fighting for their country in 1920s.', 2022),
('Pulp Fiction', 'Crime', 8.9, 'https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', 'The lives of two mob hitmen, a boxer, a gangster and his wife, and a pair of diner bandits intertwine in four tales of violence and redemption.', 1994),
('Avengers: Endgame', 'Action', 8.4, 'https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg', 'After the devastating events of Infinity War, the universe is in ruins. With the help of remaining allies, the Avengers assemble once more in order to reverse Thanos'' actions and restore balance to the universe.', 2019),
('The Shawshank Redemption', 'Drama', 9.3, 'https://image.tmdb.org/t/p/w500/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg', 'Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.', 1994),
('Fight Club', 'Drama', 8.8, 'https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', 'An insomniac office worker and a devil-may-care soapmaker form an underground fight club that evolves into something much, much more.', 1999),
('The Matrix', 'Sci-Fi', 8.7, 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', 'A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.', 1999),
('Gladiator', 'Action', 8.5, 'https://image.tmdb.org/t/p/w500/ty8TGRuvJLPUmAR1H1nRIsgwvim.jpg', 'A former Roman General sets out to exact vengeance against the corrupt emperor who murdered his family and sent him into slavery.', 2000),
('The Grand Budapest Hotel', 'Comedy', 8.1, 'https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHWX9NZkt5BW.jpg', 'A writer encounters the owner of an aging high-class hotel, who tells him of his early years serving as a lobby boy in the hotel''s glorious years under an exceptional concierge.', 2014),
('Whiplash', 'Drama', 8.5, 'https://image.tmdb.org/t/p/w500/7fn624j5lj3xTme2SgiLCeuedmO.jpg', 'A promising young drummer enrolls at a cut-throat music conservatory where his dreams of greatness are mentored by an instructor who will stop at nothing to realize a student''s potential.', 2014),
('Coco', 'Animation', 8.4, 'https://image.tmdb.org/t/p/w500/gGEsBPAijhVUFoiNpgZXqRVWJt2.jpg', 'Aspiring musician Miguel, confronted with his family''s ancestral ban on music, enters the Land of the Dead to find his great-great-grandfather, a legendary singer.', 2017),
('Joker', 'Crime', 8.4, 'https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg', 'In Gotham City, mentally troubled comedian Arthur Fleck is disregarded and mistreated by society. He then embarks on a downward spiral of revolution and bloody crime.', 2019),
('K.G.F: Chapter 2', 'Action', 8.2, 'https://image.tmdb.org/t/p/w500/6ypjJcT3V3rR8WJ2vHjXm0F7kRk.jpg', 'The blood-soaked land of Kolar Gold Fields has a new overlord now, Rocky, whose name strikes fear in the heart of his foes. His allies look up to him as their Savior, the government sees him as a threat, and his enemies are clamoring for revenge.', 2022);

INSERT INTO shows (movie_id, theatre, show_date, show_time, price, capacity)
SELECT id, 'PVR Superplex: Mall of India', (NOW() AT TIME ZONE 'Asia/Kolkata')::date + 1, '14:30:00', 320.00, 100 FROM movies WHERE id <= 7;
INSERT INTO shows (movie_id, theatre, show_date, show_time, price, capacity)
SELECT id, 'INOX Megaplex: Inorbit Mall', (NOW() AT TIME ZONE 'Asia/Kolkata')::date + 2, '18:45:00', 280.00, 120 FROM movies WHERE id > 7 AND id <= 14;
INSERT INTO shows (movie_id, theatre, show_date, show_time, price, capacity)
SELECT id, 'Cinepolis: Grand Central', (NOW() AT TIME ZONE 'Asia/Kolkata')::date + 3, '21:15:00', 300.00, 80 FROM movies WHERE id > 14;

SELECT setval('movies_id_seq', (SELECT MAX(id) FROM movies));
