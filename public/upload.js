const form = document.getElementById("upload-form");
const input = document.getElementById("photos");
const statusEl = document.getElementById("status");
let supabaseModulePromise;

function buildPhotoName(originalName) {
  const stamp = Date.now();
  const nonce = Math.random().toString(36).slice(2, 8);
  const dotIndex = originalName.lastIndexOf(".");
  const ext = dotIndex >= 0 ? originalName.slice(dotIndex).toLowerCase() : "";
  const base = (dotIndex >= 0 ? originalName.slice(0, dotIndex) : originalName)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "photo";

  return `photos/${stamp}-${nonce}-${base}${ext}`;
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

async function uploadViaSupabase(files) {
  supabaseModulePromise ||= import("https://esm.sh/@supabase/supabase-js@2");
  const { createClient } = await supabaseModulePromise;
  const config = await getUploadConfig();
  const supabase = createClient(config.supabaseUrl, config.supabaseClientKey);

  for (const [index, file] of files.entries()) {
    statusEl.textContent = `Uploading ${index + 1} of ${files.length} photo(s)...`;

    const path = buildPhotoName(file.name);
    const signedUrlResponse = await fetch("/api/supabase/upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        path,
        contentType: file.type
      })
    });
    const signedUrlPayload = await readJsonOrText(signedUrlResponse);

    if (!signedUrlResponse.ok) {
      throw new Error(signedUrlPayload.error || "Could not prepare upload.");
    }

    const { error } = await supabase.storage.from(config.supabaseBucket).uploadToSignedUrl(
      signedUrlPayload.path,
      signedUrlPayload.token,
      file,
      {
        contentType: file.type || undefined,
        upsert: false
      }
    );

    if (error) {
      throw new Error(error.message || "Upload failed.");
    }
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
    const payload = config.useSupabaseStorage ? await uploadViaSupabase(files) : await uploadViaServer(files);

    form.reset();
    statusEl.textContent = `Uploaded ${payload.uploaded} photo(s). Slideshow now has ${payload.photos.length}.`;
  } catch (error) {
    statusEl.textContent = error.message;
  }
});
