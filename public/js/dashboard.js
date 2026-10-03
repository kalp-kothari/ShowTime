// =============================================================================
// dashboard.js - ShowTime Booking
// Loads the user dashboard: bookings (with reconcile) and watchlist
// =============================================================================

async function loadDashboard() {
  // requireAuth: checkSession() then redirect if not logged in
  const user = await Auth.checkSession();
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  // Fire POST /api/bookings/reconcile silently to catch any closed-tab payments
  // This is async and must not block the UI from loading
  fetch('/api/bookings/reconcile', { method: 'POST' })
    .then(() => loadBookings()) // Reload bookings after reconcile completes
    .catch(() => {}); // Reconcile is best-effort

  // Load watchlist immediately without waiting for reconcile
  loadWatchlist();
}

// ---------------------------------------------------------------------------
// loadBookings: Fetch and render user's booking history
// ---------------------------------------------------------------------------
async function loadBookings() {
  const container = document.getElementById('bookings-list');
  try {
    const res = await fetch('/api/bookings');
    if (!res.ok) throw new Error('API error');
    const bookings = await res.json();

    if (!bookings.length) {
      container.innerHTML = '<p style="padding: 1.5rem 0; color: var(--text-muted);">You have no bookings yet. <a href="/">Browse movies →</a></p>';
      return;
    }

    container.innerHTML = bookings.map(b => {
      // The API returns flat SQL columns: b.title, b.theatre, b.show_date, b.show_time, etc.
      const showDate = b.show_date ? b.show_date.slice(0, 10) : '-';
      const showTime = b.show_time ? b.show_time.slice(0, 5) : '-';
      const totalFmt = b.total_amount ? `₹${Number(b.total_amount).toFixed(2)}` : '-';

      let refundHtml = '';
      if (b.status === 'refund_needed') {
        refundHtml = `<div class="refund-notice" style="margin-top:0.75rem; padding:0.75rem; background:#fff3cd; border-radius:6px; font-size:0.875rem; color:#856404; border:1px solid #ffeeba;">
          ⚠️ Your payment was received but tickets were no longer available due to an expired hold.
          Please request a <strong>manual refund</strong> via the Stripe test dashboard.
        </div>`;
      }

      return `
        <div class="booking-card">
          <img src="${b.poster_url || '/images/poster-placeholder.svg'}"
               alt="${Auth.escapeHtml(b.title)}"
               class="booking-thumb"
               onerror="this.onerror=null;this.src='/images/poster-placeholder.svg';">
          <div class="booking-details">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
              <div>
                <span class="booking-ref">${Auth.escapeHtml(b.booking_ref)}</span>
                <h3 style="margin-top:0.4rem; font-size:1.05rem;">${Auth.escapeHtml(b.title)}</h3>
              </div>
              <span class="status-badge status-${b.status}">${b.status.replace(/_/g, ' ').toUpperCase()}</span>
            </div>
            <p style="color:var(--text-muted); margin:0.4rem 0; font-size:0.9rem;">
              📍 ${Auth.escapeHtml(b.theatre)} &bull; 📅 ${showDate} &bull; 🕐 ${showTime} IST
            </p>
            <p style="font-size:0.9rem;">
              <strong>Tickets:</strong> ${b.quantity} &nbsp;|&nbsp; <strong>Total:</strong> ${totalFmt}
            </p>
            ${refundHtml}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:#dc2626;">Error loading bookings. Please refresh.</p>';
  }
}

// ---------------------------------------------------------------------------
// loadWatchlist: Fetch and render user's watchlist
// ---------------------------------------------------------------------------
async function loadWatchlist() {
  const container = document.getElementById('watchlist-list');
  try {
    const res = await fetch('/api/watchlist');
    if (!res.ok) throw new Error('API error');
    const items = await res.json();

    if (!items.length) {
      container.innerHTML = '<p style="padding: 1.5rem 0; color: var(--text-muted);">Your watchlist is empty. <a href="/">Browse movies →</a></p>';
      return;
    }

    container.innerHTML = items.map(w => `
      <div class="watchlist-card" id="wl-${w.id}">
        <img src="${w.poster_url || '/images/poster-placeholder.svg'}"
             alt="${Auth.escapeHtml(w.title)}"
             class="watchlist-poster"
             onerror="this.onerror=null;this.src='/images/poster-placeholder.svg';">
        <div class="watchlist-content">
          <h3 style="margin-bottom:0.25rem;">${Auth.escapeHtml(w.title)}</h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:0.75rem;">
            ${Auth.escapeHtml(w.genre || '')} &bull; ${w.release_year || ''}
          </p>

          <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem; font-weight:600;">Personal Rating (1–5)</label>
          <select id="wl-rating-${w.id}" class="watchlist-rating-select">
            <option value="">--</option>
            ${[1,2,3,4,5].map(n =>
              `<option value="${n}" ${w.personal_rating === n ? 'selected' : ''}>${n} ⭐</option>`
            ).join('')}
          </select>

          <label style="display:block; font-size:0.85rem; margin:0.5rem 0 0.25rem; font-weight:600;">Notes</label>
          <textarea id="wl-note-${w.id}" class="watchlist-note-input" rows="2">${Auth.escapeHtml(w.note || '')}</textarea>

          <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
            <button class="btn-primary" style="font-size:13px; padding:6px 14px;" onclick="updateWatchlist(${w.id})">Save Note</button>
            <button class="btn-watchlist" style="font-size:13px; padding:6px 14px; color:#dc2626; border-color:#fca5a5;" onclick="removeFromWatchlist(${w.id})">Remove</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:#dc2626;">Error loading watchlist. Please refresh.</p>';
  }
}

// ---------------------------------------------------------------------------
// updateWatchlist: Save rating + note for a watchlist entry
// ---------------------------------------------------------------------------
async function updateWatchlist(id) {
  const ratingEl = document.getElementById(`wl-rating-${id}`);
  const noteEl = document.getElementById(`wl-note-${id}`);
  const rating = ratingEl ? ratingEl.value : '';
  const note = noteEl ? noteEl.value : '';

  try {
    const res = await fetch(`/api/watchlist/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personalRating: rating ? parseInt(rating, 10) : null, note })
    });
    if (res.ok) {
      // Brief visual confirmation
      const btn = event.target;
      const orig = btn.textContent;
      btn.textContent = '✓ Saved!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    } else {
      alert('Failed to save. Please try again.');
    }
  } catch (e) {
    alert('Network error. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// removeFromWatchlist: Delete a watchlist entry
// ---------------------------------------------------------------------------
async function removeFromWatchlist(id) {
  if (!confirm('Remove this movie from your watchlist?')) return;
  try {
    const res = await fetch(`/api/watchlist/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const el = document.getElementById(`wl-${id}`);
      if (el) el.remove();
    } else {
      alert('Failed to remove. Please try again.');
    }
  } catch (e) {
    alert('Network error.');
  }
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------
document.getElementById('tab-bookings').addEventListener('click', () => {
  document.getElementById('tab-bookings').classList.add('active');
  document.getElementById('tab-watchlist').classList.remove('active');
  document.getElementById('panel-bookings').style.display = 'block';
  document.getElementById('panel-watchlist').style.display = 'none';
});

document.getElementById('tab-watchlist').addEventListener('click', () => {
  document.getElementById('tab-watchlist').classList.add('active');
  document.getElementById('tab-bookings').classList.remove('active');
  document.getElementById('panel-watchlist').style.display = 'block';
  document.getElementById('panel-bookings').style.display = 'none';
});

document.addEventListener('DOMContentLoaded', loadDashboard);
