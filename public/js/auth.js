/**
 * Authentication utilities
 */
const Auth = {
  /**
   * Check if user is logged in
   */
  isLoggedIn() {
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");
    return !!(token && user);
  },

  /**
   * Get current user
   */
  getUser() {
    const user = localStorage.getItem("user");
    return user ? JSON.parse(user) : null;
  },

  /**
   * Get token
   */
  getToken() {
    return localStorage.getItem("token");
  },

  /**
   * Login - save token and user
   */
  login(token, user) {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
  },

  /**
   * Logout - clear storage
   */
  logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  },

  /**
   * Require authentication - redirect to login if not logged in
   */
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = "/";
      return false;
    }
    return true;
  },
};
