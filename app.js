import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

// --- Firebase config (Froggy Bot project) ---
const firebaseConfig = {
  apiKey: "AIzaSyCjYk3SPsw9LgOK3cpN1p8wGLqC5cgCES8",
  authDomain: "froggy-bot-61876.firebaseapp.com",
  projectId: "froggy-bot-61876",
  storageBucket: "froggy-bot-61876.firebasestorage.app",
  messagingSenderId: "1061079883264",
  appId: "1:1061079883264:web:121e4c391b92063b0682e5",
  measurementId: "G-HMMCMBL421",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const gameRef = doc(db, "games", "current");

let currentUid = null;
let currentName = null;
let currentIcon = null;
let selectedIconInModal = null;

// ---------- DOM refs ----------
const userBadge = document.getElementById("userBadge");
const userBadgeIcon = document.getElementById("userBadgeIcon");
const userBadgeName = document.getElementById("userBadgeName");

const nameModalOverlay = document.getElementById("nameModalOverlay");
const nameModalTitle = document.getElementById("nameModalTitle");
const nameInput = document.getElementById("nameInput");
const iconGrid = document.getElementById("iconGrid");
const profileHint = document.getElementById("profileHint");
const nameSaveBtn = document.getElementById("nameSaveBtn");
const nameCancelBtn = document.getElementById("nameCancelBtn");

const idleView = document.getElementById("idleView");
const activeView = document.getElementById("activeView");
const startGameBtn = document.getElementById("startGameBtn");
const sendItBtn = document.getElementById("sendItBtn");
const tracksContainer = document.getElementById("tracksContainer");
const voteMessage = document.getElementById("voteMessage");

const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

const categoryCheckboxes = document.querySelectorAll(".category-filter");
const unreleasedFilter = document.getElementById("unreleasedFilter");
const secretToggleLabel = document.getElementById("secretToggleLabel");
const gambleBtn = document.getElementById("gambleBtn");
const carResult = document.getElementById("carResult");

const paletteBtn = document.getElementById("paletteBtn");
const themeModalOverlay = document.getElementById("themeModalOverlay");
const themeFieldsContainer = document.getElementById("themeFieldsContainer");
const themeResetBtn = document.getElementById("themeResetBtn");
const themeCloseBtn = document.getElementById("themeCloseBtn");

const volumeBtn = document.getElementById("volumeBtn");

// ---------- Sound effects via Web Audio API ----------

const SOUND_STORAGE_KEY = "froggybot-muted";

let isMuted = false;
try {
  isMuted = localStorage.getItem(SOUND_STORAGE_KEY) === "1";
} catch (error) {
  isMuted = false;
}

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// freq in Hz, startOffset/duration in seconds from "now".
function beep(freq, startOffset, duration, type = "square", volume = 0.15) {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;

    const startTime = ctx.currentTime + startOffset;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  } catch (error) {
    console.error("Sound error:", error);
  }
}

function playClick() {
  beep(520, 0, 0.05, "square", 0.12);
}

function playVote() {
  beep(500, 0, 0.06, "square", 0.14);
  beep(760, 0.05, 0.09, "square", 0.14);
}

function playStart() {
  beep(392, 0, 0.07, "square", 0.13);
  beep(523, 0.07, 0.07, "square", 0.13);
  beep(659, 0.14, 0.1, "square", 0.13);
}

function playEnd() {
  beep(523, 0, 0.07, "square", 0.13);
  beep(392, 0.07, 0.07, "square", 0.13);
  beep(262, 0.14, 0.12, "square", 0.13);
}

function playSpinTick() {
  beep(300 + Math.random() * 200, 0, 0.02, "square", 0.05);
}

function playReveal() {
  beep(659, 0, 0.08, "square", 0.15);
  beep(880, 0.08, 0.12, "square", 0.15);
}

function playLegendary() {
  const notes = [523, 659, 784, 1047, 1319];
  notes.forEach((freq, i) => beep(freq, i * 0.09, 0.16, "square", 0.16));
  beep(1568, notes.length * 0.09, 0.35, "triangle", 0.12);
}

