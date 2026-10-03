window.Auth = {
  currentUser: null,

  async checkSession() {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        if (data.loggedIn) {
          this.currentUser = data.user;
        } else {
          this.currentUser = null;
        }
      } else {
        this.currentUser = null;
      }
    } catch (e) {
      this.currentUser = null;
    }
    this.renderNavbar();
    return this.currentUser;
  },

  renderNavbar() {
    const navActions = document.getElementById('nav-actions');
    if (!navActions) return;

    if (this.currentUser) {
      navActions.innerHTML = `
        <span class="mr-2">Hi, <strong>${this.escapeHtml(this.currentUser.name)}</strong></span>
        <a href="/dashboard.html" class="btn btn-outline">My Dashboard</a>
        <button onclick="Auth.logout()" class="btn btn-ghost">Logout</button>
      `;
    } else {
      navActions.innerHTML = `
        <a href="/login.html" class="btn btn-ghost">Log In</a>
        <a href="/signup.html" class="btn btn-primary">Sign Up</a>
      `;
    }
  },

  async logout() {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {}
    window.location.href = '/';
  },

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag]));
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Auth.checkSession();
});
