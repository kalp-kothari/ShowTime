// =============================================================================
// result.js - ShowTime Booking
// Handles both booking-success.html and booking-cancelled.html
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);

  // ---- BOOKING SUCCESS PAGE ------------------------------------------------
  if (window.location.pathname.includes('success')) {
    const ref = urlParams.get('ref');
    const detailsContainer = document.getElementById('receipt-details');

    if (!ref) {
      detailsContainer.innerHTML = '<p style="color:#dc2626;">No booking reference found in URL.</p>';
      return;
    }

    try {
      // GET /api/bookings/:ref — returns 404 if not owned by logged-in user
      const res = await fetch(`/api/bookings/${ref}`);
      if (!res.ok) {
        detailsContainer.innerHTML = '<p style="color:#dc2626;">Could not load booking details. Please check My Bookings in your dashboard.</p>';
        return;
      }
      const b = await res.json();

      // API returns flat SQL columns: b.booking_ref, b.title, b.theatre, b.show_date, b.show_time, etc.
      const showDate = b.show_date ? b.show_date.slice(0, 10) : '-';
      const showTime = b.show_time ? b.show_time.slice(0, 5) : '-';
      const totalFmt = b.total_amount ? `₹${Number(b.total_amount).toFixed(2)}` : '-';

      detailsContainer.innerHTML = `
        <table class="receipt-table">
          <tr>
            <td>Booking Reference</td>
            <td><span class="booking-ref-badge">${Auth.escapeHtml(b.booking_ref)}</span></td>
          </tr>
          <tr>
            <td>Movie</td>
            <td>${Auth.escapeHtml(b.title)}</td>
          </tr>
          <tr>
            <td>Theatre</td>
            <td>${Auth.escapeHtml(b.theatre)}</td>
          </tr>
          <tr>
            <td>Show Date / Time</td>
            <td>${showDate} &bull; ${showTime} IST</td>
          </tr>
          <tr>
            <td>Tickets</td>
            <td>${b.quantity}</td>
          </tr>
          <tr>
            <td>Total Paid</td>
            <td><strong>${totalFmt}</strong></td>
          </tr>
          <tr>
            <td>Status</td>
            <td><span class="status-badge status-${b.status}">${b.status.replace(/_/g, ' ').toUpperCase()}</span></td>
          </tr>
        </table>
      `;
    } catch (err) {
      detailsContainer.innerHTML = '<p>Could not load booking details.</p>';
    }
  }

  // ---- BOOKING CANCELLED PAGE ----------------------------------------------
  else if (window.location.pathname.includes('cancelled')) {
    const bookingId = urlParams.get('booking_id');
    const msg = document.getElementById('cancel-msg');

    if (bookingId) {
      // IMPORTANT: POST (not GET) must release tickets — no GET route mutates state
      try {
        const res = await fetch(`/api/bookings/${bookingId}/cancel`, { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
          if (data.status === 'paid') {
            // Cancel route discovered the payment was already received — booking was confirmed
            msg.innerHTML = `
              <strong>Payment was actually received!</strong><br>
              Your booking has been confirmed. 
              <a href="/dashboard.html" style="color:var(--primary-color); font-weight:600;">View My Bookings →</a>
            `;
          } else {
            msg.textContent = 'Payment was cancelled. Your held tickets have been released.';
          }
        } else {
          // e.g., booking not pending (already cancelled, or not found)
          msg.textContent = 'Payment was cancelled. (Hold had already been released.)';
        }
      } catch (err) {
        msg.textContent = 'Payment was cancelled. (Could not confirm ticket release — please check My Bookings.)';
      }
    } else {
      msg.textContent = 'Payment was cancelled.';
    }
  }
});
