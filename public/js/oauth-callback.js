// OAuth callback page script
document.addEventListener("DOMContentLoaded", function () {
  handleCallback();
});

async function handleCallback() {
  // Get URL parameters
  var urlParams = new URLSearchParams(window.location.search);
  var code = urlParams.get("code");
  var error = urlParams.get("error");
  var errorDescription = urlParams.get("error_description");

  // Check for success redirect (from server after OAuth complete)
  var success = urlParams.get("success");
  var email = urlParams.get("email");

  var loadingState = document.getElementById("loading-state");
  var successState = document.getElementById("success-state");
  var errorState = document.getElementById("error-state");

  // Handle success redirect from server
  if (success === "true") {
    loadingState.classList.add("hidden");
    successState.classList.remove("hidden");
    document.getElementById("success-email").textContent =
      "Successfully connected: " +
      (email ? decodeURIComponent(email) : "New Account");
    return;
  }

  if (error) {
    // OAuth error
    loadingState.classList.add("hidden");
    errorState.classList.remove("hidden");
    document.getElementById("error-message").textContent =
      errorDescription || error;
    return;
  }

  if (!code) {
    loadingState.classList.add("hidden");
    errorState.classList.remove("hidden");
    document.getElementById("error-message").textContent =
      "No authorization code received";
    return;
  }

  try {
    // Exchange code for tokens
    var response = await Api.post("/accounts/oauth/callback", { code: code });

    if (response.success) {
      loadingState.classList.add("hidden");
      successState.classList.remove("hidden");
      document.getElementById("success-email").textContent =
        "Successfully connected: " + (response.data.email || "New Account");
    } else {
      throw new Error(response.message || "Failed to connect account");
    }
  } catch (err) {
    loadingState.classList.add("hidden");
    errorState.classList.remove("hidden");
    document.getElementById("error-message").textContent = err.message;
  }
}
