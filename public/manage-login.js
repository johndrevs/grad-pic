const form = document.getElementById("manage-login-form");
const passwordInput = document.getElementById("manage-password");
const statusEl = document.getElementById("manage-login-status");

async function readPayload(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch (_error) {
    return { error: text || `Request failed with status ${response.status}.` };
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  statusEl.textContent = "Checking password...";

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        password: passwordInput.value
      })
    });
    const payload = await readPayload(response);

    if (!response.ok) {
      throw new Error(payload.error || "Login failed.");
    }

    window.location.href = "/manage.html";
  } catch (error) {
    statusEl.textContent = error.message;
  }
});
