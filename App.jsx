import { useState, useEffect, useRef, useCallback } from "react";
import {
  Crown, Flame, Anvil, Eye, Skull, ChevronLeft, ChevronRight, ChevronDown,
  Plus, Minus, X, Check, Shield as ShieldIcon, Coins,
  LogOut, Lock, Unlock, RefreshCw, Scale, RotateCcw,
  Trophy, Ban, Timer as TimerIcon, Play, Pause, Square
} from "lucide-react";
import { subscribeShared, fetchSharedOnce, patchSharedFirebase, ensureCampaignSeeded, loadIdentity, saveIdentity, clearIdentity } from "./firebase.js";

/* =========================================================================
   DEFAULT DATA
   ========================================================================= */

const DEFAULT_TEAMS = [
  { id: "a", name: "Team Ironhold", color: "#6B8CAE" },
  { id: "b", name: "Team Emberfall", color: "#C1543A" },
];

const DEFAULT_REGIONS = [
  { id: "r1",  name: "The Foundry District", x: 18, y: 30, owner: null, renown: 3, benefit: "Reroll one failed attack per battle" },
  { id: "r2",  name: "Highstone Market",     x: 34, y: 18, owner: null, renown: 2, benefit: "+1 renown from all adjacent districts" },
  { id: "r3",  name: "The Sunken Gate",      x: 12, y: 55, owner: null, renown: 2, benefit: "Free deployment on first turn" },
  { id: "r4",  name: "Ashbrook Bridge",      x: 30, y: 48, owner: null, renown: 3, benefit: "Control cuts off enemy reinforcements" },
  { id: "r5",  name: "The Old Spire",        x: 50, y: 12, owner: null, renown: 4, benefit: "Reveals one enemy-held district" },
  { id: "r6",  name: "Emberwright Forge",    x: 62, y: 26, owner: null, renown: 3, benefit: "+1 renown per turn held" },
  { id: "r7",  name: "Hollow Row",           x: 48, y: 40, owner: null, renown: 2, benefit: "Heal one unit before battle" },
  { id: "r8",  name: "The Sump Warrens",     x: 22, y: 72, owner: null, renown: 2, benefit: "Ambush bonus on defense" },
  { id: "r9",  name: "Cinderfall Yard",      x: 66, y: 58, owner: null, renown: 3, benefit: "+1 to damage rolls this turn" },
  { id: "r10", name: "The Grand Cistern",    x: 44, y: 64, owner: null, renown: 3, benefit: "Denies enemy district benefit" },
  { id: "r11", name: "Duskwatch Tower",      x: 78, y: 38, owner: null, renown: 4, benefit: "See next turn's scenario early" },
  { id: "r12", name: "The Sable Vault",      x: 58, y: 78, owner: null, renown: 5, benefit: "Double renown this district, once" },
];

const DEFAULT_TURNS = [
  { number: 1, title: "First Blood", intro: "The horns sound over the rooftops of the old city. Neither banner yet flies above its districts — today, that changes." },
  { number: 2, title: "The Foundry Burns", intro: "Smoke rises from the Foundry District. Whoever holds it by dusk commands the iron that will arm every battle to come." },
  { number: 3, title: "Tides at Ashbrook", intro: "The bridge at Ashbrook is the only dry crossing for a mile. Lose it, and reinforcements arrive a turn too late." },
  { number: 4, title: "The Spire Watches", intro: "From the Old Spire, spotters can see clean across the city. Its holder will know their enemy's plans before they're made." },
  { number: 5, title: "Blood in the Warrens", intro: "The Sump Warrens twist beneath the city — narrow, dark, and perfect for an ambush." },
  { number: 6, title: "The Vault Opens", intro: "Rumor says the Sable Vault holds more than gold. Both sides move on it as one." },
  { number: 7, title: "Dusk Falls", intro: "The sun sets on the second day. Whatever renown remains uncommitted will be spent calling on older, stranger powers." },
  { number: 8, title: "The Pantheon Wakes", intro: "The final scenario. Renown becomes invocation. The gods, at last, are listening." },
];

// Final-game army tiers, from "The Fate of Ostæforð" doc, cross-referenced against Of Gods and
// Mortals' own point ranges (App. 2: Gods run roughly 150–400+ pts). A team's Renown funds a
// small God roster (3–4 gods total, per the doc) rather than strict OGaM's one-God-per-force —
// a deliberate house-rule break. Thresholds are reference/GM-editable, not hard gates.
const GOD_TIERS = [
  { id: "tier1", name: "Demi-God", icon: Anvil, threshold: 15, desc: "Entry tier — roughly 150–220 OGaM points as a build guide." },
  { id: "tier2", name: "Lesser God", icon: ShieldIcon, threshold: 30, desc: "Mid tier — roughly 220–320 OGaM points as a build guide." },
  { id: "tier3", name: "High Pantheon", icon: Crown, threshold: 50, desc: "Top tier — roughly 320–400+ OGaM points as a build guide." },
];

const MAX_GOD_SLOTS = 4;
const LEGEND_SKILL_THRESHOLD = 3; // matches the doc: "gained three skills" → Legend-eligible

// Seeded from Song of Blades and Heroes' special rules (names + a short paraphrase of each effect).
// Costs are placeholders — swap in Anthony's friend's economy numbers via Roster > Special Rules.
const DEFAULT_SPECIAL_RULES = [
  { id: "sr-amphibious", name: "Amphibious", cost: 0, effect: "No movement penalty in water or bogs" },
  { id: "sr-animal", name: "Animal", cost: 0, effect: "No campaign XP; routs when the last non-animal ally dies" },
  { id: "sr-artificial", name: "Artificial", cost: 0, effect: "Immune to poison; no gruesome-kill morale effects" },
  { id: "sr-assassin", name: "Assassin", cost: 0, effect: "Kills a living opponent on any win, no doubling needed" },
  { id: "sr-big", name: "Big", cost: 0, effect: "+1 melee vs smaller models; +1 to be hit at range" },
  { id: "sr-cleric", name: "Cleric", cost: 0, effect: "Lethal vs Undead; can heal or stand up an ally" },
  { id: "sr-clinging", name: "Clinging", cost: 0, effect: "Can climb walls/ceilings; no fall damage while clinging" },
  { id: "sr-combat-master", name: "Combat Master", cost: 0, effect: "One melee attack per action instead of per turn" },
  { id: "sr-danger-sense", name: "Danger Sense", cost: 0, effect: "Immune to ambush bonuses" },
  { id: "sr-dashing", name: "Dashing", cost: 0, effect: "+1 Combat on the turn it charges into contact" },
  { id: "sr-desert-walk", name: "Desert-walk", cost: 0, effect: "No movement penalty on desert terrain" },
  { id: "sr-entangle", name: "Entangle", cost: 0, effect: "Ranged attack that pins a target in place" },
  { id: "sr-fearless", name: "Fearless", cost: 0, effect: "Immune to gruesome-kill and terror morale checks" },
  { id: "sr-flying", name: "Flying", cost: 0, effect: "Moves over obstacles/models; free disengage vs ground units" },
  { id: "sr-forester", name: "Forester", cost: 0, effect: "No movement penalty in woods" },
  { id: "sr-free-disengage", name: "Free Disengage", cost: 0, effect: "Leaves melee without a free hit against it" },
  { id: "sr-gargantuan", name: "Gargantuan", cost: 0, effect: "+1 melee vs all smaller models; +1 to be hit at range" },
  { id: "sr-good-shot", name: "Good Shot", cost: 0, effect: "+1 on all ranged attacks" },
  { id: "sr-greedy", name: "Greedy", cost: 0, effect: "May pause to loot a defeated foe instead of acting" },
  { id: "sr-gregarious", name: "Gregarious", cost: 0, effect: "+1 on group-move rolls and under a Leader's bonus" },
  { id: "sr-heavy-armor", name: "Heavy Armor", cost: 0, effect: "Beaten-by-1 results become a draw instead of falling" },
  { id: "sr-hero", name: "Hero", cost: 0, effect: "One automatic success each activation; one re-roll per game" },
  { id: "sr-huge", name: "Huge", cost: 0, effect: "+1 melee vs smaller and Big models; +1 to be hit at range" },
  { id: "sr-leader", name: "Leader", cost: 0, effect: "Nearby allies get +1 Quality; can order group moves" },
  { id: "sr-legendary-shot", name: "Legendary Shot", cost: 0, effect: "One ranged attack per action, not per turn" },
  { id: "sr-lethal", name: "Lethal", cost: 0, effect: "Kills a chosen opponent type on any win, no doubling needed" },
  { id: "sr-long-move", name: "Long Move", cost: 0, effect: "Uses the Long measuring stick to move" },
  { id: "sr-magic-user", name: "Magic-User", cost: 0, effect: "Can cast spells as ranged attacks or to transfix" },
  { id: "sr-mounted", name: "Mounted", cost: 0, effect: "+1 melee vs same-size or smaller foot models" },
  { id: "sr-poison", name: "Poison", cost: 0, effect: "Hits carry a chance to steadily worsen the target" },
  { id: "sr-rabble", name: "Rabble", cost: 0, effect: "Dies on any lost combat, but is cheap to field" },
  { id: "sr-savage", name: "Savage", cost: 0, effect: "Any doubled kill counts as a gruesome kill" },
  { id: "sr-shooter-short", name: "Shooter (Short)", cost: 0, effect: "Ranged attack, Short range" },
  { id: "sr-shooter-medium", name: "Shooter (Medium)", cost: 0, effect: "Ranged attack, Medium range" },
  { id: "sr-shooter-long", name: "Shooter (Long)", cost: 0, effect: "Ranged attack, Long range" },
  { id: "sr-short-move", name: "Short Move", cost: 0, effect: "Uses the Short measuring stick to move" },
  { id: "sr-slow", name: "Slow", cost: 0, effect: "Only ever makes one move per turn" },
  { id: "sr-steadfast", name: "Steadfast", cost: 0, effect: "+1 on Morale rolls" },
  { id: "sr-stealth", name: "Stealth", cost: 0, effect: "Can't be targeted at range while adjacent to cover" },
  { id: "sr-swarm", name: "Swarm", cost: 0, effect: "Represents a mass of small creatures on one base" },
  { id: "sr-tailslap", name: "Tailslap", cost: 0, effect: "A recoiling foe may be knocked down instead" },
  { id: "sr-terror", name: "Terror", cost: 0, effect: "Foes must pass a Quality check to approach or be charged" },
  { id: "sr-tough", name: "Tough", cost: 0, effect: "Survives a killing blow as a wound instead of dying" },
  { id: "sr-undead", name: "Undead", cost: 0, effect: "Immune to poison/terror; no morale check for gruesome kills" },
  { id: "sr-unerring-aim", name: "Unerring Aim", cost: 0, effect: "Halves range penalties on ranged attacks" },
];

// Adapted from "The Fate of Ostæforð" doc's own Items Deck weapon/armour table — note that
// Song of Blades and Heroes itself deliberately has no weapons list (it folds gear into a
// model's Combat score and Special Rules), so this starter set comes from Anthony's group's
// own homebrew economy rather than the rulebook. Costs are cleaned-up placeholders — edit freely.
const STARTER_WEAPONS = [
  { name: "Spear", cost: 3, effect: "+1 Combat; long reach lets it strike an adjacent foe first" },
  { name: "Short Sword", cost: 5, effect: "+1 Combat; can Parry to shrug off a hit" },
  { name: "Sword", cost: 5, effect: "+1 Combat; can Melee Block" },
  { name: "Broadsword", cost: 6, effect: "+2 Combat; a Heavy Weapon" },
  { name: "Club", cost: 3, effect: "+1 Combat; Bludgeon" },
  { name: "Flail", cost: 3, effect: "+1 Combat; awkward, but gets around a shield" },
  { name: "Shredder Claws", cost: 4, effect: "+2 Combat; Piercing" },
  { name: "Throwing Knives", cost: 1, effect: "Short-ranged, light, and silent" },
  { name: "Axe", cost: 5, effect: "+1 Combat; Piercing" },
  { name: "Battle Axe", cost: 4, effect: "+2 Combat; can break a shield" },
  { name: "Double-Handed Weapon", cost: 4, effect: "+1 Combat; a Heavy Weapon" },
  { name: "Short Bow", cost: 4, effect: "+2 Combat at Medium range" },
  { name: "Long Bow", cost: 16, effect: "+2 Combat at Long range; slow to reload" },
  { name: "Massive Club", cost: 6, effect: "+2 Combat; Bludgeon" },
  { name: "Improvised Weapon", cost: 1, effect: "+1 Combat — better than nothing" },
];

const STARTER_ARMOR = [
  { name: "Shield", cost: 4, effect: "Can Block an incoming hit" },
  { name: "Light Armour", cost: 4, effect: "Basic protection, no penalty to the wearer" },
  { name: "Heavy Armour", cost: 6, effect: "+1 Combat, but a -3 penalty on related physical rolls" },
  { name: "Helmet", cost: 6, effect: "Extra protection to the head" },
];

const DEFAULT_CATALOG = {
  weapon: [
    { id: "w1", name: "Dwarven Waraxe", cost: 3, effect: "+1 damage on the charge" },
    { id: "w2", name: "Throwing Hammers", cost: 2, effect: "Ranged attack, short range" },
    ...STARTER_WEAPONS.map((w, i) => ({ id: `w${i + 3}`, ...w })),
  ],
  armor: [
    { id: "ar1", name: "Chainmail Hauberk", cost: 3, effect: "+1 defense" },
    { id: "ar2", name: "Runed Shield", cost: 2, effect: "Block one hit per battle" },
    ...STARTER_ARMOR.map((a, i) => ({ id: `ar${i + 3}`, ...a })),
  ],
  skill: [
    { id: "s1", name: "Shield Wall", cost: 2, effect: "+1 defense when adjacent to an ally" },
    { id: "s2", name: "Berserker Rage", cost: 3, effect: "+1 attack when below half health" },
  ],
  specialRule: DEFAULT_SPECIAL_RULES,
};

// Starter profiles for the template picker, adapted from Song of Blades and Heroes'
// published rosters (Quality/Combat + special rule names only — no book text reproduced).
// Quality is the SBH "roll needed" number: lower is better.
const PRESET_PROFILES = [
  { name: "Human Warrior", quality: 3, combat: 3, rules: [] },
  { name: "Human Archer", quality: 3, combat: 3, rules: ["Shooter (Long)"] },
  { name: "Human Leader", quality: 3, combat: 3, rules: ["Leader"] },
  { name: "Orc Warrior", quality: 4, combat: 3, rules: [] },
  { name: "Orc Warchief", quality: 3, combat: 4, rules: ["Leader", "Tough"] },
  { name: "Goblin Warrior", quality: 4, combat: 2, rules: [] },
  { name: "Goblin Archer", quality: 4, combat: 2, rules: ["Shooter (Medium)"] },
  { name: "Elf Warrior", quality: 2, combat: 3, rules: [] },
  { name: "Elf Archer", quality: 2, combat: 3, rules: ["Shooter (Long)"] },
  { name: "Dwarf Warrior", quality: 3, combat: 4, rules: ["Short Move"] },
  { name: "Dwarf Crossbowman", quality: 4, combat: 3, rules: ["Short Move", "Shooter (Medium)"] },
  { name: "Halfling Slinger", quality: 4, combat: 1, rules: ["Short Move", "Shooter (Medium)"] },
  { name: "Skeleton Warrior", quality: 3, combat: 2, rules: ["Undead"] },
  { name: "Zombie", quality: 6, combat: 4, rules: ["Undead", "Short Move", "Slow"] },
  { name: "Ghoul", quality: 3, combat: 2, rules: ["Undead", "Poison"] },
  { name: "Troll", quality: 5, combat: 4, rules: ["Tough", "Fearless", "Big"] },
  { name: "Ogre Warrior", quality: 4, combat: 4, rules: ["Big", "Long Move"] },
  { name: "Vampire", quality: 3, combat: 5, rules: ["Undead", "Tough", "Terror"] },
  { name: "Wraith", quality: 3, combat: 4, rules: ["Undead", "Free Disengage", "Flying"] },
  { name: "Giant Spider", quality: 3, combat: 4, rules: ["Clinging", "Entangle", "Poison", "Animal", "Big"] },
  { name: "Gryphon Warrior", quality: 3, combat: 3, rules: ["Flying"] },
  { name: "Lizardman Warrior", quality: 3, combat: 4, rules: ["Amphibious", "Tailslap"] },
  { name: "Ratman Warrior", quality: 4, combat: 3, rules: ["Gregarious"] },
  { name: "Bugbear Warrior", quality: 4, combat: 3, rules: ["Slow", "Big", "Long Move"] },
];

// Mercenary classes from "The Fate of Ostæforð" doc — used when recruiting into the shared Barracks.
// Costs are the doc's placeholder SBH-generator prices; swap in the real economy when it lands.
const BARRACKS_RECRUIT_OPTIONS = [
  { name: "Leader", quality: 3, combat: 2, rules: ["Leader"], cost: 25 },
  { name: "Base Warrior", quality: 4, combat: 2, rules: [], cost: 15 },
  { name: "Heavy Warrior", quality: 5, combat: 3, rules: [], cost: 15 },
  { name: "Beast", quality: 5, combat: 2, rules: ["Long Move"], cost: 20 },
  { name: "Ogre", quality: 5, combat: 3, rules: ["Big"], cost: 18 },
  { name: "Elite Warrior", quality: 3, combat: 3, rules: [], cost: 30 },
];

