// firebase.js
// Replaces the old Claude-artifact `window.storage` API with a real backend.
//
// Two things this buys you that window.storage fundamentally could not:
//  1. True real-time push (onValue) instead of polling every 7 seconds.
//  2. Per-path writes: each player's war band lives at players/{id}, so two players
//     editing their own war bands at the same time never touch the same database path
//     and can never collide. Only genuinely shared things (the map, the barracks, the
//     renown ledger) share a path — and those go through runTransaction(), which is
//     a real "only apply this if nothing else changed first" primitive. window.storage
//     never had an equivalent; this is the actual fix for the class of bug we kept
//     chasing there.

import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, update, runTransaction, get } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// One fixed campaign per deployment. If you ever want to run two campaigns from the
// same Firebase project, make this configurable (e.g. from a URL param) instead.
const CAMPAIGN_PATH = "campaigns/dq27";

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
const campaignRef = ref(db, CAMPAIGN_PATH);

// ---- Shape translation -----------------------------------------------------------
// The rest of the app (every component) expects `shared.players` to be a plain array,
// exactly like the old window.storage version — so nothing else in the codebase has to
// change. Firebase itself stores players keyed by id (players/{id}) so each one is its
// own writable/subscribable path. These two functions translate between the two shapes
// at the boundary, so the translation lives in exactly one place.

function fromFirebaseShape(data) {
  if (!data) return null;
  const playersObj = data.players || {};
  // Firebase collapses empty objects/arrays to null/undefined on write — a brand-new campaign's
  // deliberately-empty fields (an empty warband, an empty rounds log, etc.) come back missing
  // entirely rather than as {} or []. Backfill every field that could plausibly start empty so
  // the rest of the app never has to know this quirk exists.
  const players = Object.keys(playersObj).map((id) => {
    const p = playersObj[id] || {};
    return {
      id,
      ...p,
      warband: p.warband || [],
      requisition: p.requisition ?? 0,
      loadout: {
        weapon: p.loadout?.weapon || [],
        armor: p.loadout?.armor || [],
        skill: p.loadout?.skill || [],
      },
    };
  });

  return {
    ...data,
    players,
    teams: data.teams || [],
    regions: data.regions || [],
    turns: data.turns || [],
    currentTurn: data.currentTurn ?? 0,
    totals: data.totals || { a: 0, b: 0 },
    log: data.log || [],
    rounds: data.rounds || {},
    finale: data.finale || {},
    barracks: data.barracks || [],
    timer: data.timer || { type: null, totalSeconds: 0, endAt: null, paused: false, remainingAtPause: null },
    catalog: {
      weapon: data.catalog?.weapon || [],
      armor: data.catalog?.armor || [],
      skill: data.catalog?.skill || [],
      specialRule: data.catalog?.specialRule || [],
    },
  };
}

function toFirebaseShape(shared) {
  const { players, ...rest } = shared;
  const playersObj = {};
  (players || []).forEach((p) => {
    const { id, ...fields } = p;
    playersObj[id] = fields;
  });
  return { ...rest, players: playersObj };
}

// ---- Diffing for patchShared -------------------------------------------------------
// Only writes the specific top-level keys (and specific players/{id} sub-paths) that
// actually changed, instead of overwriting the whole campaign on every save. This is
// what lets two different players' saves happen at the same moment without either one
// clobbering the other — they're writing to different paths entirely.

const TOP_LEVEL_KEYS = ["teams", "regions", "turns", "currentTurn", "totals", "log", "catalog", "rounds", "finale", "barracks", "timer"];

function diffToUpdates(prevShared, nextShared) {
  const updates = {};
  TOP_LEVEL_KEYS.forEach((key) => {
    if (JSON.stringify(prevShared?.[key]) !== JSON.stringify(nextShared[key])) {
      updates[key] = nextShared[key] === undefined ? null : nextShared[key];
    }
  });

  const prevById = Object.fromEntries((prevShared?.players || []).map((p) => [p.id, p]));
  const nextById = Object.fromEntries((nextShared.players || []).map((p) => [p.id, p]));
  const allIds = new Set([...Object.keys(prevById), ...Object.keys(nextById)]);
  allIds.forEach((id) => {
    if (JSON.stringify(prevById[id]) !== JSON.stringify(nextById[id])) {
      const { id: _drop, ...fields } = nextById[id] || {};
      updates["players/" + id] = nextById[id] === undefined ? null : fields;
    }
  });

  return updates;
}

// ---- Public API ---------------------------------------------------------------------
// Mirrors the old window.storage-backed hook's shape (shared, patchShared, loaded) so
// the App component barely has to change.

export function subscribeShared(onData) {
  return onValue(campaignRef, (snapshot) => {
    onData(fromFirebaseShape(snapshot.val()));
  }, (error) => {
    console.error("Firebase read error:", error);
  });
}

export async function fetchSharedOnce() {
  const snap = await get(campaignRef);
  return fromFirebaseShape(snap.val());
}

// General-purpose patch: diffs the mutator's output against the last-known state and
// writes only what changed, across as many paths as needed, in a single atomic call.
export async function patchSharedFirebase(currentShared, mutator) {
  const updated = mutator(currentShared) || currentShared;
  const updates = diffToUpdates(currentShared, updated);
  if (Object.keys(updates).length === 0) return updated;
  const rootUpdates = {};
  Object.entries(updates).forEach(([path, value]) => {
    rootUpdates[`${CAMPAIGN_PATH}/${path}`] = value;
  });
  await update(ref(db), rootUpdates);
  return updated;
}

// Seeds a brand-new campaign if the database is completely empty. Safe to call every
// time the app loads — it's a no-op once real data exists.
export async function ensureCampaignSeeded(defaults) {
  const snap = await get(campaignRef);
  if (!snap.exists()) {
    await update(ref(db), { [CAMPAIGN_PATH]: toFirebaseShape(defaults) });
  }
}

// True compare-and-swap for the handful of genuinely contested spots: claiming/releasing
// a Barracks mercenary, and tallying renown on turn advance. Firebase re-runs `updater`
// automatically if the value changed underneath it, so this can never lose an update
// the way a plain read-then-write always risks.
export function transactShared(path, updater) {
  return runTransaction(ref(db, `${CAMPAIGN_PATH}/${path}`), (current) => updater(current));
}

// ---- Local identity (device-specific, never shared) --------------------------------
// Which role/name this device is using. Purely local — no reason for this to touch the
// network at all.

const IDENTITY_KEY = "dwarfquest-identity-v1";

export function loadIdentity() {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveIdentity(identity) {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch (e) {}
}

export function clearIdentity() {
  try {
    localStorage.removeItem(IDENTITY_KEY);
  } catch (e) {}
}
