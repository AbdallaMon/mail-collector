// Login page script
document.addEventListener("DOMContentLoaded", function () {
  // Redirect if already logged in
  if (Auth.isLoggedIn()) {
    window.location.href = "/dashboard.html";
    return;
  }

  const form = document.getElementById("login-form");
  const errorAlert = document.getElementById("error-alert");
  const errorText = document.getElementById("error-text");
  const loginBtn = document.getElementById("login-btn");
  const btnText = document.getElementById("btn-text");
  const btnSpinner = document.getElementById("btn-spinner");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    // Show loading state
    loginBtn.disabled = true;
    btnText.textContent = "Signing in...";
    btnSpinner.classList.remove("hidden");
    errorAlert.classList.add("hidden");

    try {
      const response = await Api.post("/auth/login", { email, password });

      if (response.success) {
        Auth.login(response.data.token, response.data.user);
        window.location.href = "/dashboard.html";
      } else {
        throw new Error(response.message || "Login failed");
      }
    } catch (error) {
      errorText.textContent = error.message || "Invalid email or password";
      errorAlert.classList.remove("hidden");
    } finally {
      loginBtn.disabled = false;
      btnText.textContent = "Sign In";
      btnSpinner.classList.add("hidden");
    }
  });
});
