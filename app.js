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
  collection,
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
const usersCollectionRef = collection(db, "users");

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
const votingView = document.getElementById("votingView");
const votingHeading = document.getElementById("votingHeading");
const startGameBtn = document.getElementById("startGameBtn");
const sendItRow = document.getElementById("sendItRow");
const sendItBtn = document.getElementById("sendItBtn");
const sendItProgress = sendItBtn.querySelector(".send-it-progress");
const sendItLabel = sendItBtn.querySelector(".btn-label");
const rerollBtn = document.getElementById("rerollBtn");
const tracksContainer = document.getElementById("tracksContainer");
const voteMessage = document.getElementById("voteMessage");

const postSendActions = document.getElementById("postSendActions");
const anothaOneBtn = document.getElementById("anothaOneBtn");
const ggsBtn = document.getElementById("ggsBtn");

const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

const categoryFiltersContainer = document.getElementById("categoryFiltersContainer");
const unreleasedFilter = document.getElementById("unreleasedFilter");
const secretToggleLabel = document.getElementById("secretToggleLabel");
const gambleBtn = document.getElementById("gambleBtn");
const carResult = document.getElementById("carResult");

const gameToggleButtons = document.querySelectorAll(".game-toggle-btn");

// ---------- Build game2Tracks from game2TrackCollections (data-game2.js) ----------
// data-game2.js defines tracks grouped by creator: a small { localId: "Name" }
// object per creator, plus a `game2TrackCollections` registry pairing each
// one with a numeric `prefix`. (It's exposed under that name, not the bare
// `trackCollections` used inside its own IIFE, because data.js — Game 1 —
// declares its OWN global `trackCollections` for the same pattern; two
// globals with the same name from two different files collide.) This
// flattens it into the same flat {id, name, creator} shape used everywhere
// else (trackPool, game2Cars), computing each track's global id as
// `prefix * 1000 + localId` — e.g. Fidestic (prefix 9), track #1 -> id 9001.
// That multiplier assumes no single creator ever has 1000+ tracks.
// To drop a creator from Game 2 entirely, comment out its line inside
// `trackCollections` in data-game2.js with `//` — its `const` object can
// stay defined above, just unreferenced.
function buildGame2Tracks() {
  const flat = [];
  Object.entries(game2TrackCollections).forEach(([creatorName, entry]) => {
    const { prefix, tracks } = entry;
    Object.entries(tracks).forEach(([localId, name]) => {
      flat.push({
        id: prefix * 1000 + Number(localId),
        name,
        creator: creatorName,
      });
    });
  });
  return flat;
}

const game2Tracks = buildGame2Tracks();

// ---------- Active game version (Game 1 / Game 2) ----------
// Game 1 (carPool/trackPool, from data.js) and Game 2 (game2Cars/game2Tracks,
// from data-game2.js) are two completely separate pools — different car
// classes, different tracks, never mixed. This is a personal/local choice
// (localStorage), not synced: it decides which pool YOUR OWN actions (Start
// Game, Garage rolls, Tracks search) pull from. Once a voting round exists
// in Firestore it carries its own `gameVersion` and renders from the data
// already baked into it, regardless of what your toggle is set to later.
const GAME_VERSION_KEY = "froggybot-game-version";

let activeGameVersion = 1;
try {
  const saved = parseInt(localStorage.getItem(GAME_VERSION_KEY), 10);
  if (saved === 1 || saved === 2) activeGameVersion = saved;
} catch (error) {
  activeGameVersion = 1;
}

let activeCarPool = [];
let activeTrackPool = [];

function setActiveGame(version) {
  activeGameVersion = version;
  activeCarPool = version === 2 ? game2Cars : carPool;
  activeTrackPool = version === 2 ? game2Tracks : trackPool;

  try {
    localStorage.setItem(GAME_VERSION_KEY, String(version));
  } catch (error) {
    console.error("Error saving active game version:", error);
  }

  gameToggleButtons.forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.game) === version);
  });

  // The "unreleased" secret toggle only makes sense for Game 1's data
  // (Game 2 cars don't have a `released` field at all) — reset it so it
  // can't silently zero out the Game 2 pool.
  unreleasedFilter.checked = false;
  secretToggleLabel.classList.remove("revealed");

  buildCategoryFilters();
  carResult.classList.remove("locked-in", "legendary", "spinning");
  carResult.innerHTML = "<p>Pick your categories and spin.</p>";

  populateCreatorFilter();
  renderTrackLibrary();
}

gameToggleButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveGame(Number(btn.dataset.game)));
});

const playersContainer = document.getElementById("playersContainer");

const trackSearchInput = document.getElementById("trackSearchInput");
const trackCreatorFilter = document.getElementById("trackCreatorFilter");
const filterLikedBtn = document.getElementById("filterLikedBtn");
const filterFavoritedBtn = document.getElementById("filterFavoritedBtn");
const trackLibraryContainer = document.getElementById("trackLibraryContainer");

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

function playFavorite() {
  beep(880, 0, 0.06, "square", 0.14);
  beep(1318, 0.05, 0.1, "square", 0.14);
}

// A "locking in" thunk-then-chime, distinct from playEnd() (used by GGS).
function playSendIt() {
  beep(220, 0, 0.08, "square", 0.15);
  beep(880, 0.09, 0.14, "square", 0.16);
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
    // Load the profile FIRST (and let it fully settle) before piling on
    // more concurrent Firestore listeners/writes — fewer things competing
    // at startup means fewer chances for a transient hiccup to look like
    // "no profile exists yet".
    initUserProfile().then(() => {
      listenToGame();
      listenToPlayers();
      touchPresence();
      setInterval(touchPresence, PRESENCE_INTERVAL_MS);
    });
  }
});

// ---------- Presence ("who's connected"), a simple heartbeat since
// Firestore (unlike Realtime Database) has no built-in onDisconnect. ----------
const PRESENCE_INTERVAL_MS = 20000;
const PRESENCE_STALE_MS = 45000;

function touchPresence() {
  if (!currentUid) return;
  const userRef = doc(db, "users", currentUid);
  setDoc(userRef, { lastSeen: Date.now() }, { merge: true }).catch((error) => {
    console.error("Error updating presence:", error);
  });
}