volumeBtn.classList.toggle("muted", isMuted);
volumeBtn.addEventListener("click", () => {
  isMuted = !isMuted;
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, isMuted ? "1" : "0");
  } catch (error) {
    console.error("Error saving mute setting:", error);
  }
  volumeBtn.classList.toggle("muted", isMuted);
  if (!isMuted) playClick(); // audible confirmation that sound is back on
});

// Generic click sound for any plain button/checkbox that doesn't already
// play something more specific (those are marked data-sound="custom").
document.addEventListener("click", (event) => {
  const target = event.target.closest("button, .checkbox-label");
  if (!target || target.dataset.sound === "custom") return;
  playClick();
});

// ---------- Auth ----------
signInAnonymously(auth).catch((error) => {
  console.error("Anonymous login error:", error.code, error.message);
});

let appStarted = false;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    currentUid = null;
    return;
  }

  currentUid = user.uid;
  console.log("Anonymous user connected. UID:", currentUid);

  // Only run the one-time setup the first time we get a signed-in user.
  if (!appStarted) {
    appStarted = true;
    initUserProfile();
    listenToGame();
  }
});

// ---------- User profile (name + icon), stored in Firestore under users/{uid} ----------
async function initUserProfile() {
  try {
    const userRef = doc(db, "users", currentUid);
    const snap = await getDoc(userRef);
    const data = snap.exists() ? snap.data() : null;

    if (data && data.name && data.icon) {
      currentName = data.name;
      currentIcon = data.icon;
      updateUserBadge();
    } else {
      openNameModal("create");
    }
  } catch (error) {
    console.error("Error loading user profile:", error);
    openNameModal("create");
  }
}

function updateUserBadge() {
  userBadgeName.textContent = currentName;
  userBadgeIcon.src = `FroggySprites/${currentIcon}`;
  userBadgeIcon.classList.remove("hidden");
}

function buildIconGrid() {
  iconGrid.innerHTML = "";

  iconPool.forEach((fileName) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "icon-option";
    if (fileName === selectedIconInModal) option.classList.add("selected");

    option.innerHTML = `<img src="FroggySprites/${fileName}" alt="${fileName.replace("froggy_", "").replace(".png", "")}" />`;

    option.addEventListener("click", () => {
      selectedIconInModal = fileName;
      iconGrid.querySelectorAll(".icon-option").forEach((el) => el.classList.remove("selected"));
      option.classList.add("selected");
      profileHint.textContent = "";
    });

    iconGrid.appendChild(option);
  });
}

function openNameModal(mode) {
  nameInput.value = mode === "edit" ? currentName || "" : "";
  selectedIconInModal = mode === "edit" ? currentIcon : null;
  nameModalTitle.textContent = mode === "edit" ? "EDIT YOUR PROFILE" : "SET UP YOUR PROFILE";
  nameCancelBtn.classList.toggle("hidden", mode !== "edit");
  profileHint.textContent = "";
  nameModalOverlay.dataset.mode = mode;
  buildIconGrid();
  nameModalOverlay.classList.remove("hidden");
  nameInput.focus();
}

function closeNameModal() {
  nameModalOverlay.classList.add("hidden");
}

async function saveName() {
  const value = nameInput.value.trim();
  if (!value) {
    profileHint.textContent = "Pick a name first.";
    nameInput.focus();
    return;
  }
  if (!selectedIconInModal) {
    profileHint.textContent = "Pick an icon too!";
    return;
  }

  nameSaveBtn.disabled = true;
  try {
    const userRef = doc(db, "users", currentUid);
    await setDoc(userRef, { name: value, icon: selectedIconInModal }, { merge: true });
    currentName = value;
    currentIcon = selectedIconInModal;
    updateUserBadge();
    closeNameModal();
  } catch (error) {
    console.error("Error saving profile:", error);
  } finally {
    nameSaveBtn.disabled = false;
  }
}

nameSaveBtn.addEventListener("click", saveName);
nameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") saveName();
});
nameCancelBtn.addEventListener("click", closeNameModal);
userBadge.addEventListener("click", () => openNameModal("edit"));

