let activeGenre = 'All';
let searchQuery = '';

async function fetchAndRenderMovies() {
  const container = document.getElementById('movies-container');
  const countEl = document.getElementById('movie-count');
  
  let url = '/api/movies?';
  if (activeGenre !== 'All') url += `genre=${encodeURIComponent(activeGenre)}&`;
  if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}&`;
  
  try {
    const res = await fetch(url);
    const movies = await res.json();
    
    countEl.textContent = `Showing ${movies.length} movies`;
    
    if (movies.length === 0) {
      container.innerHTML = '<p>No movies found matching your criteria.</p>';
      return;
    }
    
    container.innerHTML = movies.map(movie => `
      <div class="movie-card">
        <div class="poster-wrapper">
          <img src="${movie.poster_url || '/images/poster-placeholder.svg'}"
               alt="${Auth.escapeHtml(movie.title)}"
               onerror="this.onerror=null;this.src='/images/poster-placeholder.svg';">
          <div class="rating-badge">★ ${movie.rating}</div>
        </div>
        <div class="card-body">
          <div class="movie-title">${Auth.escapeHtml(movie.title)}</div>
          <div class="movie-meta">
            <span class="promo-pill" style="padding: 0.1rem 0.5rem; font-size: 0.7rem; margin-top:0;">${movie.genre}</span> &bull; ${movie.release_year}
          </div>
          <div class="card-actions">
            <a href="/movie.html?id=${movie.id}" class="btn btn-primary">Book Tickets</a>
            <button class="btn btn-watchlist" onclick="handleAddToWatchlist('${movie.id}', this)">Add to Watchlist</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    countEl.textContent = 'Error loading movies.';
  }
}

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
      btn.textContent = 'Added to Watchlist';
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to add');
      btn.disabled = false;
    }
  } catch (err) {
    alert('Network error');
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  let debounceTimeout;
  
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      searchQuery = e.target.value.trim();
      fetchAndRenderMovies();
    }, 300);
  });
  
  const genreChips = document.querySelectorAll('.genre-chip');
  genreChips.forEach(chip => {
    chip.addEventListener('click', () => {
      genreChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeGenre = chip.dataset.genre;
      fetchAndRenderMovies();
    });
  });
  
  fetchAndRenderMovies();
});