// ---------- User profile (name + icon), stored in Firestore under users/{uid} ----------
async function initUserProfile() {
  const userRef = doc(db, "users", currentUid);

  // Try twice before assuming there's genuinely no profile yet — a
  // transient read hiccup shouldn't force a returning player to
  // re-enter their name.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const snap = await getDoc(userRef);
      const data = snap.exists() ? snap.data() : null;

      if (data && data.name && data.icon) {
        currentName = data.name;
        currentIcon = data.icon;
        updateUserBadge();
      } else {
        openNameModal("create");
      }
      return;
    } catch (error) {
      console.error(`Error loading user profile (attempt ${attempt}):`, error);
      if (attempt === 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
  }

  // Both attempts failed — fall back to the create modal so the app
  // doesn't get stuck, but this path should now be rare.
  openNameModal("create");
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
    await setDoc(userRef, { name: value, icon: selectedIconInModal, lastSeen: Date.now() }, { merge: true });
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

// ---------- Game round lifecycle (idle <-> voting <-> locked-in) ----------
let activeGameStartedAt = null;
let sendItTimerInterval = null;
let isPlayingRollAnimation = false;

const SEND_IT_WAIT_MS = 10000;
const ROLL_ANIMATE_WINDOW_MS = 2500; // only animate if the round *just* started

function listenToGame() {
  onSnapshot(
    gameRef,
    (snap) => {
      if (!snap.exists()) {
        showIdleView();
        return;
      }
      showVotingView(snap.data());
    },
    (error) => {
      console.error("Error listening to the current game:", error);
    }
  );
}

function showIdleView() {
  idleView.classList.remove("hidden");
  votingView.classList.add("hidden");
  stopSendItTimer();
  activeGameStartedAt = null;
  isPlayingRollAnimation = false;
}

function showVotingView(data) {
  idleView.classList.add("hidden");
  votingView.classList.remove("hidden");

  const isLocked = Boolean(data.resultTrack);
  const isNewRound = data.startedAt !== activeGameStartedAt;
  if (isNewRound) activeGameStartedAt = data.startedAt;

  const shouldAnimate =
    !isLocked &&
    isNewRound &&
    !isPlayingRollAnimation &&
    data.startedAt &&
    Date.now() - data.startedAt < ROLL_ANIMATE_WINDOW_MS;

  if (shouldAnimate) {
    isPlayingRollAnimation = true;
    playTrackRollAnimation(data.tracks || {}, () => {
      isPlayingRollAnimation = false;
      finishVotingRender(data, isLocked);
      startSendItTimer(data.startedAt);
    });
    return;
  }

  if (isPlayingRollAnimation) return; // let the in-flight animation finish first

  finishVotingRender(data, isLocked);

  if (isLocked) {
    stopSendItTimer();
  } else if (isNewRound) {
    startSendItTimer(data.startedAt);
  }
}

function finishVotingRender(data, isLocked) {
  renderTracks(data.tracks || {}, data.votesByUser || {}, isLocked, data.resultTrack);
  votingHeading.textContent = isLocked ? "NOW RACING" : "VOTE FOR A TRACK";
  sendItRow.classList.toggle("hidden", isLocked);
  postSendActions.classList.toggle("hidden", !isLocked);
}

// A one-time "rolling" reveal when a fresh round starts. With 5 tracks
// animating at once, ticking a sound per card would be a wall of noise —
// so the whole batch shares ONE tick sound per interval, and ONE reveal
// chime when they land, instead of 5 of each.
function playTrackRollAnimation(finalTracksObj, onComplete) {
  const finalEntries = Object.entries(finalTracksObj);

  tracksContainer.innerHTML = "";
  votingHeading.textContent = "ROLLING TRACKS...";

  // Keep the Send It row visible for continuity, but lock it until the
  // real 10s timer kicks in once the tracks land.
  sendItRow.classList.remove("hidden");
  postSendActions.classList.add("hidden");
  sendItBtn.disabled = true;
  sendItProgress.style.width = "100%";
  sendItLabel.textContent = "SEND IT";
  voteMessage.textContent = "";

  const slots = finalEntries.map(() => {
    const card = document.createElement("div");
    card.className = "track-card rolling";
    card.innerHTML = `
      <div class="track-info">
        <span class="track-name">?</span>
        <span class="track-creator">by ?</span>
      </div>
    `;
    tracksContainer.appendChild(card);
    return card;
  });

  const spinDurationMs = 1100;
  const tickMs = 90;
  const startedAt = Date.now();

  const spinInterval = setInterval(() => {
    slots.forEach((slot) => {
      const randomTrack = activeTrackPool[Math.floor(Math.random() * activeTrackPool.length)];
      slot.querySelector(".track-name").textContent = randomTrack.name;
      slot.querySelector(".track-creator").textContent = `by ${randomTrack.creator}`;
    });
    playSpinTick(); // one shared tick for the whole batch, not per-card

    if (Date.now() - startedAt >= spinDurationMs) {
      clearInterval(spinInterval);
      cascadeReveal();
    }
  }, tickMs);

  function cascadeReveal() {
    playReveal(); // one shared chime for the whole batch, not per-card

    finalEntries.forEach(([, info], index) => {
      setTimeout(() => {
        const slot = slots[index];
        slot.classList.remove("rolling");
        slot.classList.add("landed");
        slot.innerHTML = `
          <div class="track-info">
            <span class="track-name">${info.name}</span>
            <span class="track-creator">by ${info.creator}</span>
          </div>
        `;
      }, index * 100);
    });

    setTimeout(onComplete, finalEntries.length * 100 + 250);
  }
}

// ---------- "Send It" 10s timer, shown as a bar draining on the button ----------
function stopSendItTimer() {
  if (sendItTimerInterval) {
    clearInterval(sendItTimerInterval);
    sendItTimerInterval = null;
  }
}

function updateSendItProgress(startedAt) {
  const elapsed = Date.now() - (startedAt || 0);
  const remaining = Math.max(0, SEND_IT_WAIT_MS - elapsed);
  const remainingPct = (remaining / SEND_IT_WAIT_MS) * 100;

  sendItProgress.style.width = `${remainingPct}%`;

  if (remaining <= 0) {
    sendItBtn.disabled = false;
    sendItLabel.textContent = "SEND IT";
    stopSendItTimer();
  } else {
    sendItBtn.disabled = true;
  }
}

function startSendItTimer(startedAt) {
  stopSendItTimer();
  updateSendItProgress(startedAt);
  sendItTimerInterval = setInterval(() => updateSendItProgress(startedAt), 100);
}

function pickRandomTracks(amount = 5) {
  const copy = [...activeTrackPool];
  const chosen = [];

  while (chosen.length < amount && copy.length > 0) {
    const index = Math.floor(Math.random() * copy.length);
    chosen.push(copy[index]);
    copy.splice(index, 1);
  }

  return chosen;
}

async function startGame() {
  const chosen = pickRandomTracks(5);

  // Guard against creating a round with too few tracks (e.g. if someone
  // comments out most/all creators in trackCollections) — that used to
  // silently create a broken "Send It does nothing" round sitting in
  // Firestore for everyone until someone happened to overwrite it.
  if (chosen.length < 5) {
    alert(
      `Only ${chosen.length} track(s) available for this game — need at least 5. ` +
        `Check trackCollections in ${activeGameVersion === 2 ? "data-game2.js" : "data.js"} ` +
        "(too many creators commented out?)."
    );
    return;
  }

  startGameBtn.disabled = true;
  anothaOneBtn.disabled = true;
  rerollBtn.disabled = true;
  playStart();
  try {
    const tracksData = {};
    chosen.forEach((track) => {
      tracksData[track.id] = { name: track.name, creator: track.creator, votes: 0, voters: [] };
    });

    await setDoc(gameRef, {
      tracks: tracksData,
      votesByUser: {},
      startedAt: Date.now(),
      gameVersion: activeGameVersion,
    });
  } catch (error) {
    console.error("Error starting game:", error);
  } finally {
    startGameBtn.disabled = false;
    anothaOneBtn.disabled = false;
    rerollBtn.disabled = false;
  }
}

startGameBtn.addEventListener("click", startGame);
anothaOneBtn.addEventListener("click", startGame);
// Reroll is the same operation as Start Game: wipe the current tracks and
// pick 5 fresh ones. Repeats are fine, no need to exclude the old 5.
rerollBtn.addEventListener("click", startGame);

// Picks the winning track (ties broken randomly) and moves the round into
// the locked-in phase. Guarded so it's safe even if two players click at
// the same moment — whichever transaction runs first decides the winner,
// the other becomes a no-op.
async function sendIt() {
  playSendIt();
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(gameRef);
      if (!snap.exists()) return;

      const data = snap.data();
      if (data.resultTrack) return;

      const entries = Object.entries(data.tracks || {});
      if (entries.length === 0) return;

      const maxVotes = Math.max(...entries.map(([, track]) => track.votes || 0));
      const tied = entries.filter(([, track]) => (track.votes || 0) === maxVotes);
      const [winnerId, winnerTrack] = tied[Math.floor(Math.random() * tied.length)];

      transaction.update(gameRef, {
        resultTrack: {
          trackId: winnerId,
          name: winnerTrack.name,
          creator: winnerTrack.creator,
        },
      });
    });
  } catch (error) {
    console.error("Error sending it:", error);
  }
}

