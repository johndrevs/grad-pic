const form = document.getElementById("upload-form");
const input = document.getElementById("photos");
const statusEl = document.getElementById("status");
let blobUploadModulePromise;

function buildPhotoName(originalName) {
  const stamp = Date.now();
  const dotIndex = originalName.lastIndexOf(".");
  const ext = dotIndex >= 0 ? originalName.slice(dotIndex).toLowerCase() : "";
  const base = (dotIndex >= 0 ? originalName.slice(0, dotIndex) : originalName)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "photo";

  return `photos/${stamp}-${base}${ext}`;
}

async function readJsonOrText(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch (_error) {
    return { error: text || `Request failed with status ${response.status}.` };
  }
}

async function uploadViaServer(files) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("photos", file);
  }

  const response = await fetch("/api/photos", {
    method: "POST",
    body: formData
  });
  const payload = await readJsonOrText(response);

  if (!response.ok) {
    throw new Error(payload.error || "Upload failed.");
  }

  return payload;
}

async function uploadViaBlob(files) {
  blobUploadModulePromise ||= import("https://esm.sh/@vercel/blob/client");
  const { upload } = await blobUploadModulePromise;

  for (const [index, file] of files.entries()) {
    statusEl.textContent = `Uploading ${index + 1} of ${files.length} photo(s)...`;

    await upload(buildPhotoName(file.name), file, {
      access: "public",
      handleUploadUrl: "/api/blob/upload",
      multipart: true
    });
  }

  const response = await fetch("/api/photos", { cache: "no-store" });
  const payload = await readJsonOrText(response);

  if (!response.ok) {
    throw new Error(payload.error || "Upload finished, but refreshing the gallery failed.");
  }

  return {
    uploaded: files.length,
    photos: payload.photos || []
  };
}

async function getUploadConfig() {
  const response = await fetch("/api/upload-config", { cache: "no-store" });
  const payload = await readJsonOrText(response);

  if (!response.ok) {
    throw new Error(payload.error || "Could not load upload configuration.");
  }

  return payload;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const files = [...(input.files || [])];
  if (!files.length) {
    statusEl.textContent = "Choose at least one photo first.";
    return;
  }

  statusEl.textContent = `Uploading ${files.length} photo(s)...`;

  try {
    const config = await getUploadConfig();
    const payload = config.useBlobStorage ? await uploadViaBlob(files) : await uploadViaServer(files);

    form.reset();
    statusEl.textContent = `Uploaded ${payload.uploaded} photo(s). Slideshow now has ${payload.photos.length}.`;
  } catch (error) {
    statusEl.textContent = error.message;
  }
});
