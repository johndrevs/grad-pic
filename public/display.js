const emptyState = document.getElementById("empty-state");
const slide = document.getElementById("slide");
const image = document.getElementById("slide-image");
const video = document.getElementById("slide-video");
const caption = document.getElementById("slide-caption");
const settingsSummary = document.getElementById("settings-summary");
const emptyQrImage = document.getElementById("upload-qr");
const slideQrImage = document.getElementById("slide-upload-qr");
const uploadUrlEl = document.getElementById("upload-url");
const slideUploadUrlEl = document.getElementById("slide-upload-url");

const DEFAULT_SETTINGS = {
  durationSeconds: 12,
  loop: true
};
const POLL_MS = 8000;
const SETTINGS_KEY = "gradpic-slideshow-settings";

let photos = [];
let index = 0;
let lastSignature = "";
let settings = loadSettings();
let slideTimer;

function showUploadAddress(uploadUrl) {
  uploadUrlEl.textContent = uploadUrl;
  slideUploadUrlEl.textContent = uploadUrl.replace(/^https?:\/\//, "");
}

async function loadUploadQr() {
  try {
    const response = await fetch("/api/upload-qr", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "QR loading failed.");
    }

    emptyQrImage.src = payload.dataUrl;
    slideQrImage.src = payload.dataUrl;
    emptyQrImage.classList.remove("hidden");
    slideQrImage.classList.remove("hidden");
    showUploadAddress(payload.uploadUrl);
  } catch (_error) {
    showUploadAddress(window.location.origin);
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(raw);
    const durationSeconds = Number(parsed.durationSeconds);

    return {
      durationSeconds:
        Number.isFinite(durationSeconds) && durationSeconds >= 3 && durationSeconds <= 120
          ? durationSeconds
          : DEFAULT_SETTINGS.durationSeconds,
      loop: typeof parsed.loop === "boolean" ? parsed.loop : DEFAULT_SETTINGS.loop
    };
  } catch (_error) {
    return { ...DEFAULT_SETTINGS };
  }
}

function signatureFor(list) {
  return list.map((item) => `${item.name}:${item.addedAt}`).join("|");
}

function renderSettingsSummary() {
  settingsSummary.textContent = `Duration: ${settings.durationSeconds}s - Looping: ${
    settings.loop ? "on" : "off"
  }`;
}

function startSlideTimer() {
  window.clearInterval(slideTimer);
  slideTimer = window.setInterval(() => {
    if (!photos.length) {
      return;
    }

     const currentItem = photos[index % photos.length];
     if (currentItem?.mediaType === "video") {
       return;
     }

    const atLastPhoto = index >= photos.length - 1;
    if (atLastPhoto && !settings.loop) {
      return;
    }

    index = settings.loop ? (index + 1) % photos.length : Math.min(index + 1, photos.length - 1);
    showCurrentPhoto();
  }, settings.durationSeconds * 1000);
}

function reloadSettings() {
  settings = loadSettings();
  renderSettingsSummary();
  startSlideTimer();
}

function showCurrentPhoto() {
  if (!photos.length) {
    video.pause();
    emptyState.classList.remove("hidden");
    slide.classList.add("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  slide.classList.remove("hidden");

  const photo = photos[index % photos.length];
  if (photo.mediaType === "video") {
    image.classList.add("hidden");
    video.classList.remove("hidden");
    video.src = photo.url;
    video.currentTime = 0;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  } else {
    video.pause();
    video.classList.add("hidden");
    image.classList.remove("hidden");
    image.src = `${photo.url}?t=${photo.addedAt}`;
  }

  const position = index % photos.length + 1;
  const suffix = !settings.loop && position === photos.length ? " - End of album" : "";
  const label = photo.mediaType === "video" ? "Video" : "Photo";
  caption.textContent = `${position} / ${photos.length} - ${label}${suffix}`;
}

video.addEventListener("ended", () => {
  const currentItem = photos[index % photos.length];
  if (!currentItem || currentItem.mediaType !== "video") {
    return;
  }

  const atLastPhoto = index >= photos.length - 1;
  if (atLastPhoto && !settings.loop) {
    return;
  }

  index = settings.loop ? (index + 1) % photos.length : Math.min(index + 1, photos.length - 1);
  showCurrentPhoto();
});

async function refreshPhotos() {
  try {
    const response = await fetch("/api/photos", { cache: "no-store" });
    const payload = await response.json();
    const nextPhotos = payload.photos || [];
    const nextSignature = signatureFor(nextPhotos);

    if (nextSignature !== lastSignature) {
      photos = nextPhotos;
      lastSignature = nextSignature;
      index = 0;
      showCurrentPhoto();
    }
  } catch (_error) {
    // Slideshow should keep running even if a poll fails.
  }
}

setInterval(refreshPhotos, POLL_MS);
window.addEventListener("storage", (event) => {
  if (event.key === SETTINGS_KEY) {
    reloadSettings();
  }
});

renderSettingsSummary();
startSlideTimer();
loadUploadQr();
refreshPhotos();