// ---------- Tabs ----------
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabPanels.forEach((p) => p.classList.add("hidden"));

    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
  });
});

// ---------- Game round lifecycle (idle <-> active) ----------
function listenToGame() {
  onSnapshot(
    gameRef,
    (snap) => {
      if (!snap.exists()) {
        showIdleView();
        return;
      }

      const data = snap.data();
      const votedUsers = data.votedUsers || [];
      const alreadyVoted = currentUid ? votedUsers.includes(currentUid) : false;
      showActiveView(data.tracks || {}, alreadyVoted);
    },
    (error) => {
      console.error("Error listening to the current game:", error);
    }
  );
}

function showIdleView() {
  idleView.classList.remove("hidden");
  activeView.classList.add("hidden");
}

function showActiveView(tracks, alreadyVoted) {
  idleView.classList.add("hidden");
  activeView.classList.remove("hidden");
  renderTracks(tracks, alreadyVoted);
}

function pickRandomTracks(amount = 5) {
  const copy = [...trackPool];
  const chosen = [];

  while (chosen.length < amount && copy.length > 0) {
    const index = Math.floor(Math.random() * copy.length);
    chosen.push(copy[index]);
    copy.splice(index, 1);
  }

  return chosen;
}

async function startGame() {
  startGameBtn.disabled = true;
  playStart();
  try {
    const chosen = pickRandomTracks(5);
    const tracksData = {};
    chosen.forEach((track) => {
      tracksData[track.id] = { name: track.name, creator: track.creator, votes: 0, voters: [] };
    });

    await setDoc(gameRef, {
      tracks: tracksData,
      votedUsers: [],
    });
  } catch (error) {
    console.error("Error starting game:", error);
  } finally {
    startGameBtn.disabled = false;
  }
}

startGameBtn.addEventListener("click", startGame);

async function sendIt() {
  sendItBtn.disabled = true;
  playEnd();
  try {
    await deleteDoc(gameRef);
  } catch (error) {
    console.error("Error sending it:", error);
  } finally {
    sendItBtn.disabled = false;
  }
}

sendItBtn.addEventListener("click", sendIt);

// ---------- Track voting ----------
function renderTracks(tracksObj, alreadyVoted) {
  tracksContainer.innerHTML = "";

  Object.entries(tracksObj).forEach(([trackId, info]) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "track-card";
    card.dataset.sound = "custom";
    card.disabled = alreadyVoted;

    const voters = info.voters || [];
    const votersHtml = voters
      .map((v) => `<img src="FroggySprites/${v.icon}" alt="" title="${v.name || ""}" />`)
      .join("");

    card.innerHTML = `
      <div class="track-info">
        <span class="track-name">${info.name}</span>
        <span class="track-creator">by ${info.creator}</span>
      </div>
      <div class="track-right">
        <div class="track-voters">${votersHtml}</div>
        <span class="track-votes">${info.votes}</span>
      </div>
    `;

    card.addEventListener("click", () => voteForTrack(trackId, card));
    tracksContainer.appendChild(card);
  });

  voteMessage.textContent = alreadyVoted ? "Your vote is in!" : "";
}

async function voteForTrack(trackId, cardElement) {
  if (!currentUid) return;

  playVote();
  tracksContainer.querySelectorAll(".track-card").forEach((c) => (c.disabled = true));
  cardElement.classList.add("voting");

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(gameRef);
      if (!snap.exists()) throw new Error("NO_GAME");

      const data = snap.data();
      const votedUsers = data.votedUsers || [];
      if (votedUsers.includes(currentUid)) throw new Error("ALREADY_VOTED");

      const track = data.tracks ? data.tracks[trackId] : null;
      if (!track) throw new Error("NO_TRACK");

      const updatedVoters = [
        ...(track.voters || []),
        { uid: currentUid, icon: currentIcon, name: currentName },
      ];

      transaction.update(gameRef, {
        [`tracks.${trackId}.votes`]: (track.votes || 0) + 1,
        [`tracks.${trackId}.voters`]: updatedVoters,
        votedUsers: arrayUnion(currentUid),
      });
    });
  } catch (error) {
    if (error.message === "ALREADY_VOTED") {
      voteMessage.textContent = "You already voted in this round.";
    } else {
      console.error("Error voting:", error);
      voteMessage.textContent = "Something went wrong. Try again.";
      tracksContainer.querySelectorAll(".track-card").forEach((c) => (c.disabled = false));
    }
    cardElement.classList.remove("voting");
  }
}

