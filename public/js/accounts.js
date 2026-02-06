// Accounts page script
document.addEventListener("DOMContentLoaded", function () {
  // Require authentication
  if (!Auth.requireAuth()) {
    window.location.href = "/";
    return;
  }

  // Setup event listeners
  document.getElementById("logout-btn").addEventListener("click", function (e) {
    e.preventDefault();
    logout();
  });

  document
    .getElementById("sync-all-btn")
    .addEventListener("click", syncAllAccounts);
  document
    .getElementById("connect-account-btn")
    .addEventListener("click", connectAccount);

  // Load accounts
  loadAccounts();
});

async function loadAccounts() {
  try {
    var response = await Api.get("/accounts");
    var tbody = document.getElementById("accounts-table");

    // Handle response format: { data: { accounts: [...], pagination: {...} } }
    var accounts = response.data?.accounts || response.data || [];

    if (response.success && accounts.length > 0) {
      tbody.innerHTML = accounts
        .map(function (account) {
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
            "<td>" +
            '<div class="flex items-center gap-2">' +
            '<div style="width: 40px; height: 40px; background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #3b82f6; font-weight: 600;">' +
            account.email.charAt(0).toUpperCase() +
            "</div>" +
            "<div>" +
            '<div class="font-medium">' +
            account.email +
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
            account.status +
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
            '<button class="btn btn-outline btn-sm sync-btn" data-id="' +
            account.id +
            '" data-email="' +
            account.email +
            '" title="Sync now">🔄</button>' +
            '<button class="btn btn-danger btn-sm delete-btn" data-id="' +
            account.id +
            '" data-email="' +
            account.email +
            '" title="Delete">🗑️</button>' +
            "</div>" +
            "</td>" +
            "</tr>"
          );
        })
        .join("");

      // Add event listeners to dynamically created buttons
      setupAccountEventListeners();
    } else {
      tbody.innerHTML =
        "<tr>" +
        '<td colspan="6">' +
        '<div class="empty-state">' +
        '<div class="empty-state-icon">📧</div>' +
        '<div class="empty-state-title">No accounts connected yet</div>' +
        '<p class="text-gray-500 mb-4">Connect your first Outlook or Microsoft 365 account to start collecting emails.</p>' +
        '<button id="empty-connect-btn" class="btn btn-primary">Connect Account</button>' +
        "</div>" +
        "</td>" +
        "</tr>";

      // Add event listener to empty state button
      document
        .getElementById("empty-connect-btn")
        .addEventListener("click", connectAccount);
    }
  } catch (error) {
    console.error("Failed to load accounts:", error);
  }
}

function setupAccountEventListeners() {
  // Sync buttons
  document.querySelectorAll(".sync-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      syncAccount(this.dataset.id, this.dataset.email);
    });
  });

  // Delete buttons
  document.querySelectorAll(".delete-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      deleteAccount(this.dataset.id, this.dataset.email);
    });
  });

  // Toggle switches
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

async function syncAllAccounts() {
  var loadingModal = Modal.loading(
    "Syncing all accounts...<br><small>This may take a few minutes</small>",
  );

  document.getElementById("sync-all-btn").disabled = true;

  try {
    var response = await Api.post("/accounts/sync-all");
    Modal.close(loadingModal);

    if (response.success) {
      Modal.syncResults("Sync Complete", response.data);
      loadAccounts();
    }
  } catch (error) {
    Modal.close(loadingModal);
    Modal.error("Sync Failed", "Failed to sync accounts: " + error.message);
  } finally {
    document.getElementById("sync-all-btn").disabled = false;
  }
}

async function syncAccount(id, email) {
  var loadingModal = Modal.loading("Syncing <strong>" + email + "</strong>...");

  try {
    var response = await Api.post("/accounts/" + id + "/sync");
    Modal.close(loadingModal);

    if (response.success) {
      var data = response.data;
      var content =
        '<div class="sync-results">' +
        '<div class="sync-results-row">' +
        '<span class="sync-results-label">Messages Found</span>' +
        '<span class="sync-results-value">' +
        (data.messagesFound || 0) +
        "</span>" +
        "</div>" +
        '<div class="sync-results-row">' +
        '<span class="sync-results-label">Messages Forwarded</span>' +
        '<span class="sync-results-value success">' +
        (data.messagesForwarded || 0) +
        "</span>" +
        "</div>" +
        '<div class="sync-results-row">' +
        '<span class="sync-results-label">Messages Failed</span>' +
        '<span class="sync-results-value error">' +
        (data.messagesFailed || 0) +
        "</span>" +
        "</div>" +
        "</div>";

      Modal.create({
        title: "Sync Complete",
        message: "<strong>" + email + "</strong> synced successfully!",
        icon: data.messagesFailed > 0 ? "warning" : "success",
        content: content,
        closable: true,
        buttons: [{ text: "OK", class: "btn-primary" }],
      });
      loadAccounts();
    }
  } catch (error) {
    Modal.close(loadingModal);
    Modal.error(
      "Sync Failed",
      "Failed to sync <strong>" + email + "</strong>: " + error.message,
    );
  }
}

async function toggleAccount(id, enabled) {
  try {
    await Api.patch("/accounts/" + id, { isEnabled: enabled });
    loadAccounts();
  } catch (error) {
    Modal.error("Update Failed", "Failed to update account: " + error.message);
    loadAccounts(); // Reload to reset toggle state
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
            loadAccounts();
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
