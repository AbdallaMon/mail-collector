/**
 * API Client for Mail Collector
 */
const Api = {
  baseUrl: "/api",

  /**
   * Get auth headers
   */
  getHeaders() {
    const headers = {
      "Content-Type": "application/json",
    };
    const token = localStorage.getItem("token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  },

  /**
   * Make API request
   */
  async request(method, endpoint, data = null) {
    const options = {
      method,
      headers: this.getHeaders(),
    };

    if (data && method !== "GET") {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(this.baseUrl + endpoint, options);
      const json = await response.json();

      if (response.status === 401) {
        // Token expired or invalid
        Auth.logout();
        window.location.href = "/";
        throw new Error("Session expired. Please login again.");
      }

      if (!response.ok) {
        throw new Error(json.message || "API request failed");
      }

      return json;
    } catch (error) {
      console.error("API Error:", error);
      throw error;
    }
  },

  // HTTP method shortcuts
  get(endpoint) {
    return this.request("GET", endpoint);
  },

  post(endpoint, data) {
    return this.request("POST", endpoint, data);
  },

  put(endpoint, data) {
    return this.request("PUT", endpoint, data);
  },

  patch(endpoint, data) {
    return this.request("PATCH", endpoint, data);
  },

  delete(endpoint) {
    return this.request("DELETE", endpoint);
  },
};
