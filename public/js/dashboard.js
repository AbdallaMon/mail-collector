// Dashboard page script
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

  document.getElementById("sync-all-btn").addEventListener("click", syncAll);

  // Load dashboard data
  loadDashboard();
  loadRecentLogs();
});

async function loadDashboard() {
  try {
    var response = await Api.get("/dashboard/stats");
    if (response.success) {
      var accounts = response.data.accounts || {};
      var messages = response.data.messages || {};
      document.getElementById("stat-accounts").textContent =
        accounts.total || 0;
      document.getElementById("stat-active").textContent =
        accounts.connected || 0;
      document.getElementById("stat-errors").textContent =
        accounts.needsReauth + accounts.error || 0;
      document.getElementById("stat-messages").textContent =
        messages.forwarded || 0;
    }
  } catch (error) {
    console.error("Failed to load dashboard:", error);
  }
}

async function loadRecentLogs() {
  try {
    var response = await Api.get("/logs?limit=5&status=FAILED");
    var tbody = document.getElementById("recent-logs");

    // Handle response format: { data: { logs: [...], pagination: {...} } }
    var logs = response.data?.logs || response.data || [];

    if (response.success && logs.length > 0) {
      tbody.innerHTML = logs
        .map(function (log) {
          var status = log.forwardStatus || log.status;
          return (
            "<tr>" +
            "<td>" +
            new Date(
              log.receivedAt || log.receivedDateTime || log.createdAt,
            ).toLocaleString() +
            "</td>" +
            "<td>" +
            (log.mailAccount?.email || log.account?.email || "Unknown") +
            "</td>" +
            '<td class="truncate" style="max-width: 300px;">' +
            (log.subject || "(No subject)") +
            "</td>" +
            "<td>" +
            '<span class="badge ' +
            (status === "FORWARDED"
              ? "badge-success"
              : status === "FAILED"
                ? "badge-danger"
                : "badge-warning") +
            '">' +
            status +
            "</span>" +
            "</td>" +
            "</tr>"
          );
        })
        .join("");
    } else {
      tbody.innerHTML =
        '<tr><td colspan="4" class="text-center text-gray-500">No recent activity</td></tr>';
    }
  } catch (error) {
    console.error("Failed to load recent logs:", error);
  }
}

async function syncAll() {
  var loadingModal = Modal.loading(
    "Syncing all accounts...<br><small>This may take a few minutes</small>",
  );

  document.getElementById("sync-all-btn").disabled = true;

  try {
    var response = await Api.post("/accounts/sync-all");
    Modal.close(loadingModal);

    if (response.success) {
      Modal.syncResults("Sync Complete", response.data);
      loadDashboard();
      loadRecentLogs();
    }
  } catch (error) {
    Modal.close(loadingModal);
    Modal.error("Sync Failed", "Failed to sync accounts: " + error.message);
  } finally {
    document.getElementById("sync-all-btn").disabled = false;
  }
}

function logout() {
  Auth.logout();
  window.location.href = "/";
}
