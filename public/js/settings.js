// Settings page script
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
    .getElementById("password-form")
    .addEventListener("submit", handlePasswordChange);
  document
    .getElementById("forward-email-form")
    .addEventListener("submit", handleForwardEmailChange);
  document
    .getElementById("test-forward-btn")
    .addEventListener("click", testForward);

  // Load user info
  var user = Auth.getUser();
  if (user) {
    document.getElementById("user-initial").textContent = user.email
      .charAt(0)
      .toUpperCase();
    document.getElementById("user-name").textContent = user.name || "Admin";
    document.getElementById("user-email").textContent = user.email;
  }

  // Load system config
  loadConfig();
  loadWorkerStatus();
});

async function loadConfig() {
  try {
    var response = await Api.get("/dashboard/config");
    if (response.success) {
      var forwardEmail =
        response.data.forwardTo ||
        response.data.forwardToEmail ||
        "Not configured";
      document.getElementById("forward-email-display").textContent =
        forwardEmail;
      document.getElementById("forward-to-email").value =
        forwardEmail !== "Not configured" ? forwardEmail : "";
      document.getElementById("forward-method-display").textContent =
        response.data.forwardMethod || "Graph API";
      document.getElementById("sync-interval-display").textContent = response
        .data.syncInterval
        ? response.data.syncInterval + " seconds"
        : "2 minutes";
    }
  } catch (error) {
    console.error("Failed to load config:", error);
    document.getElementById("forward-email-display").textContent =
      "Error loading";
    document.getElementById("forward-method-display").textContent =
      "Error loading";
  }
}

async function loadWorkerStatus() {
  try {
    var response = await Api.get("/dashboard/worker-status");
    if (response.success) {
      var statusEl = document.getElementById("worker-status");
      if (response.data.isRunning) {
        statusEl.textContent = "Running";
        statusEl.className = "badge badge-success";
      } else {
        statusEl.textContent = "Stopped";
        statusEl.className = "badge badge-danger";
      }
    }
  } catch (error) {
    console.error("Failed to load worker status:", error);
    var statusEl = document.getElementById("worker-status");
    statusEl.textContent = "Unknown";
    statusEl.className = "badge badge-warning";
  }
}

async function handleForwardEmailChange(e) {
  e.preventDefault();

  var forwardEmail = document.getElementById("forward-to-email").value;

  if (!forwardEmail) {
    Modal.warning("Validation Error", "Please enter a valid email address.");
    return;
  }

  var loadingModal = Modal.loading("Saving configuration...");

  try {
    var response = await Api.post("/dashboard/config", {
      forwardToEmail: forwardEmail,
    });

    Modal.close(loadingModal);

    if (response.success) {
      Modal.success(
        "Configuration Saved",
        "Forward email updated to <strong>" +
          forwardEmail +
          "</strong>.<br><br><small>Note: A server restart may be required for changes to take full effect.</small>",
        function () {
          loadConfig();
        },
      );
    } else {
      throw new Error(response.message || "Failed to update configuration");
    }
  } catch (error) {
    Modal.close(loadingModal);
    Modal.error("Save Failed", error.message);
  }
}

async function testForward(e) {
  e.preventDefault();

  var loadingModal = Modal.loading("Testing Graph API forward...");

  try {
    var response = await Api.post("/dashboard/test-forward");

    Modal.close(loadingModal);

    if (response.success) {
      Modal.success(
        "Forward Test Passed",
        response.message || "Graph API forward is working correctly.",
      );
    } else {
      throw new Error(response.message || "Forward test failed");
    }
  } catch (error) {
    Modal.close(loadingModal);
    Modal.error("Forward Test Failed", error.message);
  }
}

async function handlePasswordChange(e) {
  e.preventDefault();

  var currentPassword = document.getElementById("current-password").value;
  var newPassword = document.getElementById("new-password").value;
  var confirmPassword = document.getElementById("confirm-password").value;

  if (newPassword !== confirmPassword) {
    Modal.warning("Validation Error", "New passwords do not match.");
    return;
  }

  if (newPassword.length < 6) {
    Modal.warning(
      "Validation Error",
      "Password must be at least 6 characters long.",
    );
    return;
  }

  var loadingModal = Modal.loading("Updating password...");

  try {
    var response = await Api.post("/auth/change-password", {
      currentPassword: currentPassword,
      newPassword: newPassword,
    });

    Modal.close(loadingModal);

    if (response.success) {
      Modal.success(
        "Password Updated",
        "Your password has been changed successfully.",
        function () {
          document.getElementById("password-form").reset();
        },
      );
    } else {
      throw new Error(response.message || "Failed to update password");
    }
  } catch (error) {
    Modal.close(loadingModal);
    Modal.error("Update Failed", error.message);
  }
}

function logout() {
  Auth.logout();
  window.location.href = "/";
}