// ---------- Garage: random car with category filters ----------
function getSelectedCategories() {
  return Array.from(categoryCheckboxes)
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

function updateGambleButtonState() {
  gambleBtn.disabled = getSelectedCategories().length === 0;
}

categoryCheckboxes.forEach((cb) => cb.addEventListener("change", updateGambleButtonState));
updateGambleButtonState();

unreleasedFilter.addEventListener("change", (event) => {
  if (event.target.checked) {
    secretToggleLabel.classList.add("revealed");
  } else {
    secretToggleLabel.classList.remove("revealed");
  }
});

function spawnSparkles(container, count) {
  const colors = ["var(--gold)", "var(--pink)", "var(--cyan)"];

  for (let i = 0; i < count; i++) {
    const sparkle = document.createElement("div");
    sparkle.className = "sparkle";
    sparkle.style.left = `${-5 + Math.random() * 110}%`;
    sparkle.style.top = `${-5 + Math.random() * 110}%`;
    sparkle.style.setProperty("--sparkle-color", colors[i % colors.length]);
    sparkle.style.animationDelay = `${Math.random() * 0.4}s`;
    sparkle.addEventListener("animationend", () => sparkle.remove(), { once: true });
    container.appendChild(sparkle);
  }
}

function spinForCar() {
  const categories = getSelectedCategories();
  const includeUnreleased = unreleasedFilter.checked;
  
  const pool = carPool.filter((car) => {
    const matchesCategory = categories.includes(car.category);
    const matchesReleaseStatus = includeUnreleased ? true : car.released === true;
    return matchesCategory && matchesReleaseStatus;
  });

  if (pool.length === 0) {
    carResult.innerHTML = "<p>No cars match those categories.</p>";
    return;
  }

  gambleBtn.disabled = true;
  carResult.classList.remove("locked-in", "legendary");
  carResult.classList.add("spinning");

  const spinDurationMs = 1600;
  const tickMs = 90;
  const startedAt = Date.now();

  const spinInterval = setInterval(() => {
    const randomCar = pool[Math.floor(Math.random() * pool.length)];
    carResult.innerHTML = `
      <p class="car-name">${randomCar.name}</p>
      <p class="car-category">${randomCar.category.toUpperCase()}</p>
    `;
    playSpinTick();

    if (Date.now() - startedAt >= spinDurationMs) {
      clearInterval(spinInterval);

      const finalCar = pool[Math.floor(Math.random() * pool.length)];
      const isLegendary = finalCar.name.toUpperCase().includes("STH");

      carResult.innerHTML = `
        <p class="car-name">${finalCar.name}</p>
        <p class="car-category">${finalCar.category.toUpperCase()}</p>
        ${isLegendary ? '<p class="sth-badge">★ SUPER TREASURE HUNT ★</p>' : ""}
      `;
      carResult.classList.remove("spinning");
      carResult.classList.add("locked-in");

      if (isLegendary) {
        carResult.classList.add("legendary");
        spawnSparkles(carResult, 14);
        playLegendary();
      } else {
        playReveal();
      }

      gambleBtn.disabled = false;
    }
  }, tickMs);
}

gambleBtn.addEventListener("click", spinForCar);

// ---------- Theme customizer (localStorage) ----------

const THEME_STORAGE_KEY = "froggybot-theme";

// key -> the actual CSS custom property it controls
const THEME_FIELDS = [
  { key: "bg", varName: "--bg" },
  { key: "panel", varName: "--panel" },
  { key: "primary", varName: "--pink" },
  { key: "secondary", varName: "--cyan" },
  { key: "accent", varName: "--gold" },
];

const PRESETS = [
  { name: "Classic", bg: "#14101f", panel: "#241b3d", primary: "#ff4fa3", secondary: "#4cffea", accent: "#ffc857" },
  { name: "Sunset", bg: "#1f1022", panel: "#3a1b2e", primary: "#ff6b35", secondary: "#ff2e63", accent: "#ffd23f" },
  { name: "Coral", bg: "#0b132b", panel: "#1c2541", primary: "#ff6b6b", secondary: "#4ecdc4", accent: "#ffe66d" },
  { name: "Neon", bg: "#0d1b0d", panel: "#1a2e1a", primary: "#39ff14", secondary: "#ff00ff", accent: "#faff00" },
  { name: "Bubblegum", bg: "#1a1025", panel: "#2d1b3d", primary: "#ff85a2", secondary: "#b28dff", accent: "#7bf1a8" },
  { name: "NES", bg: "#0f0f0f", panel: "#232323", primary: "#e0e0e0", secondary: "#8a8a8a", accent: "#ff3b3b" },
  { name: "Desert", bg: "#1c1410", panel: "#3a2a1d", primary: "#e8743b", secondary: "#2ec4b6", accent: "#ffd166" },
  { name: "Cyberpunk", bg: "#0a0e1a", panel: "#141b2e", primary: "#f72585", secondary: "#4cc9f0", accent: "#ffea00" },
  { name: "Froggy", bg: "#0f1f14", panel: "#1e3625", primary: "#4caf50", secondary: "#8b5e34", accent: "#ffca28" },
];

const DEFAULT_THEME = { ...PRESETS[0] };

let currentTheme = { ...DEFAULT_THEME };

function isSameTheme(a, b) {
  return THEME_FIELDS.every(({ key }) => a[key] === b[key]);
}

// Simple lighten: blend each RGB channel toward white by `amount` (0-1).
function lightenHex(hex, amount) {
  const full = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  const toHex = (c) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function applyTheme(theme) {
  THEME_FIELDS.forEach(({ key, varName }) => {
    document.documentElement.style.setProperty(varName, theme[key]);
  });
  // --panel-light isn't user-facing directly: it's derived from the box
  document.documentElement.style.setProperty("--panel-light", lightenHex(theme.panel, 0.15));
}

function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch (error) {
    console.error("Error saving theme:", error);
  }
}

function loadTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) {
      currentTheme = { ...DEFAULT_THEME, ...JSON.parse(raw) };
    }
  } catch (error) {
    console.error("Error loading saved theme:", error);
  }
  applyTheme(currentTheme);
}

