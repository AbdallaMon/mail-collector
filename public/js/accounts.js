// /js/accounts.js
// Full Accounts page script with pagination + row numbering + search + working/not working filter + top stats card

(function () {
  var state = {
    page: 1,
    limit: 50,
    total: 0,
    pages: 1,
    q: "",
    health: "all", // all | working | not_working
  };

  var searchDebounceTimer = null;

  document.addEventListener("DOMContentLoaded", function () {
    // Require authentication
    if (!Auth.requireAuth()) {
      window.location.href = "/";
      return;
    }

    // Setup event listeners
    document
      .getElementById("logout-btn")
      .addEventListener("click", function (e) {
        e.preventDefault();
        logout();
      });

    document
      .getElementById("connect-account-btn")
      .addEventListener("click", connectAccount);

    // Search input
    var searchInput = document.getElementById("accounts-search");
    var clearBtn = document.getElementById("accounts-search-clear");

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

        searchDebounceTimer = setTimeout(function () {
          state.q = (searchInput.value || "").trim();
          // reset pagination when search changes
          loadAccounts(1);
        }, 250);
      });
    }

    // Health filter dropdown
    var healthSelect = document.getElementById("accounts-health-filter");
    if (healthSelect) {
      healthSelect.addEventListener("change", function () {
        state.health = this.value || "all";
        // reset pagination when filter changes
        loadAccounts(1);
      });
    }

    // Clear button
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        state.q = "";
        state.health = "all";

        if (searchInput) searchInput.value = "";
        if (healthSelect) healthSelect.value = "all";

        loadAccounts(1);
      });
    }

    // Ensure pagination container exists
    ensurePaginationContainer();

    // Initial load
    loadAccounts(1);
  });

  function ensurePaginationContainer() {
    var card = document.querySelector(".card"); // first .card is stats card if you added it
    // We want pagination under the TABLE card, not stats card.
    // So pick the LAST .card (table card)
    var cards = document.querySelectorAll(".card");
    if (!cards || cards.length === 0) return;
    var tableCard = cards[cards.length - 1];

    if (document.getElementById("accounts-pagination")) return;

    var pagination = document.createElement("div");
    pagination.id = "accounts-pagination";
    pagination.style.display = "flex";
    pagination.style.justifyContent = "space-between";
    pagination.style.alignItems = "center";
    pagination.style.padding = "12px 16px";
    pagination.style.borderTop = "1px solid #e5e7eb";
    pagination.style.gap = "12px";
    pagination.style.flexWrap = "wrap";

    pagination.innerHTML =
      '<div style="display:flex; flex-direction:column; gap:4px;">' +
      '  <div id="accounts-pagination-info" class="text-sm text-gray-500">Loading...</div>' +
      '  <div id="accounts-pagination-shown" class="text-sm text-gray-500"></div>' +
      "</div>" +
      '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
      '  <button id="accounts-prev-btn" class="btn btn-outline btn-sm">Prev</button>' +
      '  <div id="accounts-page-buttons" style="display:flex; gap:6px; flex-wrap:wrap;"></div>' +
      '  <button id="accounts-next-btn" class="btn btn-outline btn-sm">Next</button>' +
      '  <select id="accounts-limit" class="input" style="height:36px; padding:0 10px;">' +
      '    <option value="25">25 / page</option>' +
      '    <option value="50" selected>50 / page</option>' +
      '    <option value="100">100 / page</option>' +
      '    <option value="200">200 / page</option>' +
      "  </select>" +
      "</div>";

    tableCard.appendChild(pagination);

    document
      .getElementById("accounts-prev-btn")
      .addEventListener("click", function () {
        if (state.page > 1) loadAccounts(state.page - 1);
      });

    document
      .getElementById("accounts-next-btn")
      .addEventListener("click", function () {
        if (state.page < state.pages) loadAccounts(state.page + 1);
      });

    document
      .getElementById("accounts-limit")
      .addEventListener("change", function () {
        state.limit = parseInt(this.value, 10) || 50;
        loadAccounts(1);
      });
  }

  function buildQueryString(params) {
    var parts = [];
    Object.keys(params).forEach(function (key) {
      var val = params[key];
      if (val === undefined || val === null) return;
      if (typeof val === "string" && val.trim() === "") return;
      parts.push(
        encodeURIComponent(key) + "=" + encodeURIComponent(String(val)),
      );
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  function setTopStats(currentPageCount) {
    var totalEl = document.getElementById("accounts-total-top");
    var showingEl = document.getElementById("accounts-showing-top");
    var shownNowEl = document.getElementById("accounts-shown-now-top");

    if (!totalEl || !showingEl || !shownNowEl) return;

    var from = state.total === 0 ? 0 : (state.page - 1) * state.limit + 1;
    var to = Math.min(state.page * state.limit, state.total);

    totalEl.textContent = String(state.total);
    showingEl.textContent = from + "–" + to;
    shownNowEl.textContent = String(currentPageCount || 0);
  }

  function renderPagination(currentPageCount) {
    var infoEl = document.getElementById("accounts-pagination-info");
    var shownEl = document.getElementById("accounts-pagination-shown");
    var prevBtn = document.getElementById("accounts-prev-btn");
    var nextBtn = document.getElementById("accounts-next-btn");
    var btnWrap = document.getElementById("accounts-page-buttons");

    if (!infoEl || !shownEl || !prevBtn || !nextBtn || !btnWrap) return;

    var from = state.total === 0 ? 0 : (state.page - 1) * state.limit + 1;
    var to = Math.min(state.page * state.limit, state.total);

    var filterLabel =
      state.health === "working"
        ? "Working"
        : state.health === "not_working"
          ? "Not working"
          : "All";

    var extra = [];
    if (state.q) extra.push('search "' + state.q + '"');
    if (state.health !== "all") extra.push("filter " + filterLabel);

    infoEl.textContent =
      "Showing " +
      from +
      "–" +
      to +
      " of " +
      state.total +
      (extra.length ? " (" + extra.join(", ") + ")" : "");

    shownEl.textContent = "Shown now: " + (currentPageCount || 0);

    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= state.pages;

    btnWrap.innerHTML = "";

    var maxButtons = 7;
    var pages = state.pages || 1;

    var start = Math.max(1, state.page - Math.floor(maxButtons / 2));
    var end = start + maxButtons - 1;
    if (end > pages) {
      end = pages;
      start = Math.max(1, end - maxButtons + 1);
    }

    function addPageButton(p) {
      var b = document.createElement("button");
      b.textContent = String(p);
      b.style.minWidth = "40px";
      b.className =
        p === state.page ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm";
      b.addEventListener("click", function () {
        loadAccounts(p);
      });
      btnWrap.appendChild(b);
    }

    if (start > 1) {
      addPageButton(1);
      if (start > 2) {
        var dots = document.createElement("span");
        dots.textContent = "…";
        dots.style.padding = "0 6px";
        dots.style.color = "#6b7280";
        btnWrap.appendChild(dots);
      }
    }

    for (var p = start; p <= end; p++) addPageButton(p);

    if (end < pages) {
      if (end < pages - 1) {
        var dots2 = document.createElement("span");
        dots2.textContent = "…";
        dots2.style.padding = "0 6px";
        dots2.style.color = "#6b7280";
        btnWrap.appendChild(dots2);
      }
      addPageButton(pages);
    }
  }

  async function loadAccounts(page) {
    try {
      if (page) state.page = page;

      var tbody = document.getElementById("accounts-table");
      if (tbody) {
        tbody.innerHTML =
          "<tr>" +
          '<td colspan="7" class="text-center text-gray-500">Loading accounts...</td>' +
          "</tr>";
      }

      // Build query
      var qs = buildQueryString({
        page: state.page,
        limit: state.limit,
        q: state.q,
        health: state.health, // NEW
      });

      var response = await Api.get("/accounts" + qs);

      var accounts = response.data?.accounts || [];
      var pagination = response.data?.pagination;

      if (pagination) {
        state.page = parseInt(pagination.page, 10) || state.page;
        state.limit = parseInt(pagination.limit, 10) || state.limit;
        state.total = parseInt(pagination.total, 10) || 0;
        state.pages = parseInt(pagination.pages, 10) || 1;

        var limitSelect = document.getElementById("accounts-limit");
        if (limitSelect) limitSelect.value = String(state.limit);
      } else {
        state.total = accounts.length;
        state.pages = 1;
      }

      if (response.success && accounts.length > 0) {
        var startIndex = (state.page - 1) * state.limit;

        tbody.innerHTML = accounts
          .map(function (account, i) {
            var rowNumber = startIndex + i + 1;

            var statusClass =
              account.status === "CONNECTED"
                ? "badge-success"
                : account.status === "ERROR"
                  ? "badge-danger"
                  : account.status === "NEEDS_REAUTH"
                    ? "badge-warning"
                    : "badge-info";

            var messageCount = account.forwardedCount || 0;

            return (
              "<tr>" +
              '<td class="text-sm text-gray-500">' +
              rowNumber +
              "</td>" +
              "<td>" +
              '<div class="flex items-center gap-2">' +
              '<div style="width: 40px; height: 40px; background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #3b82f6; font-weight: 600;">' +
              (account.email ? account.email.charAt(0).toUpperCase() : "?") +
              "</div>" +
              "<div>" +
              '<div class="font-medium">' +
              (account.email || "") +
              "</div>" +
              '<div class="text-sm text-gray-500">' +
              (account.displayName || "") +
              "</div>" +
              "</div>" +
              "</div>" +
              "</td>" +
              "<td>" +
              '<span class="badge ' +
              statusClass +
              '">' +
              (account.status || "") +
              "</span>" +
              (account.lastError
                ? '<div class="text-xs text-gray-500 mt-1" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">' +
                  account.lastError +
                  "</div>"
                : "") +
              "</td>" +
              '<td class="text-sm text-gray-500">' +
              (account.lastSyncAt
                ? new Date(account.lastSyncAt).toLocaleString()
                : "Never") +
              "</td>" +
              '<td class="font-medium">' +
              messageCount +
              "</td>" +
              "<td>" +
              '<label class="toggle">' +
              '<input type="checkbox" class="account-toggle" data-id="' +
              account.id +
              '" ' +
              (account.isEnabled ? "checked" : "") +
              ">" +
              '<span class="toggle-slider"></span>' +
              "</label>" +
              "</td>" +
              "<td>" +
              '<div class="actions" style="justify-content: flex-end;">' +
              '<button class="btn btn-danger btn-sm delete-btn" data-id="' +
              account.id +
              '" data-email="' +
              (account.email || "") +
              '" title="Delete">🗑️</button>' +
              "</div>" +
              "</td>" +
              "</tr>"
            );
          })
          .join("");

        setupAccountEventListeners();

        // Top stats + footer
        setTopStats(accounts.length);
        renderPagination(accounts.length);
      } else {
        // No results
        tbody.innerHTML =
          "<tr>" +
          '<td colspan="7">' +
          '<div class="empty-state">' +
          '<div class="empty-state-icon">📧</div>' +
          '<div class="empty-state-title">No accounts found</div>' +
          '<p class="text-gray-500 mb-4">' +
          "Try changing search or filter." +
          "</p>" +
          '<button id="empty-clear-btn" class="btn btn-outline">Reset filters</button>' +
          "</div>" +
          "</td>" +
          "</tr>";

        document
          .getElementById("empty-clear-btn")
          .addEventListener("click", function () {
            state.q = "";
            state.health = "all";

            var searchInput = document.getElementById("accounts-search");
            var healthSelect = document.getElementById(
              "accounts-health-filter",
            );
            if (searchInput) searchInput.value = "";
            if (healthSelect) healthSelect.value = "all";

            loadAccounts(1);
          });

        setTopStats(0);
        renderPagination(0);
      }
    } catch (error) {
      console.error("Failed to load accounts:", error);
      var tbody2 = document.getElementById("accounts-table");
      if (tbody2) {
        tbody2.innerHTML =
          "<tr>" +
          '<td colspan="7" class="text-center text-gray-500">Failed to load accounts.</td>' +
          "</tr>";
      }
      setTopStats(0);
      renderPagination(0);
    }
  }

  function setupAccountEventListeners() {
    document.querySelectorAll(".delete-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        deleteAccount(this.dataset.id, this.dataset.email);
      });
    });

    document.querySelectorAll(".account-toggle").forEach(function (toggle) {
      toggle.addEventListener("change", function () {
        toggleAccount(this.dataset.id, this.checked);
      });
    });
  }

  async function connectAccount() {
    var loadingModal = Modal.loading("Redirecting to Microsoft login...");
    try {
      var response = await Api.get("/accounts/oauth/url");
      if (response.success && response.data.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      Modal.close(loadingModal);
      Modal.error(
        "Connection Failed",
        "Failed to start OAuth flow: " + error.message,
      );
    }
  }

  async function toggleAccount(id, enabled) {
    try {
      await Api.patch("/accounts/" + id, { isEnabled: enabled });
      loadAccounts(state.page);
    } catch (error) {
      Modal.error(
        "Update Failed",
        "Failed to update account: " + error.message,
      );
      loadAccounts(state.page);
    }
  }

  async function deleteAccount(id, email) {
    Modal.confirm(
      "Delete Account",
      "Are you sure you want to delete <strong>" +
        email +
        "</strong>?<br><br>This action cannot be undone and all synced messages will be removed.",
      async function () {
        var loadingModal = Modal.loading("Deleting account...");
        try {
          await Api.delete("/accounts/" + id);
          Modal.close(loadingModal);
          Modal.success(
            "Account Deleted",
            "<strong>" + email + "</strong> has been removed.",
            function () {
              // Adjust page after delete
              var newTotal = Math.max(state.total - 1, 0);
              var maxPageAfterDelete = Math.max(
                Math.ceil(newTotal / state.limit),
                1,
              );
              var nextPage = Math.min(state.page, maxPageAfterDelete);
              loadAccounts(nextPage);
            },
          );
        } catch (error) {
          Modal.close(loadingModal);
          Modal.error(
            "Delete Failed",
            "Failed to delete account: " + error.message,
          );
        }
      },
    );
  }

  function logout() {
    Auth.logout();
    window.location.href = "/";
  }
})();
