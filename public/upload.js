const form = document.getElementById("upload-form");
const input = document.getElementById("photos");
const statusEl = document.getElementById("status");
const selectedFilesEl = document.getElementById("selected-files");
const uploadButton = document.getElementById("upload-button");
let supabaseModulePromise;

function buildPhotoName(originalName, fingerprint = "") {
  const stamp = Date.now();
  const nonce = Math.random().toString(36).slice(2, 8);
  const dotIndex = originalName.lastIndexOf(".");
  const ext = dotIndex >= 0 ? originalName.slice(dotIndex).toLowerCase() : "";
  const base = (dotIndex >= 0 ? originalName.slice(0, dotIndex) : originalName)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "photo";
  const fingerprintPrefix = /^[a-f0-9]{64}$/i.test(fingerprint) ? `${fingerprint.toLowerCase()}-` : "";

  return `photos/${fingerprintPrefix}${stamp}-${nonce}-${base}${ext}`;
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
  const currentPhotosResponse = await fetch("/api/photos", { cache: "no-store" });
  const currentPhotosPayload = await readJsonOrText(currentPhotosResponse);

  if (!currentPhotosResponse.ok) {
    throw new Error(currentPhotosPayload.error || "Could not check existing uploads.");
  }

  const existingFingerprints = new Set(
    (currentPhotosPayload.photos || []).map((photo) => photo.fingerprint).filter(Boolean)
  );
  const batchFingerprints = new Set();
  const uploadEntries = [];
  const skippedDuplicates = [];

  statusEl.textContent = "Checking for duplicates...";

  for (const file of files) {
    const fingerprint = await fingerprintFile(file);

    if (existingFingerprints.has(fingerprint) || batchFingerprints.has(fingerprint)) {
      skippedDuplicates.push(file.name);
      continue;
    }

    batchFingerprints.add(fingerprint);
    uploadEntries.push({
      file,
      fingerprint
    });
  }

  if (!uploadEntries.length) {
    return {
      uploaded: 0,
      photos: currentPhotosPayload.photos || [],
      skippedDuplicates
    };
  }

  for (const [index, entry] of uploadEntries.entries()) {
    statusEl.textContent = `Uploading ${index + 1} of ${uploadEntries.length} file(s)...`;

    const path = buildPhotoName(entry.file.name, entry.fingerprint);
    const signedUrlResponse = await fetch("/api/supabase/upload-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        path,
        contentType: entry.file.type
      })
    });
    const signedUrlPayload = await readJsonOrText(signedUrlResponse);

    if (!signedUrlResponse.ok) {
      throw new Error(signedUrlPayload.error || "Could not prepare upload.");
    }

    const { error } = await supabase.storage.from(config.supabaseBucket).uploadToSignedUrl(
      signedUrlPayload.path,
      signedUrlPayload.token,
      entry.file,
      {
        contentType: entry.file.type || undefined,
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
    uploaded: uploadEntries.length,
    photos: payload.photos || [],
    skippedDuplicates
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

async function fingerprintFile(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function updateSelectedFilesState() {
  const files = [...(input.files || [])];

  if (!files.length) {
    selectedFilesEl.textContent = "No files selected yet.";
    uploadButton.classList.add("hidden");
    return;
  }

  if (files.length === 1) {
    selectedFilesEl.textContent = `Ready to upload: ${files[0].name}`;
  } else {
    selectedFilesEl.textContent = `Ready to upload ${files.length} files.`;
  }

  uploadButton.classList.remove("hidden");
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
    updateSelectedFilesState();
    const duplicateNote = payload.skippedDuplicates?.length
      ? ` Skipped ${payload.skippedDuplicates.length} duplicate file(s).`
      : "";
    statusEl.textContent = `Uploaded ${payload.uploaded} file(s). Slideshow now has ${payload.photos.length}.${duplicateNote}`;
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

input.addEventListener("change", updateSelectedFilesState);
updateSelectedFilesState();
