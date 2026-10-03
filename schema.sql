CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS movies (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    genre VARCHAR(100),
    rating NUMERIC(3,1) CHECK (rating >= 0 AND rating <= 10),
    poster_url TEXT,
    description TEXT,
    release_year INTEGER
);

-- all show times are in IST (Asia/Kolkata)
CREATE TABLE IF NOT EXISTS shows (
    id SERIAL PRIMARY KEY,
    movie_id INTEGER REFERENCES movies(id),
    theatre VARCHAR(255) NOT NULL,
    show_date DATE NOT NULL,
    show_time TIME NOT NULL,
    price NUMERIC(10,2) CHECK (price > 0),
    capacity INTEGER CHECK (capacity > 0)
);

CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    show_id INTEGER REFERENCES shows(id),
    quantity INTEGER CHECK (quantity >= 1 AND quantity <= 6),
    total_amount NUMERIC(10,2) CHECK (total_amount > 0),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','refund_needed')),
    stripe_session_id TEXT,
    booking_ref VARCHAR(32) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bookings_show_status_created ON bookings (show_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings (user_id);

CREATE TABLE IF NOT EXISTS watchlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    movie_id INTEGER REFERENCES movies(id),
    personal_rating INTEGER CHECK (personal_rating >= 1 AND personal_rating <= 5),
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_movie UNIQUE(user_id, movie_id)
);

CREATE TABLE IF NOT EXISTS session (
    sid VARCHAR NOT NULL COLLATE "default",
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
