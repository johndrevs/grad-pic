const gridEl = document.getElementById("photo-grid");
const statusEl = document.getElementById("manage-status");
const summaryEl = document.getElementById("selection-summary");
const selectAllButton = document.getElementById("select-all");
const clearSelectionButton = document.getElementById("clear-selection");
const refreshButton = document.getElementById("refresh-photos");
const deleteButton = document.getElementById("delete-selected");

let photos = [];
const selectedIds = new Set();

function updateSelectionSummary() {
  const total = photos.length;
  const selected = selectedIds.size;
  summaryEl.textContent = `${selected} selected${total ? ` of ${total}` : ""}`;
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

  if (!photos.length) {
    gridEl.innerHTML = '<p class="muted">No uploaded photos to manage yet.</p>';
    updateSelectionSummary();
    return;
  }

  for (const photo of photos) {
    const card = document.createElement("label");
    card.className = "manage-card";
    if (selectedIds.has(photo.id)) {
      card.classList.add("is-selected");
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

    const image = document.createElement("img");
    image.src = `${photo.url}?t=${photo.addedAt}`;
    image.alt = photo.name;
    image.loading = "lazy";
    image.className = "manage-image";

    const meta = document.createElement("div");
    meta.className = "manage-meta";
    meta.innerHTML = `
      <strong>${photo.name}</strong>
      <span>${formatTimestamp(photo.addedAt)}</span>
    `;

    card.append(checkbox, image, meta);
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

clearSelectionButton.addEventListener("click", () => {
  selectedIds.clear();
  renderPhotos();
});

refreshButton.addEventListener("click", loadPhotos);
deleteButton.addEventListener("click", deleteSelected);

loadPhotos();