function buildPresetGrid() {
  themeFieldsContainer.innerHTML = "";

  PRESETS.forEach((preset) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "preset-card";
    if (isSameTheme(preset, currentTheme)) card.classList.add("selected");

    card.innerHTML = `
      <span class="preset-swatch">
        <span style="background:${preset.bg}"></span>
        <span style="background:${preset.panel}"></span>
        <span style="background:${preset.primary}"></span>
        <span style="background:${preset.secondary}"></span>
        <span style="background:${preset.accent}"></span>
      </span>
      <span class="preset-name">${preset.name}</span>
    `;

    card.addEventListener("click", () => {
      currentTheme = {
        bg: preset.bg,
        panel: preset.panel,
        primary: preset.primary,
        secondary: preset.secondary,
        accent: preset.accent,
      };
      applyTheme(currentTheme);
      saveTheme(currentTheme);
      buildPresetGrid();
    });

    themeFieldsContainer.appendChild(card);
  });
}

function openThemeModal() {
  buildPresetGrid();
  themeModalOverlay.classList.remove("hidden");
}

function closeThemeModal() {
  themeModalOverlay.classList.add("hidden");
}

paletteBtn.addEventListener("click", openThemeModal);
themeCloseBtn.addEventListener("click", closeThemeModal);
themeModalOverlay.addEventListener("click", (event) => {
  if (event.target === themeModalOverlay) closeThemeModal();
});

themeResetBtn.addEventListener("click", () => {
  currentTheme = { ...DEFAULT_THEME };
  applyTheme(currentTheme);
  saveTheme(currentTheme);
  buildPresetGrid();
});

loadTheme();
