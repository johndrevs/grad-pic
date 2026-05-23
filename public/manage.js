const gridEl = document.getElementById("photo-grid");
const statusEl = document.getElementById("manage-status");
const summaryEl = document.getElementById("selection-summary");
const selectAllButton = document.getElementById("select-all");
const selectDuplicatesButton = document.getElementById("select-duplicates");
const clearSelectionButton = document.getElementById("clear-selection");
const refreshButton = document.getElementById("refresh-photos");
const deleteButton = document.getElementById("delete-selected");
const logoutButton = document.getElementById("manage-logout");

let photos = [];
const selectedIds = new Set();

function duplicateIds() {
  const grouped = new Map();

  for (const photo of photos) {
    if (!photo.fingerprint) {
      continue;
    }

    const group = grouped.get(photo.fingerprint) || [];
    group.push(photo);
    grouped.set(photo.fingerprint, group);
  }

  const ids = [];
  for (const group of grouped.values()) {
    if (group.length < 2) {
      continue;
    }

    group.sort((a, b) => a.addedAt - b.addedAt);
    for (const duplicate of group.slice(1)) {
      ids.push(duplicate.id);
    }
  }

  return ids;
}

function updateSelectionSummary() {
  const total = photos.length;
  const selected = selectedIds.size;
  const duplicates = duplicateIds().length;
  const duplicateLabel = duplicates ? ` - ${duplicates} duplicate${duplicates === 1 ? "" : "s"} found` : "";
  summaryEl.textContent = `${selected} selected${total ? ` of ${total}` : ""}${duplicateLabel}`;
  deleteButton.disabled = selected === 0;
}

function formatTimestamp(value) {
  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return "";
  }
}

function renderPhotos() {
  gridEl.innerHTML = "";
  const duplicateIdSet = new Set(duplicateIds());

  if (!photos.length) {
    gridEl.innerHTML = '<p class="muted">No uploaded photos to manage yet.</p>';
    updateSelectionSummary();
    return;
  }

  for (const photo of photos) {
    const card = document.createElement("label");
    card.className = "manage-card";
    const isDuplicate = duplicateIdSet.has(photo.id);
    if (selectedIds.has(photo.id)) {
      card.classList.add("is-selected");
    }
    if (isDuplicate) {
      card.classList.add("is-duplicate");
    }

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "manage-checkbox";
    checkbox.checked = selectedIds.has(photo.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedIds.add(photo.id);
        card.classList.add("is-selected");
      } else {
        selectedIds.delete(photo.id);
        card.classList.remove("is-selected");
      }

      updateSelectionSummary();
    });

    const preview =
      photo.mediaType === "video" ? document.createElement("video") : document.createElement("img");

    preview.src = `${photo.url}${photo.mediaType === "image" ? `?t=${photo.addedAt}` : ""}`;
    preview.className = "manage-image";

    if (photo.mediaType === "video") {
      preview.muted = true;
      preview.playsInline = true;
      preview.preload = "metadata";
      preview.setAttribute("aria-label", photo.name);
    } else {
      preview.alt = photo.name;
      preview.loading = "lazy";
    }

    const meta = document.createElement("div");
    meta.className = "manage-meta";
    meta.innerHTML = `
      <strong>${photo.name}</strong>
      ${isDuplicate ? '<span class="duplicate-badge">Duplicate</span>' : ""}
      <span>${photo.mediaType === "video" ? "Video" : "Photo"}</span>
      <span>${formatTimestamp(photo.addedAt)}</span>
    `;

    card.append(checkbox, preview, meta);
    gridEl.append(card);
  }

  updateSelectionSummary();
}

async function loadPhotos() {
  statusEl.textContent = "Loading photos...";

  try {
    const response = await fetch("/api/photos", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not load photos.");
    }

    photos = payload.photos || [];

    for (const id of [...selectedIds]) {
      if (!photos.some((photo) => photo.id === id)) {
        selectedIds.delete(id);
      }
    }

    renderPhotos();
    statusEl.textContent = `Loaded ${photos.length} photo(s).`;
  } catch (error) {
    statusEl.textContent = error.message;
  }
}

async function deleteSelected() {
  const ids = [...selectedIds];
  if (!ids.length) {
    statusEl.textContent = "Choose at least one photo to delete.";
    return;
  }

  deleteButton.disabled = true;
  statusEl.textContent = `Deleting ${ids.length} photo(s)...`;

  try {
    const response = await fetch("/api/photos", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ids })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Delete failed.");
    }

    selectedIds.clear();
    photos = payload.photos || [];
    renderPhotos();
    statusEl.textContent = `Deleted ${payload.deleted.length} photo(s).`;
  } catch (error) {
    statusEl.textContent = error.message;
    updateSelectionSummary();
  }
}

selectAllButton.addEventListener("click", () => {
  for (const photo of photos) {
    selectedIds.add(photo.id);
  }

  renderPhotos();
});

selectDuplicatesButton.addEventListener("click", () => {
  selectedIds.clear();
  for (const id of duplicateIds()) {
    selectedIds.add(id);
  }

  renderPhotos();
});

clearSelectionButton.addEventListener("click", () => {
  selectedIds.clear();
  renderPhotos();
});

refreshButton.addEventListener("click", loadPhotos);
deleteButton.addEventListener("click", deleteSelected);
logoutButton.addEventListener("click", async () => {
  await fetch("/api/admin/logout", {
    method: "POST"
  });
  window.location.href = "/manage-login.html";
});

loadPhotos();
