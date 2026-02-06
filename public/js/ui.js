/**
 * Common UI utilities
 */
const UI = {
  /**
   * Format date
   */
  formatDate(dateString) {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    return date.toLocaleString();
  },

  /**
   * Format relative time
   */
  formatRelativeTime(dateString) {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  },

  /**
   * Get status badge HTML
   */
  statusBadge(status) {
    const classes = {
      ACTIVE: "badge-success",
      SYNCING: "badge-info",
      ERROR: "badge-danger",
      PENDING: "badge-warning",
      PAUSED: "badge-warning",
      FORWARDED: "badge-success",
      FAILED: "badge-danger",
      SKIPPED: "badge-warning",
    };
    return `<span class="badge ${classes[status] || "badge-info"}">${status}</span>`;
  },

  /**
   * Show loading state
   */
  showLoading(container) {
    container.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>
    `;
  },

  /**
   * Show empty state
   */
  showEmpty(container, message = "No data found", icon = "📭") {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">${icon}</div>
        <p>${message}</p>
      </div>
    `;
  },

  /**
   * Show error state
   */
  showError(container, message = "Something went wrong") {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">❌</div>
        <p style="color: var(--danger);">${message}</p>
      </div>
    `;
  },

  /**
   * Show toast notification
   */
  toast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `alert alert-${type}`;
    toast.style.cssText =
      "position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;";
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  },

  /**
   * Confirm dialog
   */
  confirm(message) {
    return window.confirm(message);
  },

  /**
   * Render sidebar with active page
   */
  renderSidebar(activePage) {
    const user = Auth.getUser();
    return `
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1>📬 Mail Collector</h1>
        </div>
        
        <nav>
          <ul class="sidebar-nav">
            <li>
              <a href="dashboard.html" class="${activePage === "dashboard" ? "active" : ""}">
                <span class="icon">📊</span>
                Dashboard
              </a>
            </li>
            <li>
              <a href="accounts.html" class="${activePage === "accounts" ? "active" : ""}">
                <span class="icon">📧</span>
                Mail Accounts
              </a>
            </li>
            <li>
              <a href="logs.html" class="${activePage === "logs" ? "active" : ""}">
                <span class="icon">📋</span>
                Email Logs
              </a>
            </li>
            <li>
              <a href="settings.html" class="${activePage === "settings" ? "active" : ""}">
                <span class="icon">⚙️</span>
                Settings
              </a>
            </li>
          </ul>
        </nav>
        
        <div class="user-menu">
          <div class="user-info">
            <div class="user-avatar">${user?.name?.charAt(0) || "A"}</div>
            <div>
              <div class="user-name">${user?.name || "Admin"}</div>
              <div class="user-email">${user?.email || ""}</div>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" style="width: 100%;" onclick="Auth.logout(); window.location.href='index.html';">
            Logout
          </button>
        </div>
      </aside>
    `;
  },
};
