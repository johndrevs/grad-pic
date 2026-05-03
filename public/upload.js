const form = document.getElementById("upload-form");
const input = document.getElementById("photos");
const statusEl = document.getElementById("status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!input.files.length) {
    statusEl.textContent = "Choose at least one photo first.";
    return;
  }

  const formData = new FormData();
  for (const file of input.files) {
    formData.append("photos", file);
  }

  statusEl.textContent = `Uploading ${input.files.length} photo(s)...`;

  try {
    const response = await fetch("/api/photos", {
      method: "POST",
      body: formData
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Upload failed.");
    }

    form.reset();
    statusEl.textContent = `Uploaded ${payload.uploaded} photo(s). Slideshow now has ${payload.photos.length}.`;
  } catch (error) {
    statusEl.textContent = error.message;
  }
});
