const SETTINGS_KEY = "gradpic-slideshow-settings";
const DEFAULT_SETTINGS = {
  durationSeconds: 12,
  loop: true
};

const form = document.getElementById("settings-form");
const durationInput = document.getElementById("duration-seconds");
const loopInput = document.getElementById("loop-enabled");
const statusEl = document.getElementById("settings-status");

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

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const initialSettings = loadSettings();
durationInput.value = String(initialSettings.durationSeconds);
loopInput.checked = initialSettings.loop;
statusEl.textContent = `Current settings: ${initialSettings.durationSeconds}s, looping ${
  initialSettings.loop ? "on" : "off"
}.`;

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const durationSeconds = Math.min(
    120,
    Math.max(3, Number(durationInput.value) || DEFAULT_SETTINGS.durationSeconds)
  );
  const nextSettings = {
    durationSeconds,
    loop: loopInput.checked
  };

  durationInput.value = String(durationSeconds);
  saveSettings(nextSettings);
  statusEl.textContent = `Saved: ${durationSeconds}s per slide, looping ${
    nextSettings.loop ? "on" : "off"
  }. Refresh the slideshow page if it is open in a different browser or device.`;
});