sendItBtn.addEventListener("click", sendIt);

// ---------- Track voting (freely changeable until "Send It") ----------
// Once locked (resultTrack set): counts/voters disappear, the winning card
// shows like/favorite buttons in their place, and the rest are dimmed.
function renderTracks(tracksObj, votesByUser, isLocked, resultTrack) {
  tracksContainer.innerHTML = "";
  const myTrackId = currentUid ? votesByUser[currentUid] : undefined;
  const winnerId = resultTrack ? resultTrack.trackId : null;

  Object.entries(tracksObj).forEach(([trackId, info]) => {
    const isWinner = isLocked && trackId === winnerId;
    const card = document.createElement(isLocked ? "div" : "button");
    card.className = "track-card";

    if (isLocked) {
      card.classList.add(isWinner ? "winner" : "dimmed");
    } else {
      card.type = "button";
      card.dataset.sound = "custom";
      if (trackId === myTrackId) card.classList.add("selected");
      card.addEventListener("click", () => voteForTrack(trackId));
    }

    let rightHtml = "";
    if (isWinner) {
      rightHtml = `
        <div class="track-right winner-actions">
          <button type="button" class="icon-action-btn" data-role="like" aria-label="Like" title="Like">
            <img data-role="like-icon" src="froggy-like-unchecked.png" alt="" />
          </button>
          <button type="button" class="icon-action-btn" data-role="favorite" data-sound="custom" aria-label="Favorite" title="Favorite">
            <img data-role="favorite-icon" src="star-unchecked.png" alt="" />
          </button>
        </div>
      `;
    } else if (!isLocked) {
      const voters = info.voters || [];
      const votersHtml = voters
        .map((v) => `<img src="FroggySprites/${v.icon}" alt="" title="${v.name || ""}" />`)
        .join("");
      rightHtml = `
        <div class="track-right">
          <div class="track-voters">${votersHtml}</div>
          <span class="track-votes">${info.votes}</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="track-info">
        <span class="track-name">${info.name}</span>
        <span class="track-creator">by ${info.creator}</span>
      </div>
      ${rightHtml}
    `;

    tracksContainer.appendChild(card);

    if (isWinner) {
      wireLikeButton(card.querySelector('[data-role="like"]'));
      wireFavoriteButton(card.querySelector('[data-role="favorite"]'));
    }
  });

  voteMessage.textContent = !isLocked && myTrackId ? "Your vote is in!" : "";
}

function wireLikeButton(btn) {
  const icon = btn.querySelector("img");
  btn.addEventListener("click", () => {
    const isNowActive = btn.classList.toggle("active");
    icon.src = isNowActive ? "froggy-like-checked.png" : "froggy-like-unchecked.png";
  });
}

function wireFavoriteButton(btn) {
  const icon = btn.querySelector("img");
  btn.addEventListener("click", () => {
    const isNowActive = btn.classList.toggle("active");
    icon.src = isNowActive ? "star-checked.png" : "star-unchecked.png";
    if (isNowActive) {
      spawnSparkles(btn, 10);
      playFavorite();
    }
  });
}

async function voteForTrack(trackId) {
  if (!currentUid) return;

  playVote();

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(gameRef);
      if (!snap.exists()) throw new Error("NO_GAME");

      const data = snap.data();
      const votesByUser = data.votesByUser || {};
      const previousTrackId = votesByUser[currentUid];

      if (previousTrackId === trackId) return; // already your pick, nothing to do

      const tracks = data.tracks || {};
      const newTrack = tracks[trackId];
      if (!newTrack) throw new Error("NO_TRACK");

      const updates = {
        [`votesByUser.${currentUid}`]: trackId,
        [`tracks.${trackId}.votes`]: (newTrack.votes || 0) + 1,
        [`tracks.${trackId}.voters`]: [
          ...(newTrack.voters || []),
          { uid: currentUid, icon: currentIcon, name: currentName },
        ],
      };

      const previousTrack = previousTrackId ? tracks[previousTrackId] : null;
      if (previousTrack) {
        updates[`tracks.${previousTrackId}.votes`] = Math.max(0, (previousTrack.votes || 0) - 1);
        updates[`tracks.${previousTrackId}.voters`] = (previousTrack.voters || []).filter(
          (v) => v.uid !== currentUid
        );
      }

      transaction.update(gameRef, updates);
    });
    // No manual re-render needed: onSnapshot pushes the update to everyone,
    // including this tab.
  } catch (error) {
    console.error("Error voting:", error);
    voteMessage.textContent = "Something went wrong. Try again.";
  }
}