const DEFAULT_PLAYERS = [
  { id: "p1", teamId: "a", name: "Player 1", requisition: 0, loadout: { weapon: [], armor: [], skill: [] }, warband: [] },
  { id: "p2", teamId: "a", name: "Player 2", requisition: 0, loadout: { weapon: [], armor: [], skill: [] }, warband: [] },
  { id: "p3", teamId: "a", name: "Player 3", requisition: 0, loadout: { weapon: [], armor: [], skill: [] }, warband: [] },
  { id: "p7", teamId: "a", name: "Player 4", requisition: 0, loadout: { weapon: [], armor: [], skill: [] }, warband: [] },
  { id: "p4", teamId: "b", name: "Player 1", requisition: 0, loadout: { weapon: [], armor: [], skill: [] }, warband: [] },
  { id: "p5", teamId: "b", name: "Player 2", requisition: 0, loadout: { weapon: [], armor: [], skill: [] }, warband: [] },
  { id: "p6", teamId: "b", name: "Player 3", requisition: 0, loadout: { weapon: [], armor: [], skill: [] }, warband: [] },
  { id: "p8", teamId: "b", name: "Player 4", requisition: 0, loadout: { weapon: [], armor: [], skill: [] }, warband: [] },
];

const SHARED_DEFAULTS = {
  teams: DEFAULT_TEAMS,
  regions: DEFAULT_REGIONS,
  turns: DEFAULT_TURNS,
  currentTurn: 0,
  totals: { a: 0, b: 0 },
  log: [],
  catalog: DEFAULT_CATALOG,
  players: DEFAULT_PLAYERS,
  rounds: {},
  finale: {},
  barracks: [],
  timer: { type: null, totalSeconds: 0, endAt: null, paused: false, remainingAtPause: null },
};

const TIMER_PRESETS = {
  round: { label: "Round", seconds: 3600 },
  planning: { label: "Planning", seconds: 900 },
};

// (storage keys/paths now live in firebase.js)

function newRound(slotCount = 4) {
  return {
    slotCount,
    matchups: Array.from({ length: slotCount }, (_, i) => ({
      slot: i, a: null, b: null, notesA: "", notesB: "", winner: null,
    })),
    status: { a: "drafting", b: "drafting" },
    revealed: false,
  };
}

function loadFont() {
  if (typeof document === "undefined") return;
  if (document.getElementById("dq-fonts")) return;
  const link = document.createElement("link");
  link.id = "dq-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Spectral:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;600&display=swap";
  document.head.appendChild(link);
}

/* =========================================================================
   SHARED STYLE
   ========================================================================= */

const GlobalStyle = () => (
  <style>{`
    * { box-sizing: border-box; }
    .dq-display { font-family: 'Cinzel', serif; letter-spacing: 0.03em; }
    .dq-mono { font-family: 'JetBrains Mono', monospace; }
    .dq-body { font-family: 'Spectral', serif; }
    .dq-region-dot { transition: transform 0.25s ease, filter 0.25s ease; }
    .dq-region-dot:hover, .dq-region-dot:focus-visible { transform: translate(-50%,-50%) scale(1.25) !important; filter: brightness(1.35); }
    .dq-panel { background: linear-gradient(180deg, rgba(40,34,27,0.9), rgba(24,20,16,0.95)); border: 1px solid rgba(201,162,39,0.18); }
    .dq-fade-in { animation: dqFade 0.4s ease both; }
    @keyframes dqFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    .dq-glow { animation: dqGlow 2.4s ease-in-out infinite; }
    @keyframes dqGlow { 0%,100% { filter: drop-shadow(0 0 2px currentColor); } 50% { filter: drop-shadow(0 0 9px currentColor); } }
    @media (prefers-reduced-motion: reduce) { .dq-region-dot, .dq-fade-in, .dq-glow { animation: none !important; transition: none !important; } }
    input, textarea, select { background: rgba(0,0,0,0.25); border: 1px solid rgba(201,162,39,0.25); color: #E9DFC8; font-family: 'Spectral', serif; }
    input:focus, textarea:focus, select:focus { outline: 2px solid #C9A227; outline-offset: 1px; }
    button:focus-visible { outline: 2px solid #C9A227; outline-offset: 2px; }
    .dq-tabbar { display: flex; overflow-x: auto; border-bottom: 1px solid rgba(201,162,39,0.18); }
    .dq-tabbar::-webkit-scrollbar { display: none; }
    .dq-tab-btn { flex: 1 0 auto; padding: 12px 14px; background: transparent; border: none; border-bottom: 2px solid transparent; color: #8A7C5C; font-size: 11.5px; letter-spacing: 0.06em; cursor: pointer; white-space: nowrap; font-family: 'JetBrains Mono', monospace; }
    .dq-tab-btn.active { color: #F0E6C8; border-bottom-color: #C9A227; background: rgba(201,162,39,0.1); }
    .dq-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px; font-size: 10.5px; font-family: 'JetBrains Mono', monospace; }
  `}</style>
);

