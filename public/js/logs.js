// Logs page script
var currentPage = 1;
var pageSize = 20;

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

  document.getElementById("log-type").addEventListener("change", function () {
    currentPage = 1;
    loadLogs();
  });

  document
    .getElementById("refresh-logs-btn")
    .addEventListener("click", loadLogs);
  document.getElementById("prev-btn").addEventListener("click", prevPage);
  document.getElementById("next-btn").addEventListener("click", nextPage);

  // Load logs
  loadLogs();
});

async function loadLogs() {
  var logType = document.getElementById("log-type").value;
  var tbody = document.getElementById("logs-table");
  var tableHeader = document.getElementById("table-header");

  try {
    // Both message and system logs use the same endpoint now
    var endpoint = "/logs?page=" + currentPage + "&limit=" + pageSize;

    // Message logs: show only errors (FAILED). System logs: use system endpoint.
    if (logType === "errors") {
      endpoint += "&status=FAILED";
    }

    var response = await Api.get(endpoint);

    // Handle response format: { data: { logs: [...], pagination: {...} } }
    var logs = response.data?.logs || response.data || [];
    var pagination = response.data?.pagination || { total: logs.length };

    // Update table header based on log type
    if (logType === "errors") {
      tableHeader.innerHTML =
        "<tr>" +
        "<th>Time</th>" +
        "<th>From</th>" +
        "<th>To (Account)</th>" +
        "<th>Subject</th>" +
        "<th>Status</th>" +
        "</tr>";
    } else {
      tableHeader.innerHTML =
        "<tr>" +
        "<th>Time</th>" +
        "<th>Level</th>" +
        "<th>Category</th>" +
        "<th>Message</th>" +
        "</tr>";
    }

    if (response.success && logs.length > 0) {
      if (logType === "errors") {
        tbody.innerHTML = logs
          .map(function (log) {
            var status = log.forwardStatus || log.status;
            var statusClass =
              status === "FORWARDED"
                ? "badge-success"
                : status === "FAILED"
                  ? "badge-danger"
                  : "badge-warning";
            return (
              "<tr>" +
              '<td class="text-sm text-gray-500">' +
              new Date(
                log.receivedAt || log.receivedDateTime || log.createdAt,
              ).toLocaleString() +
              "</td>" +
              '<td class="font-medium">' +
              (log.fromAddress || "Unknown") +
              "</td>" +
              '<td class="text-sm text-gray-500">' +
              (log.mailAccount?.email ||
                log.account?.email ||
                log.originalRecipient ||
                "Unknown") +
              "</td>" +
              '<td class="truncate" style="max-width: 250px;">' +
              (log.subject || "(No subject)") +
              "</td>" +
              '<td><span class="badge ' +
              statusClass +
              '">' +
              status +
              "</span></td>" +
              "</tr>"
            );
          })
          .join("");
      } else {
        tbody.innerHTML = logs
          .map(function (log) {
            var levelClass =
              log.level === "error"
                ? "badge-danger"
                : log.level === "warning"
                  ? "badge-warning"
                  : "badge-info";
            return (
              "<tr>" +
              '<td class="text-sm text-gray-500">' +
              new Date(log.createdAt).toLocaleString() +
              "</td>" +
              '<td><span class="badge ' +
              levelClass +
              '">' +
              (log.level || "info").toUpperCase() +
              "</span></td>" +
              '<td class="text-sm text-gray-500">' +
              (log.category || "General") +
              "</td>" +
              "<td>" +
              (log.message || log.subject || "") +
              "</td>" +
              "</tr>"
            );
          })
          .join("");
      }

      // Update pagination
      document.getElementById("pagination-info").textContent =
        "Page " + currentPage + " of " + (pagination.totalPages || 1);
      document.getElementById("prev-btn").disabled = currentPage === 1;
      document.getElementById("next-btn").disabled =
        currentPage >= (pagination.totalPages || 1);
    } else {
      var cols = logType === "errors" ? 5 : 4;
      tbody.innerHTML =
        "<tr>" +
        '<td colspan="' +
        cols +
        '">' +
        '<div class="empty-state">' +
        '<div class="empty-state-icon">📋</div>' +
        '<div class="empty-state-title">No logs found</div>' +
        "</div>" +
        "</td>" +
        "</tr>";
    }
  } catch (error) {
    console.error("Failed to load logs:", error);
    tbody.innerHTML =
      "<tr>" +
      '<td colspan="5" class="text-center" style="color: var(--danger);">Failed to load logs: ' +
      error.message +
      "</td>" +
      "</tr>";
  }
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    loadLogs();
  }
}

function nextPage() {
  currentPage++;
  loadLogs();
}

function logout() {
  Auth.logout();
  window.location.href = "/";
}