// "GGS" closes out the race entirely, back to the very first "Start Game"
// screen — unlike "Anotha One", it does NOT queue up a new round.
async function ggs() {
  playEnd();
  try {
    await deleteDoc(gameRef);
  } catch (error) {
    console.error("Error closing out the race:", error);
  }
}

ggsBtn.addEventListener("click", ggs);

// ---------- Garage: random car with category filters ----------
// The checkboxes are rebuilt per active game (Game 1 has 4 fixed categories,
// Game 2 has 10 car classes pulled straight from its own data), so they're
// queried live each time rather than cached in a NodeList captured once.
function buildCategoryFilters() {
  const categories = [...new Set(activeCarPool.map((car) => car.category))].sort();

  categoryFiltersContainer.innerHTML = "";
  categories.forEach((category) => {
    const label = document.createElement("label");
    label.className = "checkbox-label";
    label.innerHTML = `
      <input type="checkbox" class="category-filter" value="${category}" checked />
      ${category.toUpperCase()}
    `;
    categoryFiltersContainer.appendChild(label);
  });

  categoryFiltersContainer
    .querySelectorAll(".category-filter")
    .forEach((cb) => cb.addEventListener("change", updateGambleButtonState));

  updateGambleButtonState();
}

function getSelectedCategories() {
  return Array.from(categoryFiltersContainer.querySelectorAll(".category-filter"))
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

function updateGambleButtonState() {
  gambleBtn.disabled = getSelectedCategories().length === 0;
}

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

// Actual min/max across the Game 2 roster for the two stats that are still
// scaled off the real numbers (boost power and weight both spread out
// reasonably linearly, so min-max works fine for them).
const STAT_SCALE_RANGE = {
  boostPower: { min: 42.9, max: 131.5 },
  baseWeight: { min: 400, max: 3000 },
};

// Top speed is NOT linear-scaled: most of the roster sits bunched between
// ~90-96, with only a handful of cars near 88 or near 98. A percentile rank
// (what fraction of the roster you're at or above) spreads cars out across
// the bar according to how the data actually clusters, rather than how far
// they sit from an arbitrary min/max.
const TOP_SPEED_SORTED = game2Cars
  .map((car) => (car.stats ? car.stats.topSpeed : null))
  .filter((v) => v != null)
  .sort((a, b) => a - b);

function topSpeedPercentile(value) {
  if (TOP_SPEED_SORTED.length === 0) return 0;
  let countAtOrBelow = 0;
  for (const v of TOP_SPEED_SORTED) {
    if (v <= value) countAtOrBelow++;
  }
  return countAtOrBelow / TOP_SPEED_SORTED.length;
}

// Drift gain and passive gain are nearly identical (both basically a
// per-class constant with a couple of one-off cars), so they're merged
// into a single "BOOST GAIN" stat. Rather than scale off the real numbers
// (which left everything except Rally/Heavy/Swift sitting at 1 bar), each
// class gets a deliberately-chosen, slightly stylized bar count instead.
const CLASS_BOOST_GAIN_PIPS = {
  Rocket: 1,
  Bike: 1,
  Drifter: 1,
  Balanced: 2,
  Swift: 5,
  "Off-Road": 7,
  Rally: 7,
  Quad: 7,
  "Monster Truck": 10,
  Heavy: 10,
};

// Same idea as boost gain: weight is mostly class-determined, so each class
// gets a stylized default bar count. A handful of specific cars have their
// own weight modifier in the data and get an individual override instead.
const CLASS_WEIGHT_PIPS = {
  "Monster Truck": 10,
  Heavy: 10,
  "Off-Road": 9,
  Rally: 9,
  Drifter: 7,
  Balanced: 7,
  Swift: 4,
  Rocket: 3,
  Quad: 2,
  Bike: 1,
};

// Same pattern again, now for boost power: class default + individual
// overrides for the same handful of cars that have a weight modifier.
const CLASS_BOOST_POWER_PIPS = {
  Bike: 10,
  Quad: 10,
  Rocket: 8,
  Swift: 7,
  Rally: 5,
  Balanced: 5,
  Drifter: 4,
  "Off-Road": 3,
  Heavy: 1,
  "Monster Truck": 0,
};

const CAR_BOOST_POWER_PIPS_OVERRIDE = {
  "Surf 'N Turf": 9,
  Sandivore: 9,
  "Track Manga": 9,
  "Bump Around": 8,
  "Mountain Mauler": 8,
  "Mercedes-Benz 300 SL": 8,
  "2018 Ford Mustang GT": 5,
  "Roller Toaster": 3,
};

function getBoostPowerPips(car) {
  if (CAR_BOOST_POWER_PIPS_OVERRIDE[car.name] != null) return CAR_BOOST_POWER_PIPS_OVERRIDE[car.name];
  if (CLASS_BOOST_POWER_PIPS[car.category] != null) return CLASS_BOOST_POWER_PIPS[car.category];
  return null;
}

const CAR_WEIGHT_PIPS_OVERRIDE = {
  "Roller Toaster": 8,
  "2018 Ford Mustang GT": 6,
  "Mountain Mauler": 6,
  "Mercedes-Benz 300 SL": 5,
  Sandivore: 4,
  "Track Manga": 3,
  "Bump Around": 3,
  "Surf 'N Turf": 2,
};

function getWeightPips(car) {
  if (CAR_WEIGHT_PIPS_OVERRIDE[car.name] != null) return CAR_WEIGHT_PIPS_OVERRIDE[car.name];
  if (CLASS_WEIGHT_PIPS[car.category] != null) return CLASS_WEIGHT_PIPS[car.category];
  return null;
}

function buildPipBar(filledCount, segments = 10) {
  const filled = Math.max(0, Math.min(segments, filledCount));
  let html = '<span class="stat-bar">';
  for (let i = 0; i < segments; i++) {
    html += `<span class="stat-bar-seg${i < filled ? " filled" : ""}"></span>`;
  }
  html += "</span>";
  return html;
}

function buildStatBar(value, range, segments = 10) {
  const { min, max } = range;
  const ratio = max > min ? (value - min) / (max - min) : 1;
  // Floor at 1 segment so a car at the bottom of the range still reads as
  // "has this stat", not as a blank/broken bar.
  const filled = Math.max(1, Math.min(segments, Math.round(ratio * segments)));
  return buildPipBar(filled, segments);
}

// The one exception to "stats are bars": boost renders as a row of shapes —
// circles for Charge, rounded pill-bars for Bar — one per boost amount.
function buildBoostIcons(amount, type) {
  const shape = (type || "").toLowerCase() === "bar" ? "bar" : "charge";
  let html = '<span class="boost-icons">';
  for (let i = 0; i < amount; i++) {
    html += `<span class="boost-icon ${shape}"></span>`;
  }
  html += "</span>";
  return html;
}

function statRow(label, barHtml, valueText) {
  return `
    <div class="stat-row">
      <span class="stat-label">${label}</span>
      ${barHtml}
      <span class="stat-value">${valueText}</span>
    </div>
  `;
}

// Game 2 cars carry real stats; Game 1 cars don't (and that's fine — we
// just skip this block entirely when `stats` isn't there).
function buildStatsHtml(car) {
  const stats = car.stats;
  if (!stats) return "";

  let html = '<div class="car-stats">';

  if (stats.topSpeed != null) {
    const filled = Math.max(1, Math.round(topSpeedPercentile(stats.topSpeed) * 10));
    html += statRow("TOP SPEED", buildPipBar(filled), stats.topSpeed);
  }

  if (stats.boostPower != null) {
    const boostPowerPips = getBoostPowerPips(car);
    const boostPowerBar =
      boostPowerPips != null
        ? buildPipBar(boostPowerPips)
        : buildStatBar(stats.boostPower, STAT_SCALE_RANGE.boostPower);
    html += statRow("BOOST POWER", boostPowerBar, stats.boostPower);
  }

  const gainPips = CLASS_BOOST_GAIN_PIPS[car.category];
  if (gainPips != null) {
    // The bar is the stylized per-class pip count; the number shown is
    // drift gain specifically (passive gain tracks it closely but isn't
    // identical, so showing both would be redundant — drift wins).
    html += statRow("BOOST GAIN", buildPipBar(gainPips), stats.driftBoostGain != null ? stats.driftBoostGain : "");
  }

  if (stats.baseWeight != null) {
    const weightPips = getWeightPips(car);
    const weightBar =
      weightPips != null ? buildPipBar(weightPips) : buildStatBar(stats.baseWeight, STAT_SCALE_RANGE.baseWeight);
    html += statRow("WEIGHT", weightBar, stats.baseWeight);
  }

  if (stats.boostAmount != null) {
    html += `
      <div class="stat-row">
        <span class="stat-label">BOOST</span>
        ${buildBoostIcons(stats.boostAmount, stats.boostType)}
        <span class="stat-value">${stats.boostAmount}</span>
      </div>
    `;
  }

  if (stats.banned) {
    html +=
      '<div class="stat-row banned"><span class="stat-label">BANNED</span><span class="stat-spacer"></span><span class="stat-value">YES</span></div>';
  }

  html += "</div>";
  return html;
}

function spinForCar() {
  const categories = getSelectedCategories();
  const includeUnreleased = unreleasedFilter.checked;

  const pool = activeCarPool.filter((car) => {
    const matchesCategory = categories.includes(car.category);
    // The "unreleased" secret toggle is a Game 1 concept only — Game 2 cars
    // have no `released` field at all, so it's a no-op for them rather
    // than silently filtering the whole pool down to nothing.
    const matchesReleaseStatus =
      car.released === undefined ? true : includeUnreleased ? true : car.released === true;
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
        ${buildStatsHtml(finalCar)}
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

      if (currentUid) {
        const userRef = doc(db, "users", currentUid);
        setDoc(
          userRef,
          {
            currentCar: {
              name: finalCar.name,
              category: finalCar.category,
              gameVersion: activeGameVersion,
            },
          },
          { merge: true }
        ).catch((error) => {
          console.error("Error saving current car:", error);
        });
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

// ---------- Players tab: who's currently connected ----------
let allUsersCache = {};

function listenToPlayers() {
  onSnapshot(
    usersCollectionRef,
    (snap) => {
      allUsersCache = {};
      snap.forEach((docSnap) => {
        allUsersCache[docSnap.id] = docSnap.data();
      });
      renderPlayers();
    },
    (error) => {
      console.error("Error listening to players:", error);
    }
  );

  // Re-render on a timer too, so someone who went stale (closed the tab)
  // drops off the list even without a fresh snapshot arriving.
  setInterval(renderPlayers, 5000);
}

function renderPlayers() {
  const now = Date.now();
  const connected = Object.values(allUsersCache).filter(
    (player) => player.lastSeen && now - player.lastSeen < PRESENCE_STALE_MS
  );

  playersContainer.innerHTML = "";

  if (connected.length === 0) {
    playersContainer.innerHTML = "<p>No one else is here right now.</p>";
    return;
  }

  connected
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .forEach((player) => {
      const row = document.createElement("div");
      row.className = "player-card";

      const hasCar = Boolean(player.currentCar && player.currentCar.name);
      const carText = hasCar ? player.currentCar.name : "No car rolled yet";

      row.innerHTML = `
        <img src="FroggySprites/${player.icon}" alt="" class="player-icon" />
        <div class="player-info">
          <span class="player-name">${player.name}</span>
          <span class="player-car${hasCar ? "" : " none"}">${carText}</span>
        </div>
      `;

      playersContainer.appendChild(row);
    });
}

// ---------- Tracks tab: browse/search the full library (no voting here) ----------
// Purely local (trackPool from data.js) — no Firestore needed, so this can
// run immediately without waiting on auth.
function populateCreatorFilter() {
  const creators = [...new Set(activeTrackPool.map((track) => track.creator))].sort();
  trackCreatorFilter.innerHTML =
    '<option value="">All creators</option>' +
    creators.map((creator) => `<option value="${creator}">${creator}</option>`).join("");
}

function getFilteredTracks() {
  const query = trackSearchInput.value.trim().toLowerCase();
  const creator = trackCreatorFilter.value;

  return activeTrackPool.filter((track) => {
    const matchesName = !query || track.name.toLowerCase().includes(query);
    const matchesCreator = !creator || track.creator === creator;
    return matchesName && matchesCreator;
  });
  // Note: the LIKED/FAVORITED toggle buttons don't filter this list yet —
  // there's nowhere to read that from until like/favorite get persisted.
}

function renderTrackLibraryRow(track) {
  const row = document.createElement("div");
  row.className = "track-card";
  row.innerHTML = `
    <div class="track-info">
      <span class="track-name">${track.name}</span>
      <span class="track-creator">by ${track.creator}</span>
    </div>
    <div class="track-right winner-actions">
      <button type="button" class="icon-action-btn" data-role="like" aria-label="Like" title="Like">
        <img data-role="like-icon" src="froggy-like-unchecked.png" alt="" />
      </button>
      <button type="button" class="icon-action-btn" data-role="favorite" data-sound="custom" aria-label="Favorite" title="Favorite">
        <img data-role="favorite-icon" src="star-unchecked.png" alt="" />
      </button>
    </div>
  `;

  wireLikeButton(row.querySelector('[data-role="like"]'));
  wireFavoriteButton(row.querySelector('[data-role="favorite"]'));

  return row;
}

function renderTrackLibrary() {
  const filtered = getFilteredTracks();
  trackLibraryContainer.innerHTML = "";

  if (filtered.length === 0) {
    trackLibraryContainer.innerHTML = "<p>No tracks match your search.</p>";
    return;
  }

  filtered.forEach((track) => {
    trackLibraryContainer.appendChild(renderTrackLibraryRow(track));
  });
}

trackSearchInput.addEventListener("input", renderTrackLibrary);
trackCreatorFilter.addEventListener("change", renderTrackLibrary);

// Not wired to actual filtering yet — just a visual toggle until
// like/favorite get persisted somewhere to filter against.
filterLikedBtn.addEventListener("click", () => {
  filterLikedBtn.classList.toggle("active");
});
filterFavoritedBtn.addEventListener("click", () => {
  filterFavoritedBtn.classList.toggle("active");
});

// Sets activeCarPool/activeTrackPool, builds the category checkboxes, and
// populates the Tracks tab for whichever game was active last time.
setActiveGame(activeGameVersion);