const iconBtnStyle = { background: "rgba(201,162,39,0.12)", border: "1px solid rgba(201,162,39,0.3)", color: "#C9A227", borderRadius: 4, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 };
const navBtnStyle = { background: "transparent", border: "1px solid rgba(201,162,39,0.3)", color: "#C9A227", borderRadius: 4, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const smallBtnStyle = { background: "rgba(201,162,39,0.1)", border: "1px solid rgba(201,162,39,0.3)", color: "#C9A227", borderRadius: 4, padding: "7px 12px", fontSize: 11.5, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" };
const primaryBtnStyle = { background: "linear-gradient(180deg, #C9A227, #A9841C)", border: "none", color: "#1a1509", borderRadius: 5, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Cinzel', serif", letterSpacing: "0.03em" };
const dangerBtnStyle = { ...smallBtnStyle, color: "#D98878", border: "1px solid rgba(217,136,120,0.4)", background: "rgba(217,136,120,0.08)" };

/* =========================================================================
   ROOT APP — identity gate, shared-state load/poll
   ========================================================================= */

export default function App() {
  const [shared, setShared] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [identity, setIdentity] = useState(null); // { role: 'command'|'player', playerId }
  const editingRef = useRef(false); // pause live-sync overwrite while a text field is focused
  const sharedRef = useRef(null); // always mirrors `shared` — patchShared reads from this, not stale state
  const [toast, setToast] = useState(null);

  useEffect(() => { loadFont(); }, []);
  useEffect(() => { sharedRef.current = shared; }, [shared]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  // Seed a brand-new campaign if needed, then subscribe for real-time updates. Unlike the old
  // polling setup, this fires the instant *any* change lands — no 7-second lag, and no ambiguity
  // about whether the campaign "doesn't exist yet" vs. "failed to load" (Firebase tells us plainly).
  useEffect(() => {
    let unsubscribe;
    (async () => {
      try {
        await ensureCampaignSeeded(SHARED_DEFAULTS);
      } catch (e) {
        console.error("Failed to seed campaign:", e);
      }
      unsubscribe = subscribeShared((data) => {
        if (editingRef.current) return; // don't yank focus/text out from under someone typing
        setShared(data || SHARED_DEFAULTS);
        setLoaded(true);
      });
    })();
    setIdentity(loadIdentity());
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const manualRefresh = useCallback(async () => {
    try {
      const data = await fetchSharedOnce();
      if (data) setShared(data);
    } catch (e) {}
  }, []);

  // Diffs the mutator's output against the live, continuously-synced local state and writes
  // only the paths that actually changed. No read-before-write round trip needed here — the
  // real-time subscription already keeps sharedRef.current fresh, which is what made the old
  // read-then-write dance (and its race conditions) necessary in the first place.
  const patchShared = useCallback((mutator) => {
    const base = sharedRef.current || SHARED_DEFAULTS;
    return patchSharedFirebase(base, mutator).catch((e) => {
      console.error("Save failed:", e);
      showToast("Save failed — check connection and try again");
    });
  }, []);

  const chooseIdentity = (next) => {
    setIdentity(next);
    saveIdentity(next);
  };

  const switchIdentity = () => {
    setIdentity(null);
    clearIdentity();
  };

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: "#171310", color: "#8A7C5C", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
        <GlobalStyle />
        loading campaign…
      </div>
    );
  }

  if (!identity) {
    return <IdentityGate shared={shared} onChoose={chooseIdentity} onRefresh={manualRefresh} />;
  }

  if (identity.role === "command") {
    return <CommandConsole shared={shared} patchShared={patchShared} onSwitch={switchIdentity} toast={toast} showToast={showToast} editingRef={editingRef} onManualRefresh={manualRefresh} gmName={identity.gmName} />;
  }

  const me = shared.players.find((p) => p.id === identity.playerId);
  if (!me) {
    // player was removed from roster — bounce back to gate
    return <IdentityGate shared={shared} onChoose={chooseIdentity} onRefresh={manualRefresh} />;
  }

  return <PlayerConsole shared={shared} patchShared={patchShared} me={me} onSwitch={switchIdentity} toast={toast} showToast={showToast} editingRef={editingRef} onManualRefresh={manualRefresh} />;
}

/* =========================================================================
   IDENTITY GATE
   ========================================================================= */

function IdentityGate({ shared, onChoose, onRefresh }) {
  const { teams, players } = shared;
  const [gmMode, setGmMode] = useState(false);
  const [gmName, setGmName] = useState("");

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 50% -10%, #241f1a 0%, #171310 55%, #0f0d0b 100%)", color: "#E9DFC8", display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px" }}>
      <GlobalStyle />
            <img src="/dq-rune-hero.png" alt="Dwarf Quest" style={{ height: 96, width: "auto", filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.5))", marginBottom: 6 }} />
      <h1 className="dq-display" style={{ fontSize: 24, margin: "10px 0 2px", color: "#F0E6C8" }}>DWARF QUEST</h1>
      <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", marginBottom: 32, letterSpacing: "0.08em" }}>WHO GOES THERE?</div>

      {!gmMode ? (
        <button onClick={() => setGmMode(true)} className="dq-panel" style={{ width: "100%", maxWidth: 360, padding: "16px 18px", borderRadius: 8, marginBottom: 24, cursor: "pointer", color: "#F0E6C8", display: "flex", alignItems: "center", gap: 12 }}>
          <Crown size={20} color="#C9A227" />
          <div style={{ textAlign: "left" }}>
            <div className="dq-display" style={{ fontSize: 14, fontWeight: 700 }}>Command Console</div>
            <div className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C" }}>For any of the day's GMs — full campaign control</div>
          </div>
        </button>
      ) : (
        <div className="dq-panel dq-fade-in" style={{ width: "100%", maxWidth: 360, padding: "16px 18px", borderRadius: 8, marginBottom: 24 }}>
          <div className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C", marginBottom: 8 }}>WHICH GM ARE YOU?</div>
          <input
            autoFocus
            value={gmName}
            onChange={(e) => setGmName(e.target.value)}
            placeholder="e.g. Anthony, Sam, Priya…"
            style={{ width: "100%", padding: "9px 10px", borderRadius: 6, fontSize: 13.5, marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setGmMode(false)} style={{ ...smallBtnStyle, flex: 1 }}>Back</button>
            <button onClick={() => onChoose({ role: "command", gmName: gmName.trim() || "GM" })} style={{ ...primaryBtnStyle, flex: 2 }}>Enter Console</button>
          </div>
          <div className="dq-mono" style={{ fontSize: 9.5, color: "#6b5f47", marginTop: 8 }}>All GMs share the same controls — this just labels who's driving on this device.</div>
        </div>
      )}

      {teams.map((t) => {
        const teamPlayers = players.filter((p) => p.teamId === t.id);
        return (
          <div key={t.id} style={{ width: "100%", maxWidth: 360, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: t.color, boxShadow: `0 0 6px ${t.color}` }} />
              <span className="dq-mono" style={{ fontSize: 11, color: "#B7A985", letterSpacing: "0.06em" }}>{t.name.toUpperCase()}</span>
            </div>
            {teamPlayers.length === 0 && <div style={{ fontSize: 12, color: "#6b5f47", fontStyle: "italic" }}>No players added yet — ask Command to add you.</div>}
            {teamPlayers.map((p) => (
              <button key={p.id} onClick={() => onChoose({ role: "player", playerId: p.id })} className="dq-panel" style={{ width: "100%", padding: "12px 16px", borderRadius: 6, marginBottom: 8, cursor: "pointer", color: "#E9DFC8", textAlign: "left", fontSize: 13.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {p.name}
                <span className="dq-mono" style={{ fontSize: 10.5, color: t.color }}>{p.requisition} Bz</span>
              </button>
            ))}
          </div>
        );
      })}

      <button onClick={onRefresh} style={{ ...smallBtnStyle, marginTop: 12 }}>
        <RefreshCw size={12} style={{ marginRight: 5, verticalAlign: -2 }} />
        Refresh roster
      </button>
    </div>
  );
}

/* =========================================================================
   HEADER (shared shell for both consoles)
   ========================================================================= */

function ConsoleHeader({ title, subtitle, right, onSwitch }) {
  return (
    <div style={{ borderBottom: "1px solid rgba(201,162,39,0.2)", padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Crown size={22} color="#C9A227" style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div className="dq-display" style={{ fontSize: 17, fontWeight: 700, color: "#F0E6C8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          <div className="dq-mono" style={{ fontSize: 9.5, color: "#8A7C5C", letterSpacing: "0.06em" }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {right}
        <button onClick={onSwitch} title="Switch identity" style={{ ...smallBtnStyle, display: "flex", alignItems: "center", gap: 5 }}>
          <LogOut size={12} /> Switch
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   COMMAND CONSOLE
   ========================================================================= */

const COMMAND_TABS = [["map", "Map"], ["turn", "Turn"], ["battles", "Battles"], ["balance", "Balance"], ["roster", "Roster"], ["ledger", "Ledger"]];

function CommandConsole({ shared, patchShared, onSwitch, toast, showToast, editingRef, onManualRefresh, gmName }) {
  const [tab, setTab] = useState("map");
  const { teams, regions, turns, currentTurn, totals, log, catalog, players, rounds } = shared;
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [editingTurnText, setEditingTurnText] = useState(false);

  const turnGains = (teamId) => regions.filter((r) => r.owner === teamId).reduce((sum, r) => sum + Number(r.renown || 0), 0);
  const turn = turns[currentTurn];
  const round = rounds[turn?.number] || newRound();

  const setOwner = (regionId, ownerId) => patchShared((s) => ({ ...s, regions: s.regions.map((r) => (r.id === regionId ? { ...r, owner: ownerId } : r)) }));
  const updateRegion = (regionId, patch) => patchShared((s) => ({ ...s, regions: s.regions.map((r) => (r.id === regionId ? { ...r, ...patch } : r)) }));

  const advanceTurn = () => {
    setTab("turn");
    patchShared((s) => {
      const gA = s.regions.filter((r) => r.owner === "a").reduce((sum, r) => sum + Number(r.renown || 0), 0);
      const gB = s.regions.filter((r) => r.owner === "b").reduce((sum, r) => sum + Number(r.renown || 0), 0);
      const newTotals = { a: s.totals.a + gA, b: s.totals.b + gB };
      const t = s.turns[s.currentTurn];
      const newLog = [...s.log, { turn: t?.number ?? s.currentTurn + 1, title: t?.title ?? "", gainA: gA, gainB: gB }];
      const nextIdx = Math.min(s.currentTurn + 1, s.turns.length - 1);
      const nextTurn = s.turns[nextIdx];
      showToast(`Turn tallied — ${s.teams[0].name} +${gA}, ${s.teams[1].name} +${gB}. Now on Turn ${nextTurn?.number ?? nextIdx + 1}.`);
      return { ...s, totals: newTotals, log: newLog, currentTurn: nextIdx };
    });
  };

  const addTurn = () => patchShared((s) => ({ ...s, turns: [...s.turns, { number: s.turns.length + 1, title: "Untitled Scenario", intro: "Write this turn's introduction..." }] }));
  const updateTurn = (patch) => patchShared((s) => ({ ...s, turns: s.turns.map((t, i) => (i === s.currentTurn ? { ...t, ...patch } : t)) }));
  const setCurrentTurn = (idxOrFn) => patchShared((s) => ({ ...s, currentTurn: typeof idxOrFn === "function" ? idxOrFn(s.currentTurn) : idxOrFn }));

  const region = regions.find((r) => r.id === selectedRegion);

  return (
    <div style={{ fontFamily: "'Spectral', serif", background: "radial-gradient(ellipse at 50% -10%, #241f1a 0%, #171310 55%, #0f0d0b 100%)", color: "#E9DFC8", minHeight: "100vh" }}>
      <GlobalStyle />
      <ConsoleHeader
        title="DWARF QUEST"
        subtitle={`COMMAND CONSOLE · ${gmName || "GM"}`}
        onSwitch={onSwitch}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            {teams.map((t) => (
              <div key={t.id} className="dq-chip" style={{ background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}55` }}>
                {t.name.split(" ")[0]}: {t === teams[0] ? totals.a : totals.b}
              </div>
            ))}
          </div>
        }
      />

      <TimerBar timer={shared.timer} patchShared={patchShared} showControls />

      <div className="dq-tabbar">
        {COMMAND_TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`dq-tab-btn ${tab === key ? "active" : ""}`}>{label.toUpperCase()}</button>
        ))}
      </div>

      <div style={{ padding: 18, maxWidth: 920, margin: "0 auto" }}>
        {tab === "map" && (
          <>
            <CityscapeMap regions={regions} teams={teams} onSelect={setSelectedRegion} selected={selectedRegion} />
            <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              {teams.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 11, height: 11, borderRadius: "50%", background: t.color, boxShadow: `0 0 6px ${t.color}` }} />
                  <span className="dq-mono" style={{ fontSize: 11.5, color: "#B7A985" }}>{t.name}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#57503f" }} />
                <span className="dq-mono" style={{ fontSize: 11.5, color: "#8A7C5C" }}>Uncontrolled</span>
              </div>
            </div>
            {region && (
              <RegionEditor region={region} teams={teams} editingRef={editingRef} onSetOwner={(id) => setOwner(region.id, id)} onUpdate={(p) => updateRegion(region.id, p)} onClose={() => setSelectedRegion(null)} />
            )}
            <FinaleTrack totals={totals} teams={teams} finale={shared.finale} shared={shared} patchShared={patchShared} editable />
          </>
        )}

        {tab === "turn" && turn && (
          <TurnPanel
            turn={turn} turns={turns} currentTurn={currentTurn} setCurrentTurn={setCurrentTurn}
            editing={editingTurnText} setEditing={setEditingTurnText} onAddTurn={addTurn} onAdvance={advanceTurn}
            teams={teams} turnGains={turnGains} updateTurn={updateTurn} editingRef={editingRef}
          />
        )}

        {tab === "battles" && (
          <BattlesPanel shared={shared} patchShared={patchShared} turn={turn} round={round} showToast={showToast} />
        )}

        {tab === "balance" && (
          <BalanceDashboard shared={shared} />
        )}

        {tab === "roster" && (
          <RosterPanel shared={shared} patchShared={patchShared} editingRef={editingRef} showToast={showToast} />
        )}

        {tab === "ledger" && (
          <>
            <RenownLedger totals={totals} teams={teams} log={log} />
            <ManualAdjust teams={teams} patchShared={patchShared} showToast={showToast} />
          </>
        )}
      </div>

      {toast && <Toast msg={toast} />}
    </div>
  );
}

/* =========================================================================
   PLAYER CONSOLE
   ========================================================================= */

const PLAYER_TABS = [["scenario", "Scenario"], ["warband", "War Band"], ["armory", "Armoury"], ["barracks", "Barracks"], ["deploy", "Deploy"]];

function PlayerConsole({ shared, patchShared, me, onSwitch, toast, showToast, editingRef, onManualRefresh }) {
  const [tab, setTab] = useState("scenario");
  const { teams, turns, currentTurn, catalog, players, rounds, totals, finale, barracks } = shared;
  const myTeam = teams.find((t) => t.id === me.teamId);
  const otherTeam = teams.find((t) => t.id !== me.teamId);
  const turn = turns[currentTurn];
  const round = rounds[turn?.number] || newRound();
  const myTeamPlayers = players.find((p) => p.id === me.id) ? players.filter((p) => p.teamId === me.teamId) : [];

  return (
    <div style={{ fontFamily: "'Spectral', serif", background: "radial-gradient(ellipse at 50% -10%, #241f1a 0%, #171310 55%, #0f0d0b 100%)", color: "#E9DFC8", minHeight: "100vh" }}>
      <GlobalStyle />
      <ConsoleHeader
        title={me.name}
        subtitle={`${myTeam?.name?.toUpperCase() || ""} · PLAYER CONSOLE`}
        onSwitch={onSwitch}
        right={
          <div className="dq-chip" style={{ background: `${myTeam?.color}22`, color: myTeam?.color, border: `1px solid ${myTeam?.color}55` }}>
            <Coins size={11} /> {me.requisition} Bz
          </div>
        }
      />

      <TimerBar timer={shared.timer} patchShared={patchShared} showControls={false} />

      <div className="dq-tabbar">
        {PLAYER_TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`dq-tab-btn ${tab === key ? "active" : ""}`}>{label.toUpperCase()}</button>
        ))}
      </div>

      <div style={{ padding: 18, maxWidth: 640, margin: "0 auto" }}>
        {tab === "scenario" && turn && (
          <div className="dq-panel dq-fade-in" style={{ borderRadius: 8, padding: 20 }}>
            <div className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 8 }}>TURN {turn.number} OF {turns.length}</div>
            <h2 className="dq-display" style={{ fontSize: 21, color: "#F0E6C8", margin: "0 0 10px 0" }}>{turn.title}</h2>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "#C9BC9C", fontStyle: "italic", margin: 0 }}>{turn.intro}</p>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(201,162,39,0.15)" }}>
              <div className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C" }}>
                {round.status[me.teamId] === "submitted" ? "Your team's plan is submitted." : "Your team hasn't submitted a plan for this turn yet — see Deploy."}
              </div>
            </div>
          </div>
        )}

        {tab === "scenario" && turn && (
          <FinaleTrack totals={totals} teams={teams} finale={finale} shared={shared} editable={false} />
        )}

        {tab === "warband" && (
          <WarBandView me={me} catalog={catalog} teamColor={myTeam?.color} patchShared={patchShared} showToast={showToast} barracks={barracks} godSlots={(finale?.godSlots || {})[me.teamId] || []} />
        )}

        {tab === "barracks" && (
          <BarracksPanel me={me} myTeam={myTeam} catalog={catalog} barracks={barracks} patchShared={patchShared} showToast={showToast} />
        )}

        {tab === "deploy" && turn && (
          <DeployPanel
            shared={shared} patchShared={patchShared} me={me} myTeam={myTeam} otherTeam={otherTeam}
            turn={turn} round={round} myTeamPlayers={myTeamPlayers} editingRef={editingRef} showToast={showToast}
          />
        )}

        {tab === "armory" && (
          <ArmoryPanel me={me} catalog={catalog} patchShared={patchShared} showToast={showToast} teamColor={myTeam?.color} />
        )}
      </div>

      {toast && <Toast msg={toast} />}
    </div>
  );
}

/* =========================================================================
   MAP (unchanged from prior version)
   ========================================================================= */

function CityscapeMap({ regions, teams, onSelect, selected }) {
  const teamById = (id) => teams.find((t) => t.id === id);
  const selectedRegion = regions.find((r) => r.id === selected);
  return (
    <div className="dq-panel" style={{ position: "relative", borderRadius: 8, width: "100%", aspectRatio: "4 / 3", overflow: "hidden" }}>
      <svg viewBox="0 0 100 75" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <rect x="0" y="0" width="100" height="75" fill="#221d18" />
        <path d="M -5 40 Q 25 32, 45 45 T 105 38" stroke="#1c2c33" strokeWidth="7" fill="none" opacity="0.8" />
        {[[3,46,11,20],[16,36,9,30],[26,48,8,16],[34,24,13,40],[48,44,9,22],[58,20,11,46],[70,40,9,28],[80,28,12,38],[92,46,6,18],[8,12,14,18],[46,4,10,16],[66,6,10,12]].map(([x,y,w,h],i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill="#3a3226" stroke="#4a4132" strokeWidth="0.3" />
        ))}
        <line x1="0" y1="20" x2="100" y2="20" stroke="#2a2419" strokeWidth="0.6" />
        <line x1="0" y1="58" x2="100" y2="58" stroke="#2a2419" strokeWidth="0.6" />
        <line x1="42" y1="0" x2="42" y2="75" stroke="#2a2419" strokeWidth="0.6" />
        <line x1="75" y1="0" x2="75" y2="75" stroke="#2a2419" strokeWidth="0.6" />
        <defs><radialGradient id="vign" cx="50%" cy="42%" r="72%"><stop offset="0%" stopColor="transparent" /><stop offset="100%" stopColor="#0f0d0b" stopOpacity="0.55" /></radialGradient></defs>
        <rect x="0" y="0" width="100" height="75" fill="url(#vign)" />
      </svg>
      {regions.map((r) => {
        const owner = r.owner ? teamById(r.owner) : null;
        const color = owner ? owner.color : "#6b6249";
        const isSelected = selected === r.id;
        return (
          <button key={r.id} onClick={() => onSelect(isSelected ? null : r.id)} aria-label={`${r.name}${owner ? `, controlled by ${owner.name}` : ", uncontrolled"}`} className="dq-region-dot"
            style={{ position: "absolute", left: `${r.x}%`, top: `${r.y}%`, transform: "translate(-50%,-50%)", width: "clamp(14px, 3.2vw, 20px)", height: "clamp(14px, 3.2vw, 20px)", borderRadius: "50%", background: color, border: isSelected ? "2px solid #F0E6C8" : "2px solid rgba(0,0,0,0.5)", boxShadow: owner ? `0 0 10px ${color}` : "none", cursor: "pointer", padding: 0, zIndex: isSelected ? 3 : 1 }} />
        );
      })}
      {selectedRegion && (
        <div className="dq-fade-in dq-mono" style={{ position: "absolute", left: `${Math.min(78, Math.max(2, selectedRegion.x))}%`, top: `${selectedRegion.y}%`, transform: selectedRegion.y > 55 ? "translate(0, -130%)" : "translate(0, 14px)", background: "#0f0d0bdd", border: "1px solid rgba(201,162,39,0.4)", borderRadius: 4, padding: "3px 8px", fontSize: 11, color: "#F0E6C8", whiteSpace: "nowrap", pointerEvents: "none", zIndex: 4 }}>
          {selectedRegion.name}
        </div>
      )}
    </div>
  );
}

function RegionRenownControl({ renown, onUpdate }) {
  const [local, setLocal] = useState(renown);
  const timerRef = useRef(null);
  useEffect(() => { setLocal(renown); }, [renown]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const commitSoon = (value) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onUpdate({ renown: value }), 400);
  };

  const adjust = (delta) => {
    setLocal((v) => {
      const next = Math.max(0, v + delta);
      commitSoon(next);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button onClick={() => adjust(-1)} style={iconBtnStyle}><Minus size={13} /></button>
      <input
        type="number"
        value={local}
        onChange={(e) => setLocal(Number(e.target.value))}
        onBlur={(e) => onUpdate({ renown: Math.max(0, Number(e.target.value) || 0) })}
        className="dq-mono"
        style={{ width: 48, textAlign: "center", padding: "5px 4px", borderRadius: 4 }}
      />
      <button onClick={() => adjust(1)} style={iconBtnStyle}><Plus size={13} /></button>
    </div>
  );
}

function RegionEditor({ region, teams, editingRef, onSetOwner, onUpdate, onClose }) {
  return (
    <div className="dq-panel dq-fade-in" style={{ marginTop: 14, borderRadius: 8, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <input defaultValue={region.name} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; onUpdate({ name: e.target.value }); }} className="dq-display" style={{ fontSize: 16, fontWeight: 700, padding: "4px 8px", borderRadius: 4, flex: 1, minWidth: 0 }} />
        <button onClick={onClose} aria-label="Close district editor" style={{ background: "transparent", border: "none", color: "#8A7C5C", cursor: "pointer", flexShrink: 0 }}><X size={18} /></button>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {teams.map((t) => (
          <button key={t.id} onClick={() => onSetOwner(region.owner === t.id ? null : t.id)} style={{ flex: "1 1 120px", padding: "8px 10px", borderRadius: 6, border: region.owner === t.id ? `2px solid ${t.color}` : "1px solid rgba(201,162,39,0.25)", background: region.owner === t.id ? `${t.color}22` : "transparent", color: "#E9DFC8", fontSize: 12.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {region.owner === t.id && <Check size={13} color={t.color} />}{t.name}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <div className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C", marginBottom: 4 }}>RENOWN / TURN</div>
        <RegionRenownControl renown={region.renown} onUpdate={onUpdate} />
      </div>
      <div style={{ marginTop: 14 }}>
        <div className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C", marginBottom: 4 }}>CONTROL BENEFIT</div>
        <textarea defaultValue={region.benefit} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; onUpdate({ benefit: e.target.value }); }} rows={2} style={{ width: "100%", padding: 8, borderRadius: 4, fontSize: 13, resize: "vertical" }} />
      </div>
    </div>
  );
}

function TurnPanel({ turn, turns, currentTurn, setCurrentTurn, editing, setEditing, onAddTurn, onAdvance, teams, turnGains, updateTurn, editingRef }) {
  return (
    <div className="dq-panel" style={{ borderRadius: 8, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => setCurrentTurn((c) => Math.max(0, c - 1))} disabled={currentTurn === 0} style={{ ...navBtnStyle, opacity: currentTurn === 0 ? 0.3 : 1 }} aria-label="Previous turn"><ChevronLeft size={16} /></button>
        <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em" }}>TURN {turn.number} OF {turns.length}</div>
        <button onClick={() => setCurrentTurn((c) => Math.min(turns.length - 1, c + 1))} disabled={currentTurn === turns.length - 1} style={{ ...navBtnStyle, opacity: currentTurn === turns.length - 1 ? 0.3 : 1 }} aria-label="Next turn"><ChevronRight size={16} /></button>
      </div>
      <div key={turn.number} className="dq-fade-in" style={{ marginTop: 10 }}>
        {editing ? (
          <>
            <input defaultValue={turn.title} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; updateTurn({ title: e.target.value }); }} className="dq-display" style={{ fontSize: 18, fontWeight: 700, width: "100%", padding: "4px 8px", borderRadius: 4, marginBottom: 8 }} />
            <textarea defaultValue={turn.intro} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; updateTurn({ intro: e.target.value }); }} rows={4} style={{ width: "100%", padding: 8, borderRadius: 4, fontSize: 13.5, fontStyle: "italic", resize: "vertical" }} />
            <button onClick={() => setEditing(false)} style={{ ...smallBtnStyle, marginTop: 8 }}>Done editing</button>
          </>
        ) : (
          <>
            <h2 className="dq-display" style={{ fontSize: 19, color: "#F0E6C8", margin: "0 0 8px 0" }}>{turn.title}</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#C9BC9C", fontStyle: "italic", margin: 0 }}>{turn.intro}</p>
            <button onClick={() => setEditing(true)} style={{ ...smallBtnStyle, marginTop: 10 }}>Edit scenario text</button>
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 12, marginBottom: 14, flexWrap: "wrap" }}>
        {teams.map((t) => (<div key={t.id} className="dq-mono" style={{ fontSize: 11, color: t.color }}>{t.name.split(" ")[0]}: +{turnGains(t.id)} this turn</div>))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onAdvance} style={{ ...primaryBtnStyle, flex: 1 }}><Flame size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Tally &amp; Advance Turn</button>
        <button onClick={onAddTurn} style={smallBtnStyle} title="Add a new turn to the campaign"><Plus size={13} /></button>
      </div>
    </div>
  );
}

function RenownLedger({ totals, teams, log }) {
  const max = Math.max(totals.a, totals.b, 1);
  return (
    <div className="dq-panel" style={{ borderRadius: 8, padding: 18 }}>
      <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 12 }}>RENOWN LEDGER</div>
      {teams.map((t, i) => {
        const total = i === 0 ? totals.a : totals.b;
        return (
          <div key={t.id} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, color: "#E9DFC8" }}>{t.name}</span>
              <span className="dq-mono" style={{ fontSize: 14, fontWeight: 700, color: t.color }}>{total}</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(0,0,0,0.35)", overflow: "hidden" }}>
              <div style={{ width: `${(total / max) * 100}%`, height: "100%", background: t.color, boxShadow: `0 0 8px ${t.color}`, transition: "width 0.6s ease" }} />
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: 8, borderTop: "1px solid rgba(201,162,39,0.15)", paddingTop: 10, maxHeight: 240, overflowY: "auto" }}>
        {log.length === 0 && <div style={{ fontSize: 12, color: "#6b5f47", fontStyle: "italic" }}>No turns tallied yet.</div>}
        {[...log].reverse().map((entry, i) => (
          <div key={i} className="dq-fade-in" style={{ fontSize: 11.5, color: "#B7A985", marginBottom: 6, display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>Turn {entry.turn} — {entry.title}</span>
            <span className="dq-mono" style={{ flexShrink: 0 }}>+{entry.gainA} / +{entry.gainB}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManualAdjust({ teams, patchShared, showToast }) {
  const adjust = (teamId, amount) => {
    patchShared((s) => {
      const totals = { ...s.totals, [teamId]: Math.max(0, s.totals[teamId] + amount) };
      const t = s.turns[s.currentTurn];
      const log = [...s.log, { turn: t?.number ?? s.currentTurn + 1, title: `GM adjustment`, gainA: teamId === "a" ? amount : 0, gainB: teamId === "b" ? amount : 0 }];
      return { ...s, totals, log };
    });
    showToast(`${amount > 0 ? "+" : ""}${amount} renown applied`);
  };
  return (
    <div className="dq-panel dq-fade-in" style={{ borderRadius: 8, padding: 16, marginTop: 16 }}>
      <div className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 10 }}>
        <Scale size={11} style={{ marginRight: 5, verticalAlign: -2 }} />GM MANUAL RENOWN ADJUSTMENT
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {teams.map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, color: "#E9DFC8", flex: 1 }}>{t.name}</span>
            {[-5, -1, 1, 5].map((n) => (
              <button key={n} onClick={() => adjust(t.id, n)} style={{ ...smallBtnStyle, width: 40, textAlign: "center" }}>{n > 0 ? `+${n}` : n}</button>
            ))}
          </div>
        ))}
      </div>
      <div className="dq-mono" style={{ fontSize: 9.5, color: "#6b5f47", marginTop: 8 }}>Use for penalties, bonuses, or on-the-spot rules calls — logged below as a GM adjustment.</div>
    </div>
  );
}

function teamCharacterCounts(shared, teamId) {
  const teamPlayers = shared.players.filter((p) => p.teamId === teamId);
  const personal = teamPlayers.flatMap((p) => p.warband || []);
  const mercs = (shared.barracks || []).filter((m) => m.teamId === teamId && m.assignedTo);
  const all = [...personal, ...mercs];
  const surviving = all.filter((m) => m.status !== "ooa");
  const legends = surviving.filter((m) => m.legend);
  const mortals = surviving.filter((m) => !m.legend);
  const eligible = surviving.filter((m) => !m.legend && (m.specialRules || []).length >= LEGEND_SKILL_THRESHOLD);
  return { legends: legends.length, mortals, eligible: eligible.length, total: surviving.length };
}

function invocationDiceFor(mortalCount) {
  return Math.min(3, Math.floor(mortalCount / 4));
}

function FinaleTrack({ totals, teams, finale, shared, patchShared, editable }) {
  const updateThreshold = (tierId, threshold) => {
    patchShared((s) => ({ ...s, finale: { ...(s.finale || {}), [tierId]: { threshold } } }));
  };

  const addGodSlot = (teamId) => {
    patchShared((s) => {
      const godSlots = { ...(s.finale?.godSlots || {}) };
      const teamSlots = godSlots[teamId] || [];
      if (teamSlots.length >= MAX_GOD_SLOTS) return s;
      const slot = { id: "god" + Date.now() + Math.floor(Math.random() * 1000), name: `God ${teamSlots.length + 1}`, tier: "tier1" };
      return { ...s, finale: { ...(s.finale || {}), godSlots: { ...godSlots, [teamId]: [...teamSlots, slot] } } };
    });
  };

  const updateGodSlot = (teamId, slotId, patch) => {
    patchShared((s) => {
      const godSlots = { ...(s.finale?.godSlots || {}) };
      const teamSlots = (godSlots[teamId] || []).map((g) => (g.id === slotId ? { ...g, ...patch } : g));
      return { ...s, finale: { ...(s.finale || {}), godSlots: { ...godSlots, [teamId]: teamSlots } } };
    });
  };

  const removeGodSlot = (teamId, slotId) => {
    patchShared((s) => {
      const godSlots = { ...(s.finale?.godSlots || {}) };
      const teamSlots = (godSlots[teamId] || []).filter((g) => g.id !== slotId);
      // unassign any mortals pointed at the removed slot
      const players = s.players.map((p) => ({
        ...p,
        warband: (p.warband || []).map((m) => (m.godSlot === slotId ? { ...m, godSlot: null } : m)),
      }));
      const barracks = (s.barracks || []).map((m) => (m.godSlot === slotId ? { ...m, godSlot: null } : m));
      return { ...s, players, barracks, finale: { ...(s.finale || {}), godSlots: { ...godSlots, [teamId]: teamSlots } } };
    });
  };

  return (
    <div className="dq-panel" style={{ marginTop: 14, borderRadius: 8, padding: 16 }}>
      <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 4 }}>ARRIVAL OF THE GODS — FINALE</div>
      <div style={{ fontSize: 10.5, color: "#6b5f47", marginBottom: 12 }}>
        House rule: each team fields up to {MAX_GOD_SLOTS} gods total, funded by the team's Renown — not strict OGaM's one-God-per-force. Tier thresholds below are a build guide, not a hard gate.
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        {GOD_TIERS.map((tier) => {
          const Icon = tier.icon;
          const threshold = (finale && finale[tier.id]?.threshold) ?? tier.threshold;
          const unlockedBy = teams.filter((t, i) => (i === 0 ? totals.a : totals.b) >= threshold);
          const isUnlocked = unlockedBy.length > 0;
          const color = isUnlocked ? unlockedBy[0].color : "#57503f";
          return (
            <div key={tier.id} title={`${tier.name} — reference at ${threshold} renown. ${tier.desc}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 96, opacity: isUnlocked ? 1 : 0.45 }}>
              <div className={isUnlocked ? "dq-glow" : ""} style={{ color, width: 40, height: 40, borderRadius: "50%", border: `1px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={18} /></div>
              <div style={{ fontSize: 10, textAlign: "center", color: "#B7A985", lineHeight: 1.25 }}>{tier.name}</div>
              <div style={{ fontSize: 8.5, textAlign: "center", color: "#6b5f47", lineHeight: 1.2 }}>{tier.desc}</div>
              {editable ? (
                <input
                  type="number"
                  defaultValue={threshold}
                  onBlur={(e) => updateThreshold(tier.id, Number(e.target.value))}
                  className="dq-mono"
                  style={{ width: 44, padding: "2px 4px", borderRadius: 4, fontSize: 9, textAlign: "center" }}
                />
              ) : (
                <div className="dq-mono" style={{ fontSize: 9, color: "#6b5f47" }}>{threshold} rp</div>
              )}
            </div>
          );
        })}
      </div>

      {shared && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, borderTop: "1px solid rgba(201,162,39,0.12)", paddingTop: 12 }}>
          {teams.map((t) => {
            const counts = teamCharacterCounts(shared, t.id);
            const teamSlots = (finale?.godSlots || {})[t.id] || [];
            const renown = t === teams[0] ? totals.a : totals.b;
            return (
              <div key={t.id}>
                <div style={{ fontSize: 11.5, color: t.color, fontWeight: 600, marginBottom: 4 }}>{t.name}</div>
                <div className="dq-mono" style={{ fontSize: 10.5, color: "#B7A985" }}>Renown: {renown}</div>
                <div className="dq-mono" style={{ fontSize: 10.5, color: "#B7A985" }}>Legends: {counts.legends} ({counts.eligible} more skill-eligible)</div>
                <div className="dq-mono" style={{ fontSize: 10.5, color: "#B7A985" }}>Mortals surviving: {counts.mortals.length}</div>
                <div className="dq-mono" style={{ fontSize: 10.5, color: "#B7A985", marginBottom: 8 }}>Team Invocation dice (max): {invocationDiceFor(counts.mortals.length)}</div>

                {teamSlots.map((slot) => {
                  const assignedCount = counts.mortals.filter((m) => m.godSlot === slot.id).length;
                  return (
                    <div key={slot.id} className="dq-panel" style={{ borderRadius: 6, padding: 8, marginBottom: 6 }}>
                      {editable ? (
                        <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                          <input defaultValue={slot.name} onBlur={(e) => updateGodSlot(t.id, slot.id, { name: e.target.value })} style={{ flex: 1, padding: "4px 6px", borderRadius: 4, fontSize: 12 }} />
                          <select value={slot.tier} onChange={(e) => updateGodSlot(t.id, slot.id, { tier: e.target.value })} className="dq-mono" style={{ padding: "4px 6px", borderRadius: 4, fontSize: 10 }}>
                            {GOD_TIERS.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
                          </select>
                          <button onClick={() => removeGodSlot(t.id, slot.id)} style={{ ...iconBtnStyle, color: "#D98878" }}><X size={12} /></button>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12.5, color: "#E9DFC8", marginBottom: 2 }}>{slot.name} <span className="dq-mono" style={{ fontSize: 9.5, color: "#8A7C5C" }}>({GOD_TIERS.find((tr) => tr.id === slot.tier)?.name})</span></div>
                      )}
                      <div className="dq-mono" style={{ fontSize: 9.5, color: "#6b5f47" }}>{assignedCount} mortals assigned · {invocationDiceFor(assignedCount)} invocation dice</div>
                    </div>
                  );
                })}
                {editable && (
                  <button onClick={() => addGodSlot(t.id)} disabled={teamSlots.length >= MAX_GOD_SLOTS} style={{ ...smallBtnStyle, width: "100%", opacity: teamSlots.length >= MAX_GOD_SLOTS ? 0.4 : 1 }}>
                    <Plus size={11} style={{ marginRight: 4, verticalAlign: -2 }} />Add god slot
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="dq-mono" style={{ fontSize: 9, color: "#6b5f47", marginTop: 10 }}>
        Legend status is suggested once a character has {LEGEND_SKILL_THRESHOLD}+ special rules — confirm it in their tray (crown icon). Assign surviving Mortals to a god slot from the same tray. Actual God stat-building happens at the table.
      </div>
    </div>
  );
}

function Toast({ msg }) {
  return (
    <div className="dq-fade-in" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#1c1712", border: "1px solid #C9A227", color: "#F0E6C8", padding: "10px 18px", borderRadius: 4, fontSize: 12.5, boxShadow: "0 4px 20px rgba(0,0,0,0.5)", zIndex: 50, maxWidth: "90vw", textAlign: "center" }}>{msg}</div>
  );
}

/* =========================================================================
   TIMER BAR — GM-controlled round/planning countdown, visible to everyone
   ========================================================================= */

function computeRemainingSeconds(timer, nowMs) {
  if (!timer || !timer.type) return 0;
  if (timer.paused) return timer.remainingAtPause || 0;
  if (!timer.endAt) return 0;
  return Math.max(0, Math.round((timer.endAt - nowMs) / 1000));
}

function formatTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function TimerBar({ timer, patchShared, showControls }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const active = timer && timer.type;
  const remaining = computeRemainingSeconds(timer, now);
  const expired = active && remaining <= 0;
  const preset = active ? TIMER_PRESETS[timer.type] : null;

  const startTimer = (type) => {
    const totalSeconds = TIMER_PRESETS[type].seconds;
    patchShared((s) => ({ ...s, timer: { type, totalSeconds, endAt: Date.now() + totalSeconds * 1000, paused: false, remainingAtPause: null } }));
  };
  const pauseTimer = () => {
    patchShared((s) => {
      const t = s.timer;
      if (!t || !t.type || t.paused) return s;
      const rem = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
      return { ...s, timer: { ...t, paused: true, remainingAtPause: rem, endAt: null } };
    });
  };
  const resumeTimer = () => {
    patchShared((s) => {
      const t = s.timer;
      if (!t || !t.type || !t.paused) return s;
      return { ...s, timer: { ...t, paused: false, endAt: Date.now() + (t.remainingAtPause || 0) * 1000, remainingAtPause: null } };
    });
  };
  const clearTimer = () => {
    patchShared((s) => ({ ...s, timer: { type: null, totalSeconds: 0, endAt: null, paused: false, remainingAtPause: null } }));
  };

  if (!active) {
    if (!showControls) return null; // players see nothing when no timer is running
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 18px", borderBottom: "1px solid rgba(201,162,39,0.18)", background: "rgba(0,0,0,0.15)" }}>
        <TimerIcon size={14} color="#8A7C5C" />
        <span className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C", marginRight: 6 }}>NO TIMER RUNNING</span>
        <button onClick={() => startTimer("round")} style={smallBtnStyle}><Play size={11} style={{ marginRight: 4, verticalAlign: -2 }} />Start Round (60:00)</button>
        <button onClick={() => startTimer("planning")} style={smallBtnStyle}><Play size={11} style={{ marginRight: 4, verticalAlign: -2 }} />Start Planning (15:00)</button>
      </div>
    );
  }

  const color = expired ? "#D98878" : timer.type === "round" ? "#C9A227" : "#6B8CAE";

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "10px 18px", borderBottom: "1px solid rgba(201,162,39,0.18)", background: expired ? "rgba(217,136,120,0.1)" : "rgba(0,0,0,0.15)" }}>
      <div className={expired ? "dq-glow" : ""} style={{ display: "flex", alignItems: "center", gap: 8, color }}>
        <TimerIcon size={16} />
        <span className="dq-mono" style={{ fontSize: 20, fontWeight: 700 }}>{expired ? "TIME'S UP" : formatTimer(remaining)}</span>
      </div>
      <span className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C", letterSpacing: "0.06em" }}>
        {preset.label.toUpperCase()}{timer.paused ? " · PAUSED" : ""}
      </span>
      {showControls && (
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {timer.paused ? (
            <button onClick={resumeTimer} style={smallBtnStyle}><Play size={11} style={{ marginRight: 4, verticalAlign: -2 }} />Resume</button>
          ) : (
            <button onClick={pauseTimer} style={smallBtnStyle}><Pause size={11} style={{ marginRight: 4, verticalAlign: -2 }} />Pause</button>
          )}
          <button onClick={clearTimer} style={dangerBtnStyle}><Square size={11} style={{ marginRight: 4, verticalAlign: -2 }} />Clear</button>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   BATTLES PANEL (Command) — reveal + results
   ========================================================================= */

function BattlesPanel({ shared, patchShared, turn, round, showToast }) {
  const { teams, players, catalog, barracks } = shared;
  const playerName = (id) => players.find((p) => p.id === id)?.name || "—";
  const bandSummary = (id) => {
    const p = players.find((pl) => pl.id === id);
    if (!p) return null;
    const mercs = assignedMercsForPlayer(barracks, id);
    const all = [...(p.warband || []), ...mercs];
    if (!all.length) return null;
    const pts = all.reduce((s, m) => s + calcMemberPoints(m, catalog), 0);
    const active = all.filter((m) => m.status !== "ooa").length;
    return `${active}/${all.length} ready · ${pts} pts`;
  };
  const [confirmReset, setConfirmReset] = useState(false);

  const resetRound = () => {
    patchShared((s) => {
      const t = s.turns[s.currentTurn];
      return { ...s, rounds: { ...s.rounds, [t.number]: newRound(round.slotCount) } };
    });
    setConfirmReset(false);
    showToast("This turn's assignments and results were reset");
  };

  const setSlotCount = (n) => {
    patchShared((s) => {
      const t = s.turns[s.currentTurn];
      const r = s.rounds[t.number] || newRound();
      const current = r.matchups;
      let matchups;
      if (n > current.length) {
        matchups = [...current, ...Array.from({ length: n - current.length }, (_, i) => ({ slot: current.length + i, a: null, b: null, notesA: "", notesB: "", winner: null }))];
      } else {
        matchups = current.slice(0, n);
      }
      return { ...s, rounds: { ...s.rounds, [t.number]: { ...r, slotCount: n, matchups } } };
    });
  };

  const reveal = () => {
    patchShared((s) => {
      const t = s.turns[s.currentTurn];
      const r = s.rounds[t.number] || newRound();
      return { ...s, rounds: { ...s.rounds, [t.number]: { ...r, revealed: true } } };
    });
    showToast("Assignments revealed to both teams");
  };

  const setWinner = (slotIdx, winner) => {
    patchShared((s) => {
      const t = s.turns[s.currentTurn];
      const r = s.rounds[t.number] || newRound();
      const matchups = r.matchups.map((m, i) => (i === slotIdx ? { ...m, winner: m.winner === winner ? null : winner } : m));
      return { ...s, rounds: { ...s.rounds, [t.number]: { ...r, matchups } } };
    });
  };

  const awardRequisition = () => {
    patchShared((s) => {
      const t = s.turns[s.currentTurn];
      const r = s.rounds[t.number] || newRound();
      const gains = {};
      r.matchups.forEach((m) => {
        if (!m.winner) return;
        const winnerId = m.winner === "a" ? m.a : m.b;
        const loserId = m.winner === "a" ? m.b : m.a;
        if (winnerId) gains[winnerId] = (gains[winnerId] || 0) + 3;
        if (loserId) gains[loserId] = (gains[loserId] || 0) + 1;
      });
      const players = s.players.map((p) => (gains[p.id] ? { ...p, requisition: p.requisition + gains[p.id] } : p));
      return { ...s, players };
    });
    showToast("Baraz-Klink awarded for entered results");
  };

  return (
    <div className="dq-panel dq-fade-in" style={{ borderRadius: 8, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em" }}>TURN {turn?.number} BATTLES</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C" }}>GAMES</span>
          <button onClick={() => setSlotCount(Math.max(1, round.slotCount - 1))} style={iconBtnStyle}><Minus size={12} /></button>
          <span className="dq-mono" style={{ width: 16, textAlign: "center" }}>{round.slotCount}</span>
          <button onClick={() => setSlotCount(Math.min(8, round.slotCount + 1))} style={iconBtnStyle}><Plus size={12} /></button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, margin: "12px 0 16px" }}>
        {teams.map((t) => (
          <div key={t.id} className="dq-chip" style={{ background: round.status[t.id] === "submitted" ? `${t.color}22` : "rgba(255,255,255,0.04)", color: t.color, border: `1px solid ${t.color}55` }}>
            {round.status[t.id] === "submitted" ? <Lock size={10} /> : <Unlock size={10} />} {t.name}: {round.status[t.id]}
          </div>
        ))}
      </div>

      {!round.revealed ? (
        <button onClick={reveal} disabled={round.status.a !== "submitted" || round.status.b !== "submitted"} style={{ ...primaryBtnStyle, width: "100%", opacity: round.status.a === "submitted" && round.status.b === "submitted" ? 1 : 0.4 }}>
          <Eye size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          Reveal Assignments to Both Teams
        </button>
      ) : (
        <div>
          {round.matchups.map((m, i) => (
            <div key={i} style={{ borderTop: i > 0 ? "1px solid rgba(201,162,39,0.12)" : "none", padding: "12px 0" }}>
              <div className="dq-mono" style={{ fontSize: 10, color: "#6b5f47", marginBottom: 6 }}>GAME {i + 1}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <button onClick={() => setWinner(i, "a")} style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: m.winner === "a" ? `2px solid ${teams[0].color}` : "1px solid rgba(201,162,39,0.2)", background: m.winner === "a" ? `${teams[0].color}22` : "transparent", color: "#E9DFC8", fontSize: 13, cursor: "pointer" }}>
                  {m.a ? playerName(m.a) : <span style={{ color: "#6b5f47" }}>unassigned</span>}
                </button>
                <span className="dq-mono" style={{ fontSize: 11, color: "#6b5f47" }}>vs</span>
                <button onClick={() => setWinner(i, "b")} style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: m.winner === "b" ? `2px solid ${teams[1].color}` : "1px solid rgba(201,162,39,0.2)", background: m.winner === "b" ? `${teams[1].color}22` : "transparent", color: "#E9DFC8", fontSize: 13, cursor: "pointer" }}>
                  {m.b ? playerName(m.b) : <span style={{ color: "#6b5f47" }}>unassigned</span>}
                </button>
              </div>
              {(m.a || m.b) && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
                  <div className="dq-mono" style={{ flex: 1, fontSize: 9.5, color: "#6b5f47", textAlign: "center" }}>{m.a ? bandSummary(m.a) : ""}</div>
                  <div style={{ width: 20 }} />
                  <div className="dq-mono" style={{ flex: 1, fontSize: 9.5, color: "#6b5f47", textAlign: "center" }}>{m.b ? bandSummary(m.b) : ""}</div>
                </div>
              )}
              <div className="dq-mono" style={{ fontSize: 9.5, color: "#6b5f47", marginTop: 4 }}>Tap the winner · +3 Baraz-Klink to winner, +1 to loser when awarded</div>
            </div>
          ))}
          <button onClick={awardRequisition} style={{ ...smallBtnStyle, width: "100%", marginTop: 12 }}>
            <Coins size={12} style={{ marginRight: 5, verticalAlign: -2 }} /> Award Baraz-Klink for Entered Results
          </button>
        </div>
      )}

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(201,162,39,0.12)" }}>
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)} style={{ ...dangerBtnStyle, width: "100%" }}>
            <RotateCcw size={12} style={{ marginRight: 5, verticalAlign: -2 }} /> Reset this turn's assignments &amp; results
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmReset(false)} style={{ ...smallBtnStyle, flex: 1 }}>Cancel</button>
            <button onClick={resetRound} style={{ ...dangerBtnStyle, flex: 1 }}>Confirm reset</button>
          </div>
        )}
      </div>
    </div>
  );
}

function BalanceDashboard({ shared }) {
  const { teams, regions, totals, players, catalog, barracks } = shared;

  const stats = teams.map((t, idx) => {
    const key = idx === 0 ? "a" : "b";
    const districts = regions.filter((r) => r.owner === t.id).length;
    const teamPlayers = players.filter((p) => p.teamId === t.id);
    const requisitionOnHand = teamPlayers.reduce((sum, p) => sum + (p.requisition || 0), 0);
    const itemsOwned = teamPlayers.reduce((sum, p) => sum + Object.values(p.loadout || {}).reduce((s2, arr) => s2 + (arr?.length || 0), 0), 0);
    const requisitionSpent = teamPlayers.reduce((sum, p) => {
      let spent = 0;
      Object.entries(p.loadout || {}).forEach(([type, ids]) => {
        (ids || []).forEach((id) => {
          const item = catalog[type]?.find((it) => it.id === id);
          if (item) spent += item.cost;
        });
      });
      return sum + spent;
    }, 0);
    const mercsAssigned = assignedMercsForTeam(barracks, t.id);
    const warbandMembers = teamPlayers.reduce((sum, p) => sum + (p.warband?.length || 0), 0) + mercsAssigned.length;
    const warbandPoints = teamWarbandPoints(teamPlayers, catalog, barracks, t.id);
    const totalKills = teamPlayers.reduce((sum, p) => sum + (p.warband || []).reduce((s2, m) => s2 + Number(m.kills || 0), 0), 0) + mercsAssigned.reduce((sum, m) => sum + Number(m.kills || 0), 0);
    const equippedSlots = teamPlayers.reduce((sum, p) => sum + (p.warband || []).reduce((s2, m) => s2 + (m.slots || []).filter(Boolean).length, 0), 0) + mercsAssigned.reduce((sum, m) => sum + (m.slots || []).filter(Boolean).length, 0);
    const renown = totals[key] || 0;
    const powerIndex = renown + districts * 2 + itemsOwned * 2 + requisitionOnHand + warbandPoints;
    return { team: t, districts, requisitionOnHand, requisitionSpent, itemsOwned, renown, powerIndex, playerCount: teamPlayers.length, warbandMembers, warbandPoints, equippedSlots, totalKills };
  });

  const maxPower = Math.max(stats[0]?.powerIndex || 0, stats[1]?.powerIndex || 0, 1);
  const leader = stats[0]?.powerIndex === stats[1]?.powerIndex ? null : stats.reduce((a, b) => (a.powerIndex > b.powerIndex ? a : b));
  const gap = stats.length === 2 ? Math.abs(stats[0].powerIndex - stats[1].powerIndex) : 0;

  const allMembers = flattenAllMembers(shared);
  const topByPoints = [...allMembers].sort((a, b) => b.points - a.points).slice(0, 3);
  const topByKills = [...allMembers].sort((a, b) => (b.member.kills || 0) - (a.member.kills || 0)).slice(0, 3);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="dq-panel dq-fade-in" style={{ borderRadius: 8, padding: 18 }}>
        <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 4 }}>
          <Scale size={12} style={{ marginRight: 5, verticalAlign: -2 }} />POWER BALANCE
        </div>
        <div style={{ fontSize: 13, color: "#C9BC9C", marginBottom: 16 }}>
          {leader ? (
            <>
              <span style={{ color: leader.team.color, fontWeight: 600 }}>{leader.team.name}</span> is ahead by roughly <span className="dq-mono">{gap}</span> power points. Consider a scenario twist, a bonus objective, or a renown handicap for the leading side.
            </>
          ) : (
            "Teams are evenly matched right now."
          )}
        </div>

        {stats.map((s) => (
          <div key={s.team.id} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, color: "#E9DFC8" }}>{s.team.name}</span>
              <span className="dq-mono" style={{ fontSize: 14, fontWeight: 700, color: s.team.color }}>{s.powerIndex} power</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(0,0,0,0.35)", overflow: "hidden" }}>
              <div style={{ width: `${(s.powerIndex / maxPower) * 100}%`, height: "100%", background: s.team.color, boxShadow: `0 0 8px ${s.team.color}`, transition: "width 0.6s ease" }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {stats.map((s) => (
          <div key={s.team.id} className="dq-panel" style={{ borderRadius: 8, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.team.color, boxShadow: `0 0 6px ${s.team.color}` }} />
              <span className="dq-display" style={{ fontSize: 12.5, fontWeight: 700, color: "#F0E6C8" }}>{s.team.name}</span>
            </div>
            {[
              ["Renown", s.renown],
              ["Districts held", s.districts],
              ["Players", s.playerCount],
              ["War band members", s.warbandMembers],
              ["War band points (SBH)", s.warbandPoints],
              ["Total kills", s.totalKills],
              ["Slots equipped", s.equippedSlots],
              ["Baraz-Klink on hand", s.requisitionOnHand],
              ["Baraz-Klink spent", s.requisitionSpent],
              ["Items owned", s.itemsOwned],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#B7A985", marginBottom: 5 }}>
                <span>{label}</span>
                <span className="dq-mono" style={{ color: "#E9DFC8" }}>{val}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <Leaderboard
        title="Top Warriors by Points"
        icon={Trophy}
        rows={topByPoints.map((e) => ({ name: e.member.name, sub: `${e.player.name} · ${e.team?.name || ""}`, value: `${e.points} pts`, color: e.team?.color }))}
      />
      <Leaderboard
        title="Top Killers"
        icon={Skull}
        rows={topByKills.map((e) => ({ name: e.member.name, sub: `${e.player.name} · ${e.team?.name || ""}`, value: `${e.member.kills || 0} kills`, color: e.team?.color }))}
      />

      <div className="dq-mono" style={{ fontSize: 9.5, color: "#6b5f47", padding: "0 4px" }}>
        Power index = renown + (districts × 2) + (items owned × 2) + Baraz-Klink on hand + total war band points (Song of Blades and Heroes formula). A rough balancing guide, not a rule — use your judgement.
      </div>
    </div>
  );
}

function Leaderboard({ title, icon: Icon, rows }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dq-panel" style={{ borderRadius: 8, overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", color: "#F0E6C8" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon size={14} color="#C9A227" />
          <span className="dq-display" style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
        </div>
        <ChevronDown size={16} color="#8A7C5C" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
      </button>
      {open && (
        <div className="dq-fade-in" style={{ padding: "0 16px 14px" }}>
          {rows.length === 0 && <div style={{ fontSize: 12, color: "#6b5f47", fontStyle: "italic" }}>No war band members yet.</div>}
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: i > 0 ? "1px solid rgba(201,162,39,0.12)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span className="dq-mono" style={{ fontSize: 11, color: "#6b5f47", width: 14 }}>{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#E9DFC8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div className="dq-mono" style={{ fontSize: 10, color: "#6b5f47" }}>{r.sub}</div>
                </div>
              </div>
              <span className="dq-mono" style={{ fontSize: 12.5, color: r.color || "#C9A227", fontWeight: 700, flexShrink: 0 }}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   ROSTER PANEL (Command) — players + catalog
   ========================================================================= */

// Native color pickers fire many rapid 'input' events while the user drags inside the
// picker UI — debounce so only the final choice gets saved, not every intermediate shade.
function DebouncedColorInput({ value, onCommit, delay = 400 }) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef(null);

  useEffect(() => { setLocal(value); }, [value]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleChange = (v) => {
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onCommit(v), delay);
  };

  return (
    <input
      type="color"
      value={local}
      onChange={(e) => handleChange(e.target.value)}
      style={{ width: 26, height: 26, padding: 0, border: "1px solid rgba(201,162,39,0.3)", borderRadius: 4, background: "none", cursor: "pointer" }}
    />
  );
}

function RosterPlayerRow({ player, teamColor, editingRef, onRename, onAdjust, onRemove }) {
  const [display, adjust] = useCoalescedCounter(player.requisition, onAdjust);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
      <input defaultValue={player.name} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; onRename(e.target.value); }} style={{ flex: 1, minWidth: 100, padding: "6px 10px", borderRadius: 4, fontSize: 13 }} />
      <button onClick={() => adjust(-1)} style={iconBtnStyle}><Minus size={12} /></button>
      <span className="dq-mono" style={{ fontSize: 11, color: teamColor, width: 44, textAlign: "center" }}>{display} Bz</span>
      <button onClick={() => adjust(1)} style={iconBtnStyle}><Plus size={12} /></button>
      <button onClick={onRemove} style={{ ...iconBtnStyle, color: "#D98878" }}><X size={13} /></button>
    </div>
  );
}

function RosterPanel({ shared, patchShared, editingRef, showToast }) {
  const { teams, players, catalog } = shared;
  const [catType, setCatType] = useState("weapon");

  const addPlayer = (teamId) => {
    patchShared((s) => ({ ...s, players: [...s.players, { id: "p" + Date.now(), teamId, name: "New Player", requisition: 0, loadout: { weapon: [], armor: [], skill: [] }, warband: [] }] }));
  };
  const renamePlayer = (id, name) => patchShared((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, name } : p)) }));
  const removePlayer = (id) => patchShared((s) => ({ ...s, players: s.players.filter((p) => p.id !== id) }));
  const adjustRequisition = (id, amount) => {
    patchShared((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, requisition: Math.max(0, p.requisition + amount) } : p)) }));
  };
  const renameTeam = (id, name) => patchShared((s) => ({ ...s, teams: s.teams.map((t) => (t.id === id ? { ...t, name } : t)) }));
  const recolorTeam = (id, color) => patchShared((s) => ({ ...s, teams: s.teams.map((t) => (t.id === id ? { ...t, color } : t)) }));

  const addCatalogItem = () => {
    patchShared((s) => ({ ...s, catalog: { ...s.catalog, [catType]: [...s.catalog[catType], { id: catType[0] + Date.now(), name: "New Item", cost: 1, effect: "Describe its effect" }] } }));
  };
  const updateCatalogItem = (id, patch) => patchShared((s) => ({ ...s, catalog: { ...s.catalog, [catType]: s.catalog[catType].map((it) => (it.id === id ? { ...it, ...patch } : it)) } }));
  const removeCatalogItem = (id) => patchShared((s) => ({ ...s, catalog: { ...s.catalog, [catType]: s.catalog[catType].filter((it) => it.id !== id) } }));

  const loadStarterGear = () => {
    patchShared((s) => {
      const existingWeaponNames = new Set(s.catalog.weapon.map((w) => w.name.toLowerCase()));
      const existingArmorNames = new Set(s.catalog.armor.map((a) => a.name.toLowerCase()));
      const newWeapons = STARTER_WEAPONS.filter((w) => !existingWeaponNames.has(w.name.toLowerCase())).map((w) => ({ id: "w" + Date.now() + Math.floor(Math.random() * 1000), ...w }));
      const newArmor = STARTER_ARMOR.filter((a) => !existingArmorNames.has(a.name.toLowerCase())).map((a) => ({ id: "ar" + Date.now() + Math.floor(Math.random() * 1000), ...a }));
      if (newWeapons.length === 0 && newArmor.length === 0) {
        showToast("Starter gear is already in your catalog");
        return s;
      }
      showToast(`Added ${newWeapons.length} weapon${newWeapons.length === 1 ? "" : "s"} and ${newArmor.length} armour piece${newArmor.length === 1 ? "" : "s"}`);
      return { ...s, catalog: { ...s.catalog, weapon: [...s.catalog.weapon, ...newWeapons], armor: [...s.catalog.armor, ...newArmor] } };
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="dq-panel dq-fade-in" style={{ borderRadius: 8, padding: 18 }}>
        <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 12 }}>ROSTER</div>
        {teams.map((t) => (
          <div key={t.id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <DebouncedColorInput value={t.color} onCommit={(color) => recolorTeam(t.id, color)} />
              <input defaultValue={t.name} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; renameTeam(t.id, e.target.value); }} className="dq-display" style={{ flex: 1, padding: "6px 10px", borderRadius: 4, fontSize: 13, fontWeight: 700 }} />
            </div>
            {players.filter((p) => p.teamId === t.id).map((p) => (
              <RosterPlayerRow key={p.id} player={p} teamColor={t.color} editingRef={editingRef} onRename={(name) => renamePlayer(p.id, name)} onAdjust={(delta) => adjustRequisition(p.id, delta)} onRemove={() => removePlayer(p.id)} />
            ))}
            <button onClick={() => addPlayer(t.id)} style={smallBtnStyle}><Plus size={12} style={{ marginRight: 4, verticalAlign: -2 }} />Add player to {t.name.split(" ")[0]}</button>
          </div>
        ))}
      </div>

      <div className="dq-panel dq-fade-in" style={{ borderRadius: 8, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em" }}>ARMOURY CATALOG</div>
          <button onClick={loadStarterGear} style={smallBtnStyle}>Add starter weapons &amp; armour</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {["weapon", "armor", "skill"].map((k) => (
            <button key={k} onClick={() => setCatType(k)} style={{ ...smallBtnStyle, flex: 1, background: catType === k ? "rgba(201,162,39,0.22)" : smallBtnStyle.background }}>{k.toUpperCase()}S</button>
          ))}
        </div>
        {catalog[catType].map((item) => (
          <div key={item.id} className="dq-panel" style={{ borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input defaultValue={item.name} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; updateCatalogItem(item.id, { name: e.target.value }); }} style={{ flex: 1, padding: "5px 8px", borderRadius: 4, fontSize: 13 }} />
              <input type="number" defaultValue={item.cost} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; updateCatalogItem(item.id, { cost: Number(e.target.value) }); }} className="dq-mono" style={{ width: 52, padding: "5px 6px", borderRadius: 4, fontSize: 12, textAlign: "center" }} />
              <button onClick={() => removeCatalogItem(item.id)} style={{ ...iconBtnStyle, color: "#D98878" }}><X size={13} /></button>
            </div>
            <textarea defaultValue={item.effect} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; updateCatalogItem(item.id, { effect: e.target.value }); }} rows={1} style={{ width: "100%", padding: "5px 8px", borderRadius: 4, fontSize: 12 }} />
          </div>
        ))}
        <button onClick={addCatalogItem} style={smallBtnStyle}><Plus size={12} style={{ marginRight: 4, verticalAlign: -2 }} />Add {catType}</button>
      </div>

      <BarracksAdmin shared={shared} patchShared={patchShared} editingRef={editingRef} showToast={showToast} />

      <SpecialRulesCatalog catalog={catalog} patchShared={patchShared} editingRef={editingRef} />
    </div>
  );
}

function BarracksAdmin({ shared, patchShared, editingRef, showToast }) {
  const { teams, players, catalog, barracks } = shared;

  const addBlankMerc = (teamId) => {
    const merc = blankMerc("New Mercenary", teamId);
    patchShared((s) => ({ ...s, barracks: [...(s.barracks || []), merc] }));
  };
  const updateMerc = (id, patch) => patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  const removeMerc = (id) => patchShared((s) => ({ ...s, barracks: (s.barracks || []).filter((m) => m.id !== id) }));
  const reassign = (id, playerId) => {
    updateMerc(id, { assignedTo: playerId || null });
    showToast(playerId ? "Mercenary reassigned" : "Mercenary returned to the pool");
  };

  return (
    <div className="dq-panel dq-fade-in" style={{ borderRadius: 8, padding: 18 }}>
      <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 4 }}>BARRACKS</div>
      <div style={{ fontSize: 11.5, color: "#6b5f47", marginBottom: 12 }}>Shared team mercenary pool — force-assign, edit stats, or set up starting mercs here.</div>
      {teams.map((t) => {
        const teamMercs = (barracks || []).filter((m) => m.teamId === t.id);
        const teamPlayers = players.filter((p) => p.teamId === t.id);
        return (
          <div key={t.id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: t.color, boxShadow: `0 0 6px ${t.color}` }} />
              <span className="dq-mono" style={{ fontSize: 11, color: "#B7A985" }}>{t.name.toUpperCase()}</span>
            </div>
            {teamMercs.length === 0 && <div style={{ fontSize: 12, color: "#6b5f47", fontStyle: "italic", marginBottom: 8 }}>None recruited yet.</div>}
            {teamMercs.map((m) => (
              <div key={m.id} className="dq-panel" style={{ borderRadius: 6, padding: 10, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <input defaultValue={m.name} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; updateMerc(m.id, { name: e.target.value }); }} style={{ flex: 1, minWidth: 100, padding: "5px 8px", borderRadius: 4, fontSize: 13 }} />
                  <select value={m.quality} onChange={(e) => updateMerc(m.id, { quality: Number(e.target.value) })} className="dq-mono" style={{ padding: "5px 6px", borderRadius: 4, fontSize: 11 }}>
                    {QUALITY_VALUES.map((v) => <option key={v} value={v}>{v}+</option>)}
                  </select>
                  <input type="number" defaultValue={m.combat} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; updateMerc(m.id, { combat: Number(e.target.value) }); }} className="dq-mono" style={{ width: 44, padding: "5px 6px", borderRadius: 4, fontSize: 11, textAlign: "center" }} title="Combat" />
                  <input type="number" defaultValue={m.cost} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; updateMerc(m.id, { cost: Number(e.target.value) }); }} className="dq-mono" style={{ width: 50, padding: "5px 6px", borderRadius: 4, fontSize: 11, textAlign: "center" }} title="Recruit cost (Bz)" />
                  <button onClick={() => removeMerc(m.id)} style={{ ...iconBtnStyle, color: "#D98878" }}><X size={13} /></button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="dq-mono" style={{ fontSize: 10, color: "#6b5f47" }}>Assigned to:</span>
                  <select value={m.assignedTo || ""} onChange={(e) => reassign(m.id, e.target.value)} style={{ flex: 1, padding: "5px 8px", borderRadius: 4, fontSize: 12 }}>
                    <option value="">— unassigned (pool) —</option>
                    {teamPlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <span className="dq-mono" style={{ fontSize: 10, color: t.color }}>{calcMemberPoints(m, catalog)} pts</span>
                </div>
              </div>
            ))}
            <button onClick={() => addBlankMerc(t.id)} style={smallBtnStyle}><Plus size={12} style={{ marginRight: 4, verticalAlign: -2 }} />Add mercenary to {t.name.split(" ")[0]}</button>
          </div>
        );
      })}
    </div>
  );
}

function SpecialRulesCatalog({ catalog, patchShared, editingRef }) {
  const rules = catalog.specialRule || [];

  const addRule = () => {
    patchShared((s) => ({ ...s, catalog: { ...s.catalog, specialRule: [...(s.catalog.specialRule || []), { id: "sr" + Date.now(), name: "New Rule", cost: 0, effect: "Describe its effect" }] } }));
  };
  const updateRule = (id, patch) => patchShared((s) => ({ ...s, catalog: { ...s.catalog, specialRule: s.catalog.specialRule.map((r) => (r.id === id ? { ...r, ...patch } : r)) } }));
  const removeRule = (id) => patchShared((s) => ({ ...s, catalog: { ...s.catalog, specialRule: s.catalog.specialRule.filter((r) => r.id !== id) } }));

  return (
    <div className="dq-panel dq-fade-in" style={{ borderRadius: 8, padding: 18 }}>
      <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 4 }}>SPECIAL RULES CATALOG</div>
      <div style={{ fontSize: 11.5, color: "#6b5f47", marginBottom: 12 }}>
        Names match Song of Blades and Heroes. Costs feed the point formula — set them to your friend's economy whenever that's ready.
      </div>
      <div style={{ maxHeight: 360, overflowY: "auto", marginBottom: 10 }}>
        {rules.map((r) => (
          <div key={r.id} className="dq-panel" style={{ borderRadius: 6, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input defaultValue={r.name} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; updateRule(r.id, { name: e.target.value }); }} style={{ flex: 1, padding: "5px 8px", borderRadius: 4, fontSize: 13 }} />
              <input type="number" defaultValue={r.cost} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; updateRule(r.id, { cost: Number(e.target.value) }); }} className="dq-mono" style={{ width: 52, padding: "5px 6px", borderRadius: 4, fontSize: 12, textAlign: "center" }} />
              <button onClick={() => removeRule(r.id)} style={{ ...iconBtnStyle, color: "#D98878" }}><X size={13} /></button>
            </div>
            <textarea defaultValue={r.effect} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; updateRule(r.id, { effect: e.target.value }); }} rows={1} style={{ width: "100%", padding: "5px 8px", borderRadius: 4, fontSize: 12 }} />
          </div>
        ))}
      </div>
      <button onClick={addRule} style={smallBtnStyle}><Plus size={12} style={{ marginRight: 4, verticalAlign: -2 }} />Add special rule</button>
    </div>
  );
}

/* =========================================================================
   PLAYER: WAR BAND ROSTER
   ========================================================================= */

const MAX_WARBAND = 9;
const COMBAT_MAX = 6;
const QUALITY_VALUES = [2, 3, 4, 5, 6]; // SBH convention: lower is better ("2+" is elite, "6+" is poor)

function allOwnedItems(me, catalog) {
  const out = [];
  ["weapon", "armor", "skill"].forEach((type) => {
    (me.loadout?.[type] || []).forEach((id) => {
      const item = catalog[type].find((it) => it.id === id);
      if (item) out.push({ ...item, type });
    });
  });
  return out;
}

// Song of Blades and Heroes point formula: ((Combat*5 + SpecialAbilities) * (7 - Quality)) / 2
function calcMemberPoints(member, catalog) {
  const abilitiesSum = (member.specialRules || []).reduce((sum, ruleId) => {
    const rule = catalog.specialRule?.find((r) => r.id === ruleId);
    return sum + (rule ? Number(rule.cost || 0) : 0);
  }, 0);
  const c = Number(member.combat || 0);
  const q = Number(member.quality || 4);
  return Math.round(((c * 5 + abilitiesSum) * (7 - q)) / 2);
}

function assignedMercsForTeam(barracks, teamId) {
  return (barracks || []).filter((m) => m.teamId === teamId && m.assignedTo);
}

function assignedMercsForPlayer(barracks, playerId) {
  return (barracks || []).filter((m) => m.assignedTo === playerId);
}

function teamWarbandPoints(teamPlayers, catalog, barracks, teamId) {
  const personal = teamPlayers.reduce((sum, p) => sum + (p.warband || []).reduce((s2, m) => s2 + calcMemberPoints(m, catalog), 0), 0);
  const mercs = assignedMercsForTeam(barracks, teamId).reduce((sum, m) => sum + calcMemberPoints(m, catalog), 0);
  return personal + mercs;
}

function flattenAllMembers(shared) {
  const out = [];
  shared.players.forEach((p) => {
    const team = shared.teams.find((t) => t.id === p.teamId);
    (p.warband || []).forEach((m) => {
      out.push({ member: m, player: p, team, points: calcMemberPoints(m, shared.catalog) });
    });
  });
  (shared.barracks || []).forEach((m) => {
    if (!m.assignedTo) return;
    const player = shared.players.find((p) => p.id === m.assignedTo);
    const team = shared.teams.find((t) => t.id === m.teamId);
    if (player) out.push({ member: m, player, team, points: calcMemberPoints(m, shared.catalog) });
  });
  return out;
}

function findSpecialRuleIdByName(catalog, name) {
  const rule = (catalog.specialRule || []).find((r) => r.name.toLowerCase() === name.toLowerCase());
  return rule ? rule.id : null;
}

function blankMember(name) {
  return { id: "m" + Date.now() + Math.floor(Math.random() * 1000), name, quality: 4, combat: 2, slots: [null, null, null], specialRules: [], kills: 0, feats: [], status: "active", foundItems: [], legend: false, godSlot: null };
}

function blankMerc(name, teamId) {
  return { id: "b" + Date.now() + Math.floor(Math.random() * 1000), teamId, name, quality: 4, combat: 2, slots: [null, null, null], specialRules: [], kills: 0, feats: [], status: "active", foundItems: [], legend: false, godSlot: null, cost: 0, assignedTo: null };
}

function WarBandView({ me, catalog, teamColor, patchShared, showToast, barracks, godSlots = [] }) {
  const [openKind, setOpenKind] = useState(null); // 'member' | 'merc'
  const [openId, setOpenId] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const warband = me.warband || [];
  const myMercs = assignedMercsForPlayer(barracks, me.id);
  const owned = allOwnedItems(me, catalog);
  const openMember = openKind === "member" ? warband.find((m) => m.id === openId) : null;
  const openMerc = openKind === "merc" ? myMercs.find((m) => m.id === openId) : null;
  const totalPoints = [...warband, ...myMercs].reduce((sum, m) => sum + calcMemberPoints(m, catalog), 0);

  const addBlankMember = () => {
    if (warband.length >= MAX_WARBAND) { showToast(`War bands are capped at ${MAX_WARBAND} members`); return; }
    const member = blankMember(`Member ${warband.length + 1}`);
    patchShared((s) => ({ ...s, players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: [...(p.warband || []), member] })) }));
    setOpenKind("member"); setOpenId(member.id);
  };

  const addFromTemplate = (preset) => {
    if (warband.length >= MAX_WARBAND) { showToast(`War bands are capped at ${MAX_WARBAND} members`); return; }
    patchShared((s) => {
      const ruleIds = preset.rules.map((name) => findSpecialRuleIdByName(s.catalog, name)).filter(Boolean);
      const member = { ...blankMember(preset.name), quality: preset.quality, combat: preset.combat, specialRules: ruleIds };
      return { ...s, players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: [...(p.warband || []), member] })) };
    });
    setShowTemplates(false);
    showToast(`${preset.name} added — customize as needed`);
  };

  const patchMember = (memberId, patch) => {
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: (p.warband || []).map((m) => (m.id === memberId ? { ...m, ...patch } : m)) })),
    }));
  };

  const adjustKills = (memberId, amount) => {
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: (p.warband || []).map((m) => (m.id === memberId ? { ...m, kills: Math.max(0, (m.kills || 0) + amount) } : m)) })),
    }));
  };

  const addFeat = (memberId, text) => {
    if (!text.trim()) return;
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: (p.warband || []).map((m) => (m.id === memberId ? { ...m, feats: [...(m.feats || []), text.trim()] } : m)) })),
    }));
  };

  const removeFeat = (memberId, idx) => {
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: (p.warband || []).map((m) => (m.id === memberId ? { ...m, feats: m.feats.filter((_, i) => i !== idx) } : m)) })),
    }));
  };

  const addFoundItem = (memberId, text) => {
    if (!text.trim()) return;
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: (p.warband || []).map((m) => (m.id === memberId ? { ...m, foundItems: [...(m.foundItems || []), text.trim()] } : m)) })),
    }));
  };

  const removeFoundItem = (memberId, idx) => {
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: (p.warband || []).map((m) => (m.id === memberId ? { ...m, foundItems: m.foundItems.filter((_, i) => i !== idx) } : m)) })),
    }));
  };

  const toggleStatus = (memberId) => {
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: (p.warband || []).map((m) => (m.id === memberId ? { ...m, status: m.status === "ooa" ? "active" : "ooa" } : m)) })),
    }));
  };

  const toggleLegend = (memberId) => {
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: (p.warband || []).map((m) => (m.id === memberId ? { ...m, legend: !m.legend } : m)) })),
    }));
  };

  const setGodSlot = (memberId, slotId) => {
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: (p.warband || []).map((m) => (m.id === memberId ? { ...m, godSlot: slotId } : m)) })),
    }));
  };

  const setSlot = (memberId, slotIdx, itemRef) => {
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => (p.id !== me.id ? p : {
        ...p,
        warband: (p.warband || []).map((m) => (m.id !== memberId ? m : { ...m, slots: m.slots.map((sl, i) => (i === slotIdx ? itemRef : sl)) })),
      })),
    }));
  };

  const addSpecialRule = (memberId, ruleId) => {
    if (!ruleId) return;
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: (p.warband || []).map((m) => (m.id === memberId && !(m.specialRules || []).includes(ruleId) ? { ...m, specialRules: [...(m.specialRules || []), ruleId] } : m)) })),
    }));
  };

  const removeSpecialRule = (memberId, ruleId) => {
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: (p.warband || []).map((m) => (m.id === memberId ? { ...m, specialRules: (m.specialRules || []).filter((id) => id !== ruleId) } : m)) })),
    }));
  };

  const removeMember = (memberId) => {
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => (p.id !== me.id ? p : { ...p, warband: (p.warband || []).filter((m) => m.id !== memberId) })),
    }));
    setOpenId(null); setOpenKind(null);
  };

  // --- Mercenary (Barracks) mutators — same shape, but patch shared.barracks by id ---
  const patchMercEntry = (mercId, patch) => {
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId ? { ...m, ...patch } : m)) }));
  };
  const adjustMercKills = (mercId, amount) => {
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId ? { ...m, kills: Math.max(0, (m.kills || 0) + amount) } : m)) }));
  };
  const addMercFeat = (mercId, text) => {
    if (!text.trim()) return;
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId ? { ...m, feats: [...(m.feats || []), text.trim()] } : m)) }));
  };
  const removeMercFeat = (mercId, idx) => {
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId ? { ...m, feats: m.feats.filter((_, i) => i !== idx) } : m)) }));
  };
  const addMercFoundItem = (mercId, text) => {
    if (!text.trim()) return;
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId ? { ...m, foundItems: [...(m.foundItems || []), text.trim()] } : m)) }));
  };
  const removeMercFoundItem = (mercId, idx) => {
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId ? { ...m, foundItems: m.foundItems.filter((_, i) => i !== idx) } : m)) }));
  };
  const toggleMercStatus = (mercId) => {
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId ? { ...m, status: m.status === "ooa" ? "active" : "ooa" } : m)) }));
  };
  const toggleMercLegend = (mercId) => {
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId ? { ...m, legend: !m.legend } : m)) }));
  };
  const setMercGodSlot = (mercId, slotId) => {
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId ? { ...m, godSlot: slotId } : m)) }));
  };
  const setMercSlot = (mercId, slotIdx, itemRef) => {
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id !== mercId ? m : { ...m, slots: m.slots.map((sl, i) => (i === slotIdx ? itemRef : sl)) })) }));
  };
  const addMercRule = (mercId, ruleId) => {
    if (!ruleId) return;
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId && !(m.specialRules || []).includes(ruleId) ? { ...m, specialRules: [...(m.specialRules || []), ruleId] } : m)) }));
  };
  const removeMercRule = (mercId, ruleId) => {
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId ? { ...m, specialRules: (m.specialRules || []).filter((id) => id !== ruleId) } : m)) }));
  };
  const returnMercToBarracks = (mercId) => {
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId ? { ...m, assignedTo: null } : m)) }));
    setOpenId(null); setOpenKind(null);
    showToast("Returned to Barracks");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="dq-panel dq-fade-in" style={{ borderRadius: 8, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em" }}>WAR BAND</div>
          <div className="dq-mono" style={{ fontSize: 10.5, color: "#6b5f47" }}>{warband.length} / {MAX_WARBAND}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, color: "#6b5f47" }}>Tap a member to open their card.</div>
          <div className="dq-mono" style={{ fontSize: 13, color: teamColor, fontWeight: 700 }}>{totalPoints} pts total</div>
        </div>

        {warband.length === 0 && <div style={{ fontSize: 12.5, color: "#6b5f47", fontStyle: "italic", marginBottom: 10 }}>No members yet — add your first below.</div>}

        {warband.map((m) => {
          const ooa = m.status === "ooa";
          return (
            <button key={m.id} onClick={() => { setOpenKind("member"); setOpenId(m.id); }} className="dq-panel" style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 6, marginBottom: 8, cursor: "pointer", color: "#E9DFC8", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, opacity: ooa ? 0.55 : 1 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: ooa ? "line-through" : "none" }}>
                  {m.legend ? <Crown size={11} color="#C9A227" style={{ marginRight: 4, verticalAlign: -1 }} /> : (m.specialRules || []).length >= LEGEND_SKILL_THRESHOLD ? <span title="Eligible for Legend status" style={{ marginRight: 4, color: "#C9A227" }}>✦</span> : null}
                  {m.name}{ooa && <span className="dq-mono" style={{ fontSize: 9.5, color: "#D98878", marginLeft: 6, textDecoration: "none" }}>OOA</span>}
                </div>
                <div className="dq-mono" style={{ fontSize: 10, color: "#6b5f47" }}>{(m.slots || []).filter(Boolean).length}/3 equipped · {m.kills || 0} kill{m.kills === 1 ? "" : "s"} · {calcMemberPoints(m, catalog)} pts</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <StatChip label="Q" value={`${m.quality}+`} color={teamColor} />
                <StatChip label="C" value={m.combat} color={teamColor} />
              </div>
            </button>
          );
        })}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addBlankMember} disabled={warband.length >= MAX_WARBAND} style={{ ...smallBtnStyle, flex: 1, opacity: warband.length >= MAX_WARBAND ? 0.4 : 1 }}>
            <Plus size={12} style={{ marginRight: 5, verticalAlign: -2 }} /> Add blank member
          </button>
          <button onClick={() => setShowTemplates(true)} disabled={warband.length >= MAX_WARBAND} style={{ ...smallBtnStyle, flex: 1, opacity: warband.length >= MAX_WARBAND ? 0.4 : 1 }}>
            Add from template
          </button>
        </div>
      </div>

      {myMercs.length > 0 && (
        <div className="dq-panel dq-fade-in" style={{ borderRadius: 8, padding: 18 }}>
          <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 4 }}>MERCENARIES WITH YOU</div>
          <div style={{ fontSize: 11.5, color: "#6b5f47", marginBottom: 12 }}>From the shared Barracks — return them there when you're done.</div>
          {myMercs.map((m) => {
            const ooa = m.status === "ooa";
            return (
              <button key={m.id} onClick={() => { setOpenKind("merc"); setOpenId(m.id); }} className="dq-panel" style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 6, marginBottom: 8, cursor: "pointer", color: "#E9DFC8", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, opacity: ooa ? 0.55 : 1, borderStyle: "dashed" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: ooa ? "line-through" : "none" }}>
                    {m.legend ? <Crown size={11} color="#C9A227" style={{ marginRight: 4, verticalAlign: -1 }} /> : (m.specialRules || []).length >= LEGEND_SKILL_THRESHOLD ? <span title="Eligible for Legend status" style={{ marginRight: 4, color: "#C9A227" }}>✦</span> : null}
                    {m.name}{ooa && <span className="dq-mono" style={{ fontSize: 9.5, color: "#D98878", marginLeft: 6, textDecoration: "none" }}>OOA</span>}
                  </div>
                  <div className="dq-mono" style={{ fontSize: 10, color: "#6b5f47" }}>mercenary · {calcMemberPoints(m, catalog)} pts</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <StatChip label="Q" value={`${m.quality}+`} color={teamColor} />
                  <StatChip label="C" value={m.combat} color={teamColor} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="dq-panel" style={{ borderRadius: 8, padding: 16 }}>
        <div className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 10 }}>YOUR INVENTORY (from the Armoury)</div>
        {owned.length === 0 && <div style={{ fontSize: 12, color: "#6b5f47", fontStyle: "italic" }}>Nothing purchased yet.</div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {owned.map((it) => (
            <span key={it.type + it.id} className="dq-chip" style={{ color: "#B7A985", border: "1px solid rgba(201,162,39,0.25)" }}>{it.name}</span>
          ))}
        </div>
      </div>

      {openMember && (
        <MemberTray
          member={openMember}
          owned={owned}
          catalog={catalog}
          teamColor={teamColor}
          mode="personal"
          godSlots={godSlots}
          onClose={() => { setOpenId(null); setOpenKind(null); }}
          onPatch={(patch) => patchMember(openMember.id, patch)}
          onSetSlot={(slotIdx, itemRef) => setSlot(openMember.id, slotIdx, itemRef)}
          onAddRule={(ruleId) => addSpecialRule(openMember.id, ruleId)}
          onRemoveRule={(ruleId) => removeSpecialRule(openMember.id, ruleId)}
          onAdjustKills={(amount) => adjustKills(openMember.id, amount)}
          onAddFeat={(text) => addFeat(openMember.id, text)}
          onRemoveFeat={(idx) => removeFeat(openMember.id, idx)}
          onAddFoundItem={(text) => addFoundItem(openMember.id, text)}
          onRemoveFoundItem={(idx) => removeFoundItem(openMember.id, idx)}
          onToggleStatus={() => toggleStatus(openMember.id)}
          onToggleLegend={() => toggleLegend(openMember.id)}
          onSetGodSlot={(slotId) => setGodSlot(openMember.id, slotId)}
          onRemoveMember={() => removeMember(openMember.id)}
        />
      )}

      {openMerc && (
        <MemberTray
          member={openMerc}
          owned={owned}
          catalog={catalog}
          teamColor={teamColor}
          mode="mercenary"
          godSlots={godSlots}
          onClose={() => { setOpenId(null); setOpenKind(null); }}
          onPatch={(patch) => patchMercEntry(openMerc.id, patch)}
          onSetSlot={(slotIdx, itemRef) => setMercSlot(openMerc.id, slotIdx, itemRef)}
          onAddRule={(ruleId) => addMercRule(openMerc.id, ruleId)}
          onRemoveRule={(ruleId) => removeMercRule(openMerc.id, ruleId)}
          onAdjustKills={(amount) => adjustMercKills(openMerc.id, amount)}
          onAddFeat={(text) => addMercFeat(openMerc.id, text)}
          onRemoveFeat={(idx) => removeMercFeat(openMerc.id, idx)}
          onAddFoundItem={(text) => addMercFoundItem(openMerc.id, text)}
          onRemoveFoundItem={(idx) => removeMercFoundItem(openMerc.id, idx)}
          onToggleStatus={() => toggleMercStatus(openMerc.id)}
          onToggleLegend={() => toggleMercLegend(openMerc.id)}
          onSetGodSlot={(slotId) => setMercGodSlot(openMerc.id, slotId)}
          onRemoveMember={() => returnMercToBarracks(openMerc.id)}
        />
      )}

      {showTemplates && <TemplatePicker onPick={addFromTemplate} onClose={() => setShowTemplates(false)} />}
    </div>
  );
}

function TemplatePicker({ onPick, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40 }} />
      <div
        className="dq-fade-in"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 41,
          maxHeight: "80vh", overflowY: "auto",
          background: "linear-gradient(180deg, #241f1a, #171310)",
          borderTop: "1px solid rgba(201,162,39,0.35)",
          borderRadius: "14px 14px 0 0",
          padding: "18px 18px 28px",
          boxShadow: "0 -10px 40px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(201,162,39,0.3)", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div className="dq-display" style={{ fontSize: 16, fontWeight: 700, color: "#F0E6C8" }}>Choose a Template</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "#8A7C5C", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 11.5, color: "#6b5f47", marginBottom: 14 }}>Adapted from Song of Blades and Heroes rosters — pick one, then customize it.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {PRESET_PROFILES.map((preset) => (
            <button key={preset.name} onClick={() => onPick(preset)} className="dq-panel" style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 6, cursor: "pointer", color: "#E9DFC8" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{preset.name}</span>
                <span className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C" }}>Q{preset.quality}+ C{preset.combat}</span>
              </div>
              {preset.rules.length > 0 && (
                <div className="dq-mono" style={{ fontSize: 10, color: "#6b5f47", marginTop: 3 }}>{preset.rules.join(", ")}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/* =========================================================================
   PLAYER: BARRACKS — shared team-wide mercenary pool
   ========================================================================= */

function BarracksPanel({ me, myTeam, catalog, barracks, patchShared, showToast }) {
  const [showRecruit, setShowRecruit] = useState(false);
  const teamMercs = (barracks || []).filter((m) => m.teamId === myTeam.id);

  const recruitFromOption = (option) => {
    if (me.requisition < option.cost) { showToast("Not enough Baraz-Klink to recruit this mercenary"); return; }
    patchShared((s) => {
      const ruleIds = option.rules.map((name) => findSpecialRuleIdByName(s.catalog, name)).filter(Boolean);
      const merc = { ...blankMerc(option.name, myTeam.id), quality: option.quality, combat: option.combat, specialRules: ruleIds, cost: option.cost };
      return {
        ...s,
        players: s.players.map((p) => (p.id === me.id ? { ...p, requisition: p.requisition - option.cost } : p)),
        barracks: [...(s.barracks || []), merc],
      };
    });
    setShowRecruit(false);
    showToast(`${option.name} recruited to the Barracks`);
  };

  const claimMerc = (mercId) => {
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId ? { ...m, assignedTo: me.id } : m)) }));
    showToast("Assigned to your war band — see War Band tab");
  };

  const releaseMerc = (mercId) => {
    patchShared((s) => ({ ...s, barracks: (s.barracks || []).map((m) => (m.id === mercId ? { ...m, assignedTo: null } : m)) }));
    showToast("Returned to Barracks");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="dq-panel dq-fade-in" style={{ borderRadius: 8, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em" }}>BARRACKS — {myTeam.name.toUpperCase()}</div>
          <div className="dq-chip" style={{ background: `${myTeam.color}22`, color: myTeam.color, border: `1px solid ${myTeam.color}55` }}><Coins size={11} /> {me.requisition} Bz</div>
        </div>
        <div style={{ fontSize: 11.5, color: "#6b5f47", marginBottom: 12 }}>Shared mercenaries — recruit them into the pool, then any teammate can claim one into their own war band.</div>

        {teamMercs.length === 0 && <div style={{ fontSize: 12.5, color: "#6b5f47", fontStyle: "italic", marginBottom: 10 }}>No mercenaries recruited yet.</div>}

        {teamMercs.map((m) => {
          const mine = m.assignedTo === me.id;
          const withSomeone = m.assignedTo && !mine;
          return (
            <div key={m.id} className="dq-panel" style={{ padding: "10px 12px", borderRadius: 6, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, opacity: withSomeone ? 0.6 : 1 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {m.legend ? <Crown size={11} color="#C9A227" style={{ marginRight: 4, verticalAlign: -1 }} /> : (m.specialRules || []).length >= LEGEND_SKILL_THRESHOLD ? <span title="Eligible for Legend status" style={{ marginRight: 4, color: "#C9A227" }}>✦</span> : null}
                  {m.name}
                </div>
                <div className="dq-mono" style={{ fontSize: 10, color: "#6b5f47" }}>
                  Q{m.quality}+ C{m.combat} · {calcMemberPoints(m, catalog)} pts · {mine ? "with you" : m.assignedTo ? "recruited by a teammate" : "available"}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                {!m.assignedTo && <button onClick={() => claimMerc(m.id)} style={smallBtnStyle}>Claim</button>}
                {mine && <button onClick={() => releaseMerc(m.id)} style={smallBtnStyle}>Return</button>}
                {withSomeone && <span className="dq-mono" style={{ fontSize: 10, color: "#6b5f47" }}>unavailable</span>}
              </div>
            </div>
          );
        })}

        <button onClick={() => setShowRecruit(true)} style={{ ...smallBtnStyle, width: "100%" }}>
          <Plus size={12} style={{ marginRight: 5, verticalAlign: -2 }} /> Recruit new mercenary
        </button>
      </div>

      {showRecruit && <RecruitPicker onPick={recruitFromOption} onClose={() => setShowRecruit(false)} affordable={me.requisition} />}
    </div>
  );
}

function RecruitPicker({ onPick, onClose, affordable }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40 }} />
      <div
        className="dq-fade-in"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 41,
          maxHeight: "80vh", overflowY: "auto",
          background: "linear-gradient(180deg, #241f1a, #171310)",
          borderTop: "1px solid rgba(201,162,39,0.35)",
          borderRadius: "14px 14px 0 0",
          padding: "18px 18px 28px",
          boxShadow: "0 -10px 40px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(201,162,39,0.3)", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div className="dq-display" style={{ fontSize: 16, fontWeight: 700, color: "#F0E6C8" }}>Recruit a Mercenary</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "#8A7C5C", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 11.5, color: "#6b5f47", marginBottom: 14 }}>Costs are the doc's placeholder prices — Baraz-Klink is deducted from you, but the recruit joins the shared Barracks.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {BARRACKS_RECRUIT_OPTIONS.map((option) => {
            const canAfford = affordable >= option.cost;
            return (
              <button key={option.name} onClick={() => canAfford && onPick(option)} disabled={!canAfford} className="dq-panel" style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 6, cursor: canAfford ? "pointer" : "not-allowed", color: "#E9DFC8", opacity: canAfford ? 1 : 0.45 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{option.name}</span>
                  <span className="dq-mono" style={{ fontSize: 11, color: "#C9A227" }}>{option.cost} Bz</span>
                </div>
                <div className="dq-mono" style={{ fontSize: 10, color: "#8A7C5C", marginTop: 3 }}>
                  Q{option.quality}+ C{option.combat}{option.rules.length > 0 ? ` · ${option.rules.join(", ")}` : ""}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function StatChip({ label, value, color }) {
  return (
    <div className="dq-mono" style={{ fontSize: 10.5, color, border: `1px solid ${color}55`, background: `${color}18`, borderRadius: 4, padding: "3px 6px", minWidth: 34, textAlign: "center" }}>
      {label} {value}
    </div>
  );
}

function MemberTray({ member, owned, catalog, teamColor, mode = "personal", godSlots = [], onClose, onPatch, onSetSlot, onAddRule, onRemoveRule, onAdjustKills, onAddFeat, onRemoveFeat, onAddFoundItem, onRemoveFoundItem, onToggleStatus, onToggleLegend, onSetGodSlot, onRemoveMember }) {
  const [featDraft, setFeatDraft] = useState("");
  const [itemDraft, setItemDraft] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [killsDisplay, adjustKillsCoalesced] = useCoalescedCounter(member.kills || 0, onAdjustKills);
  const points = calcMemberPoints(member, catalog);
  const ooa = member.status === "ooa";
  const chosenRules = (member.specialRules || []).map((id) => catalog.specialRule?.find((r) => r.id === id)).filter(Boolean);
  const availableRules = (catalog.specialRule || []).filter((r) => !(member.specialRules || []).includes(r.id));
  const legendEligible = !member.legend && chosenRules.length >= LEGEND_SKILL_THRESHOLD;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40 }} />
      <div
        className="dq-fade-in"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 41,
          maxHeight: "85vh", overflowY: "auto",
          background: "linear-gradient(180deg, #241f1a, #171310)",
          borderTop: "1px solid rgba(201,162,39,0.35)",
          borderRadius: "14px 14px 0 0",
          padding: "18px 18px 28px",
          boxShadow: "0 -10px 40px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(201,162,39,0.3)", margin: "0 auto 16px" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
          <input
            defaultValue={member.name}
            onBlur={(e) => onPatch({ name: e.target.value })}
            className="dq-display"
            style={{ fontSize: 18, fontWeight: 700, padding: "6px 10px", borderRadius: 4, flex: 1, minWidth: 0, textDecoration: ooa ? "line-through" : "none" }}
          />
          <button onClick={onClose} aria-label="Close member card" style={{ background: "transparent", border: "none", color: "#8A7C5C", cursor: "pointer", flexShrink: 0 }}><X size={20} /></button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 4px" }}>
          <div className="dq-mono" style={{ fontSize: 14, color: teamColor, fontWeight: 700 }}>{points} pts</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onToggleLegend} title="Toggle Legend status" style={{ ...smallBtnStyle, background: member.legend ? "rgba(201,162,39,0.22)" : legendEligible ? "rgba(201,162,39,0.12)" : smallBtnStyle.background, color: member.legend || legendEligible ? "#C9A227" : smallBtnStyle.color, border: legendEligible && !member.legend ? "1px solid rgba(201,162,39,0.5)" : smallBtnStyle.border, display: "flex", alignItems: "center", gap: 5 }}>
              <Crown size={12} /> {member.legend ? "Legend" : "Mark Legend"}
            </button>
            <button onClick={onToggleStatus} style={{ ...smallBtnStyle, background: ooa ? "rgba(217,136,120,0.15)" : smallBtnStyle.background, color: ooa ? "#D98878" : smallBtnStyle.color, border: ooa ? "1px solid rgba(217,136,120,0.4)" : smallBtnStyle.border, display: "flex", alignItems: "center", gap: 5 }}>
              <Ban size={12} /> {ooa ? "OOA" : "Mark OOA"}
            </button>
          </div>
        </div>

        {legendEligible && (
          <div className="dq-mono" style={{ fontSize: 10, color: "#C9A227", marginBottom: 10, padding: "0 4px" }}>
            ✦ Eligible for Legend status — {chosenRules.length} special rules learned
          </div>
        )}

        {!member.legend && !ooa && godSlots.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="dq-mono" style={{ fontSize: 10, color: "#8A7C5C", marginBottom: 4 }}>ASSIGNED GOD (FINALE)</div>
            <select value={member.godSlot || ""} onChange={(e) => onSetGodSlot(e.target.value || null)} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12.5 }}>
              <option value="">— not assigned —</option>
              {godSlots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
          <QualityPicker value={member.quality} color={teamColor} onChange={(v) => onPatch({ quality: v })} />
          <StatSlider label="Combat" value={member.combat} color={teamColor} onChange={(v) => onPatch({ combat: v })} />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, padding: "10px 12px", borderRadius: 6, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(201,162,39,0.15)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Skull size={15} color={teamColor} />
            <span className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C", letterSpacing: "0.06em" }}>KILLS</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => adjustKillsCoalesced(-1)} style={iconBtnStyle}><Minus size={13} /></button>
            <span className="dq-mono" style={{ fontSize: 16, color: teamColor, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{killsDisplay}</span>
            <button onClick={() => adjustKillsCoalesced(1)} style={iconBtnStyle}><Plus size={13} /></button>
          </div>
        </div>

        <div className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 8 }}>LOADOUT (3 SLOTS)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {[0, 1, 2].map((slotIdx) => {
            const current = member.slots?.[slotIdx];
            return (
              <select
                key={slotIdx}
                value={current ? `${current.type}:${current.itemId}` : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return onSetSlot(slotIdx, null);
                  const [type, itemId] = val.split(":");
                  onSetSlot(slotIdx, { type, itemId });
                }}
                style={{ padding: "9px 10px", borderRadius: 6, fontSize: 13 }}
              >
                <option value="">— empty slot —</option>
                {owned.map((it) => (
                  <option key={it.type + it.id} value={`${it.type}:${it.id}`}>{`[${it.type}] ${it.name}`}</option>
                ))}
              </select>
            );
          })}
        </div>
        {owned.length === 0 && <div style={{ fontSize: 11.5, color: "#6b5f47", fontStyle: "italic", marginTop: -12, marginBottom: 16 }}>Nothing to equip yet — buy gear in the Armory first.</div>}

        <div className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 8 }}>SPECIAL RULES</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {chosenRules.length === 0 && <div style={{ fontSize: 12, color: "#6b5f47", fontStyle: "italic" }}>None added yet.</div>}
          {chosenRules.map((r) => (
            <span key={r.id} className="dq-chip" style={{ color: "#E9DFC8", border: "1px solid rgba(201,162,39,0.25)", background: "rgba(201,162,39,0.08)" }} title={r.effect}>
              {r.name} <span style={{ opacity: 0.6 }}>({r.cost}pt)</span>
              <button onClick={() => onRemoveRule(r.id)} style={{ background: "none", border: "none", color: "#8A7C5C", cursor: "pointer", padding: 0, display: "flex" }}><X size={11} /></button>
            </span>
          ))}
        </div>
        <select
          value=""
          onChange={(e) => onAddRule(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12.5, marginBottom: 20 }}
        >
          <option value="">— add a special rule —</option>
          {availableRules.map((r) => (
            <option key={r.id} value={r.id}>{r.name} — {r.effect}</option>
          ))}
        </select>

        <div className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 8 }}>NOTABLE FEATS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {(member.feats || []).length === 0 && <div style={{ fontSize: 12, color: "#6b5f47", fontStyle: "italic" }}>No feats logged yet.</div>}
          {(member.feats || []).map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 10px", borderRadius: 6, background: "rgba(201,162,39,0.06)", border: "1px solid rgba(201,162,39,0.15)" }}>
              <span style={{ flex: 1, fontSize: 12.5, color: "#E9DFC8", lineHeight: 1.4 }}>{f}</span>
              <button onClick={() => onRemoveFeat(i)} style={{ background: "none", border: "none", color: "#8A7C5C", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0, marginTop: 2 }}><X size={12} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input
            value={featDraft}
            onChange={(e) => setFeatDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { onAddFeat(featDraft); setFeatDraft(""); } }}
            placeholder="e.g. Turn 5 — solo held the bridge against three orcs"
            style={{ flex: 1, padding: "8px 10px", borderRadius: 6, fontSize: 12.5 }}
          />
          <button onClick={() => { onAddFeat(featDraft); setFeatDraft(""); }} style={smallBtnStyle}>Add</button>
        </div>

        <div className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C", letterSpacing: "0.08em", marginBottom: 8 }}>FOUND ITEMS (LIVE PLAY)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {(member.foundItems || []).length === 0 && <div style={{ fontSize: 12, color: "#6b5f47", fontStyle: "italic" }}>Nothing found yet.</div>}
          {(member.foundItems || []).map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 10px", borderRadius: 6, background: "rgba(201,162,39,0.06)", border: "1px solid rgba(201,162,39,0.15)" }}>
              <span style={{ flex: 1, fontSize: 12.5, color: "#E9DFC8", lineHeight: 1.4 }}>{it}</span>
              <button onClick={() => onRemoveFoundItem(i)} style={{ background: "none", border: "none", color: "#8A7C5C", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0, marginTop: 2 }}><X size={12} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input
            value={itemDraft}
            onChange={(e) => setItemDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { onAddFoundItem(itemDraft); setItemDraft(""); } }}
            placeholder="e.g. Magic Cloak from the treasure tile"
            style={{ flex: 1, padding: "8px 10px", borderRadius: 6, fontSize: 12.5 }}
          />
          <button onClick={() => { onAddFoundItem(itemDraft); setItemDraft(""); }} style={smallBtnStyle}>Add</button>
        </div>

        {mode === "mercenary" ? (
          <button onClick={onRemoveMember} style={{ ...smallBtnStyle, width: "100%" }}>Return to Barracks</button>
        ) : !confirmRemove ? (
          <button onClick={() => setConfirmRemove(true)} style={{ ...dangerBtnStyle, width: "100%" }}>Remove from war band</button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmRemove(false)} style={{ ...smallBtnStyle, flex: 1 }}>Cancel</button>
            <button onClick={onRemoveMember} style={{ ...dangerBtnStyle, flex: 1 }}>Confirm remove</button>
          </div>
        )}
      </div>
    </>
  );
}

function QualityPicker({ value, color, onChange }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C" }}>QUALITY</span>
        <span className="dq-mono" style={{ fontSize: 13, color, fontWeight: 700 }}>{value}+</span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {QUALITY_VALUES.map((v) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              flex: 1, padding: "6px 0", borderRadius: 4, fontSize: 12, cursor: "pointer",
              border: value === v ? `2px solid ${color}` : "1px solid rgba(201,162,39,0.25)",
              background: value === v ? `${color}22` : "transparent",
              color: value === v ? "#F0E6C8" : "#8A7C5C",
            }}
          >
            {v}+
          </button>
        ))}
      </div>
      <div className="dq-mono" style={{ fontSize: 9, color: "#6b5f47", marginTop: 3 }}>lower is better</div>
    </div>
  );
}

// Coalesces rapid repeat-clicks (e.g. mashing a +1 button) into a single network write,
// fired shortly after the clicking stops, while still updating the on-screen number instantly.
function useCoalescedCounter(committedValue, onCommit, delay = 400) {
  const [display, setDisplay] = useState(committedValue);
  const pendingRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => { setDisplay(committedValue); }, [committedValue]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const adjust = (delta) => {
    setDisplay((d) => d + delta);
    pendingRef.current += delta;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const total = pendingRef.current;
      pendingRef.current = 0;
      if (total !== 0) onCommit(total);
    }, delay);
  };

  return [display, adjust];
}

function StatSlider({ label, value, color, onChange }) {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef(null);

  useEffect(() => { setLocalValue(value); }, [value]);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleChange = (v) => {
    setLocalValue(v); // instant visual feedback while dragging
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(v), 350); // only save once dragging pauses
  };

  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span className="dq-mono" style={{ fontSize: 10.5, color: "#8A7C5C" }}>{label.toUpperCase()}</span>
        <span className="dq-mono" style={{ fontSize: 13, color, fontWeight: 700 }}>{localValue}</span>
      </div>
      <input
        type="range" min={0} max={COMBAT_MAX} step={1} value={localValue}
        onChange={(e) => handleChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: color }}
      />
    </div>
  );
}

/* =========================================================================
   PLAYER: ARMORY
   ========================================================================= */

function ArmoryPanel({ me, catalog, patchShared, showToast, teamColor }) {
  const [catType, setCatType] = useState("weapon");

  const buy = (item) => {
    if (me.requisition < item.cost) { showToast("Not enough requisition"); return; }
    patchShared((s) => ({
      ...s,
      players: s.players.map((p) => {
        if (p.id !== me.id) return p;
        if (p.loadout[catType]?.includes(item.id)) return p;
        return { ...p, requisition: p.requisition - item.cost, loadout: { ...p.loadout, [catType]: [...(p.loadout[catType] || []), item.id] } };
      }),
    }));
    showToast(`${item.name} added to your war band`);
  };

  return (
    <div className="dq-panel dq-fade-in" style={{ borderRadius: 8, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em" }}>ARMORY</div>
        <div className="dq-chip" style={{ background: `${teamColor}22`, color: teamColor, border: `1px solid ${teamColor}55` }}><Coins size={11} /> {me.requisition} Bz</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {["weapon", "armor", "skill"].map((k) => (
          <button key={k} onClick={() => setCatType(k)} style={{ ...smallBtnStyle, flex: 1, background: catType === k ? "rgba(201,162,39,0.22)" : smallBtnStyle.background }}>{k.toUpperCase()}S</button>
        ))}
      </div>
      {catalog[catType].map((item) => {
        const owned = me.loadout[catType]?.includes(item.id);
        return (
          <div key={item.id} className="dq-panel" style={{ borderRadius: 6, padding: 12, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 13.5, color: "#E9DFC8" }}>{item.name}</div>
              <div style={{ fontSize: 11.5, color: "#8A7C5C", fontStyle: "italic" }}>{item.effect}</div>
            </div>
            {owned ? (
              <div className="dq-chip" style={{ color: "#8fbf7a", border: "1px solid #8fbf7a55", flexShrink: 0 }}><Check size={11} /> owned</div>
            ) : (
              <button onClick={() => buy(item)} disabled={me.requisition < item.cost} style={{ ...smallBtnStyle, flexShrink: 0, opacity: me.requisition < item.cost ? 0.4 : 1 }}>{item.cost} Bz</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================================
   PLAYER: DEPLOY
   ========================================================================= */

function DeployPanel({ shared, patchShared, me, myTeam, otherTeam, turn, round, myTeamPlayers, editingRef, showToast }) {
  const mySide = me.teamId === shared.teams[0].id ? "a" : "b";
  const otherSide = mySide === "a" ? "b" : "a";
  const locked = round.status[mySide] === "submitted";
  const playerName = (id) => shared.players.find((p) => p.id === id)?.name || "—";
  const bandLabel = (p) => {
    const mercs = assignedMercsForPlayer(shared.barracks, p.id);
    const all = [...(p.warband || []), ...mercs];
    if (!all.length) return "no war band set";
    const pts = all.reduce((s, m) => s + calcMemberPoints(m, shared.catalog), 0);
    const active = all.filter((m) => m.status !== "ooa").length;
    return `${active}/${all.length} ready · ${pts} pts`;
  };

  const assign = (slotIdx, playerId) => {
    patchShared((s) => {
      const t = s.turns[s.currentTurn];
      const r = s.rounds[t.number] || newRound();
      const matchups = r.matchups.map((m, i) => (i === slotIdx ? { ...m, [mySide]: playerId || null } : m));
      return { ...s, rounds: { ...s.rounds, [t.number]: { ...r, matchups } } };
    });
  };

  const setNotes = (slotIdx, text) => {
    patchShared((s) => {
      const t = s.turns[s.currentTurn];
      const r = s.rounds[t.number] || newRound();
      const key = mySide === "a" ? "notesA" : "notesB";
      const matchups = r.matchups.map((m, i) => (i === slotIdx ? { ...m, [key]: text } : m));
      return { ...s, rounds: { ...s.rounds, [t.number]: { ...r, matchups } } };
    });
  };

  const submit = () => {
    patchShared((s) => {
      const t = s.turns[s.currentTurn];
      const r = s.rounds[t.number] || newRound();
      return { ...s, rounds: { ...s.rounds, [t.number]: { ...r, status: { ...r.status, [mySide]: "submitted" } } } };
    });
    showToast("Plan submitted to Command");
  };

  const unlock = () => {
    patchShared((s) => {
      const t = s.turns[s.currentTurn];
      const r = s.rounds[t.number] || newRound();
      return { ...s, rounds: { ...s.rounds, [t.number]: { ...r, status: { ...r.status, [mySide]: "drafting" } } } };
    });
  };

  const assignedElsewhere = (slotIdx, pid) => round.matchups.some((m, i) => i !== slotIdx && m[mySide] === pid);

  return (
    <div className="dq-panel dq-fade-in" style={{ borderRadius: 8, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="dq-mono" style={{ fontSize: 11, color: "#8A7C5C", letterSpacing: "0.08em" }}>TURN {turn.number} DEPLOYMENT</div>
        <div className="dq-chip" style={{ background: locked ? `${myTeam.color}22` : "rgba(255,255,255,0.05)", color: myTeam.color, border: `1px solid ${myTeam.color}55` }}>
          {locked ? <Lock size={10} /> : <Unlock size={10} />} {locked ? "submitted" : "drafting"}
        </div>
      </div>

      {round.revealed && (
        <div className="dq-mono" style={{ fontSize: 10.5, color: "#C9A227", marginBottom: 12 }}>Assignments are revealed — you can see who each team sent.</div>
      )}

      {round.matchups.map((m, i) => {
        const myAssigned = m[mySide];
        const oppAssigned = m[otherSide];
        return (
          <div key={i} style={{ borderTop: i > 0 ? "1px solid rgba(201,162,39,0.12)" : "none", padding: "12px 0" }}>
            <div className="dq-mono" style={{ fontSize: 10, color: "#6b5f47", marginBottom: 6 }}>GAME {i + 1}</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
              <select disabled={locked} value={myAssigned || ""} onChange={(e) => assign(i, e.target.value || null)} style={{ flex: 1, padding: "8px 10px", borderRadius: 6, fontSize: 13 }}>
                <option value="">— choose player —</option>
                {myTeamPlayers.map((p) => (
                  <option key={p.id} value={p.id} disabled={assignedElsewhere(i, p.id) && myAssigned !== p.id}>{p.name} — {bandLabel(p)}</option>
                ))}
              </select>
              <span className="dq-mono" style={{ fontSize: 11, color: "#6b5f47" }}>vs</span>
              <div style={{ flex: 1, padding: "8px 10px", borderRadius: 6, background: "rgba(0,0,0,0.2)", fontSize: 13, color: round.revealed && oppAssigned ? "#E9DFC8" : "#6b5f47" }}>
                {round.revealed ? (oppAssigned ? playerName(oppAssigned) : "unassigned") : "hidden until reveal"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <div className="dq-mono" style={{ flex: 1, fontSize: 9.5, color: "#6b5f47" }} />
              <div style={{ width: 20 }} />
              <div className="dq-mono" style={{ flex: 1, fontSize: 9.5, color: "#6b5f47", textAlign: "right" }}>
                {round.revealed && oppAssigned ? bandLabel(shared.players.find((p) => p.id === oppAssigned) || {}) : ""}
              </div>
            </div>
            <textarea
              placeholder="Deployment notes for this game (private to your team)"
              defaultValue={mySide === "a" ? m.notesA : m.notesB}
              disabled={locked}
              onFocus={() => (editingRef.current = true)}
              onBlur={(e) => { editingRef.current = false; setNotes(i, e.target.value); }}
              rows={2}
              style={{ width: "100%", padding: 8, borderRadius: 4, fontSize: 12.5, resize: "vertical" }}
            />
          </div>
        );
      })}

      <div style={{ marginTop: 14 }}>
        {locked ? (
          <button onClick={unlock} style={{ ...smallBtnStyle, width: "100%" }}><Unlock size={12} style={{ marginRight: 5, verticalAlign: -2 }} />Reopen plan for editing</button>
        ) : (
          <button onClick={submit} style={{ ...primaryBtnStyle, width: "100%" }}><Lock size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Submit Plan to Command</button>
        )}
      </div>
    </div>
  );
}
