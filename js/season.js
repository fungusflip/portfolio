// ============================================================================
// season.js — kalendern: vilken årstid, vecka och dag sidan visar. Rena tal, ingen three.js och
// ingen DOM, så att både 3D-spelet (js/) och den vanliga webbplatsen (site/js/site.js) läser samma val.
// ============================================================================
// ALLT ligger i tabellen RULES nedan. En regel = { name, from, to, config, ... }:
//   from, to  – [månad, dag], båda med. Går intervallet över nyår (winter: dec–feb) funkar det ändå.
//   weekday   – (valfri) bara på den veckodagen (0 = söndag ... 5 = fredag): midsommar.
//   base      – true = en årstid (månadsnivå). De andra är händelser (vecko- och dagsnivå).
//   ramp      – (valfri) { weeks }: händelsen växer över intervallet; vecka 1 = lite, sista = fullt.
//   demo      – [månad, dag] som ?season=NAMN låtsas att det är (så att man kan provköra utanför säsongen).
//   config    – vad regeln ändrar (se nycklarna längre ner). Tom = ingenting ändras.
// Alla regler vars datum stämmer gäller på en gång. De läggs ihop uppifrån och ned, så SENARE regler
// vinner: ordna tabellen från bred (årstid) till smal (en enda dag). Händelser ligger efter årstiderna.
//
// Prova utan att vänta på datumet (i adressen):
//   ?season=halloween  | winter | spring | summer | autumn | halloween-night | midsummer | ...  (en regel för sig)
//   ?season=off        (eller default)  – ingen säsong alls, helt som vanligt
//   ?date=2026-10-31   – låtsas att det är det datumet (använder alla regler som gäller då)
//
// Nycklarna i en regels config (alla valfria; ett objekt läggs ihop med föregående, en lista ersätts):
//   palette    – färger som skriver över PALETTE i core.js (hemvärlden: himmel, dimma, ljus, lyktor, mark).
//   light      – { hemi, sun }: gånger-tal på himmelsljusets och solens styrka.
//   fog        – { nearMul, farMul }: gånger-tal på dimmans start och slut (lägre = tätare).
//   lamp       – { flickerMul, faultyEvery }: hur ofta lyktorna flimrar, och var n:te lykta som flimrar.
//   caveTint   – { color, strength }: ett svagt kusligt sken vid grottöppningarna.
//   pondMist   – { count, color, opacity }: lätt dimma över dammen.
//   particles  – { drift: { NAMN: { kind, count, colors, fall, sway, size } }, bats: { trees, perTree, color } }.
//                kind: 'leaf' | 'flake' | 'petal' | 'spark' (se js/seasonfx.js).
//   props      – { pumpkins: { count, minGap, colors }, lampPumpkins, cobwebs, shardColor, pulpColor, seedColor }.
//   banner     – kort hälsning som visas en stund på webbplatsen.
//   foliage    – { leafLitter, groundLeaves, fallingLeaves, litterAlt, soilAlpha }: löv under träden (trees.js), lövtäcket och
//                fallande löv (leaves.js). Gånger-tal 0..1 (0 = inga löv; litterAlt = färgen på snö-/frostklumparna som ersätter dem).
//                Kronornas och lövens färger sätts med palette.leaves / palette.fallenLeaves.
//   (foliage.groundStyle: 'snow' = markens bild ritas som snötäcke med bara fläckar, utan lövformer; foliage.debris = två färger på skräpet när växter körs över.)
//   winter     – { snowmen, drifts, ice, aurora, lights }: vinterns extra saker (js/season-winter.js): antal snögubbar och drivor, is på dammen,
//                norrskenets styrka (0..1) och julbelysning (true).
//   tracks     – { life, grass, road }: däckspårens livslängd (gånger-tal) och färger [färg, alfa] (tracks.js).
//   modules    – { winter | 'spring-summer' | autumn: true }: säsongens extra filer (js/season-*.js), se hook-API i seasonfx.js.
//   site       – { accent, badge }: accentfärg och liten dekor i sidhuvudet (badge: 'pumpkin' | 'snowflake' | 'flower' | 'sun' | 'star').

export const RULES = [
  // --- Månadsnivå: årstider. Hösten är spelets vanliga utseende, så den ändrar inget. ---
  {
    name: 'winter', base: true, from: [12, 1], to: [2, 29],
    config: {
      palette: { background: '#2c3656', sun: '#d6e4ff', skyLight: '#c4d6ff', groundLight: '#a9b8e0', ground: '#c3cfe0', groundDark: '#a9b9d2', groundDry: '#dbe4f1', grassRoot: '#8fa2bd', grassTip: '#eef3fa', grassTipAutumn: '#d3e1f2',
        gravel: '#8d94a3', gravelLight: '#b6bdca', gravelDark: '#656b7a', tireDust: '#f2f6ff', // Snö på marken och vägarna.
        // Kronor och löv: frostiga, snötyngda kronor och bleka "löv" i markens textur (inga röda och orange).
        leaves: ['#e4edf5', '#cfdceb', '#b9cbe0'], fallenLeaves: ['#dfe7f0', '#cdd8e6', '#eef3f8', '#b9c8da', '#e3ebf4'],
      },
      foliage: { leafLitter: 0, groundLeaves: 0, fallingLeaves: 0, litterAlt: '#eef3f8', soilAlpha: 0.25, groundStyle: 'snow', debris: ['#3b3a40', '#eef3f8'] }, // Inga löv: snöfläckar och frost i stället.
      modules: { winter: true },
      winter: { snowmen: 7, drifts: 130, ice: true, aurora: 0.3, patches: 150 }, // js/season-winter.js
      tracks: { life: 3, grass: { normal: ['#5c6a82', 0.6], heavy: ['#463f42', 0.8] }, road: { normal: ['#79849a', 0.4], heavy: ['#3d4352', 0.55] } }, // Däckspår blir kvar i snön (tracks.js).
      light: { hemi: 1.0, sun: 0.85 },
      fog: { nearMul: 0.85, farMul: 0.9 },
      particles: { drift: { snow: { kind: 'flake', count: 160, colors: ['#ffffff', '#e6efff'], fall: 1.1, sway: 0.7, size: 0.12 } } },
      site: { accent: '#9cc4ff', badge: 'snowflake' },
    },
  },
  {
    name: 'spring', base: true, from: [3, 1], to: [5, 31],
    config: {
      palette: { background: '#443f70', sun: '#ffd0a0', skyLight: '#c4c0ff', ground: '#8fae58', groundDark: '#76964a', groundDry: '#b3b66e',
        // Friskt ljusgrönt med blommor (rosa) i kronorna; kronblad i stället för höstlöv.
        leaves: ['#6fcf5a', '#8adc62', '#f4a6c0', '#ffc8d8'], fallenLeaves: ['#f6b8cc', '#ffd9e4', '#b8e07a', '#fff0f4', '#9fd46a'],
      },
      foliage: { leafLitter: 0.35, groundLeaves: 0.3, fallingLeaves: 0.5, litterAlt: '#ffd9e4', soilAlpha: 0.8 },
      modules: { 'spring-summer': true },
      light: { hemi: 1.1, sun: 0.95 },
      particles: { drift: { petals: { kind: 'petal', count: 90, colors: ['#ffc4d8', '#ffe0ea', '#fff0f4'], fall: 0.8, sway: 0.9, size: 0.22 } } },
      site: { accent: '#ff9ec0', badge: 'flower' },
    },
  },
  {
    name: 'summer', base: true, from: [6, 1], to: [8, 31],
    config: {
      palette: { background: '#5a5698', sun: '#ffd89a', skyLight: '#d4d4ff', groundLight: '#ffb070', ground: '#a6ae52', groundDark: '#87954a', groundDry: '#c4bb6a',
        // Djupt, fullt grönt.
        leaves: ['#2f7a24', '#3f8f2a', '#4fa030'], fallenLeaves: ['#8cb83a', '#a8c842', '#c8d44a'],
      },
      foliage: { leafLitter: 0.2, groundLeaves: 0.15, fallingLeaves: 0.1, litterAlt: '#9ccc4a', soilAlpha: 0.7 },
      modules: { 'spring-summer': true },
      light: { hemi: 1.18, sun: 1.12 },
      fog: { nearMul: 1.1, farMul: 1.15 },
      site: { accent: '#ffc24a', badge: 'sun' },
    },
  },
  // Regnig vår: en regnvecka i slutet av april (regn, våta vägar, mörkare himmel; js/season-spring-summer.js läser hasRule).
  {
    name: 'rainy-spring', from: [4, 20], to: [4, 26], demo: [4, 22],
    config: {
      palette: { background: '#3a4262', sun: '#aab8d8', skyLight: '#8f9cc4', groundLight: '#7f8cb0' },
      light: { hemi: 0.85, sun: 0.55 },
      fog: { nearMul: 0.7, farMul: 0.75 },
    },
  },
  { name: 'autumn', base: true, from: [9, 1], to: [11, 30], config: { modules: { autumn: true } } },

  // --- Veckonivå: Halloween växer över oktober (vecka 1 lite, vecka 4 fullt) och lever kvar till 1 november. ---
  {
    name: 'halloween', from: [10, 1], to: [11, 1], ramp: { weeks: 4 }, demo: [10, 28],
    config: {
      palette: {
        background: '#2a1838', sun: '#ff8a3a', skyLight: '#9a80c8', groundLight: '#ff7a3a', warmLamp: '#ff7a1a',
        ground: '#858a4a', groundDark: '#66703a', groundDry: '#9c9157',
      },
      light: { hemi: 0.85, sun: 0.78 },
      fog: { nearMul: 0.78, farMul: 0.85 },
      lamp: { flickerMul: 3, faultyEvery: 3 },
      caveTint: { color: '#6fe39a', strength: 0.85 },
      pondMist: { count: 9, color: '#c4b6e0', opacity: 0.36 },
      particles: {
        drift: { dark: { kind: 'leaf', count: 70, colors: ['#e8661a', '#c4410f', '#f0a030', '#7a3a1a', '#5a2a4a'], fall: 0.5, sway: 1.2, size: 0.4 } },
        bats: { trees: 5, perTree: 2, color: '#120a1a' },
      },
      props: {
        pumpkins: { count: 26, minGap: 4.5, colors: ['#e8731a', '#dd5f12', '#f08a24', '#cf5410', '#e8731a', '#c9a45a', '#f2e6c0', '#7f9a3c'] },
        lampPumpkins: 4, cobwebs: true,
        shardColor: '#e8731a', pulpColor: '#f4b04a', seedColor: '#f5ecc8',
      },
      site: { accent: '#ff8a2a', badge: 'pumpkin' },
    },
  },

  // --- Dagsnivå: särskilda dagar. Smalast sist, så att de vinner. ---
  {
    name: 'halloween-night', from: [10, 31], to: [10, 31], demo: [10, 31],
    config: {
      palette: { background: '#170c22', sun: '#ff7a2a', skyLight: '#7a62a8' },
      light: { hemi: 0.7, sun: 0.6 },
      lamp: { flickerMul: 5, faultyEvery: 2 },
      caveTint: { color: '#6fe39a', strength: 1.1 },
      pondMist: { count: 12, color: '#b8a8d8', opacity: 0.42 },
      particles: { drift: { embers: { kind: 'spark', count: 50, colors: ['#ff9a2a', '#ffcf5a'], fall: -0.6, sway: 0.6, size: 0.1 } } },
      banner: 'Happy Halloween',
    },
  },
  { name: 'all-saints', from: [11, 1], to: [11, 1], demo: [11, 1], config: { banner: 'Last day of the pumpkins' } },
  {
    name: 'walpurgis', from: [4, 30], to: [4, 30], demo: [4, 30],
    config: {
      palette: { warmLamp: '#ff8a2a' },
      particles: { drift: { embers: { kind: 'spark', count: 60, colors: ['#ff9a2a', '#ffcf5a', '#ff6a1a'], fall: -0.7, sway: 0.6, size: 0.1 } } },
      banner: 'Happy Walpurgis Night',
    },
  },
  {
    // Midsommar: fredagen mellan 19 och 25 juni.
    name: 'midsummer', from: [6, 19], to: [6, 25], weekday: 5, demo: [6, 21],
    config: {
      light: { hemi: 1.25, sun: 1.2 },
      particles: { drift: { petals: { kind: 'petal', count: 110, colors: ['#ffffff', '#ffe27a', '#8fb8ff', '#ff9ec0'], fall: 0.7, sway: 0.9, size: 0.22 } } },
      banner: 'Glad midsommar',
      site: { accent: '#ffd24a', badge: 'flower' },
    },
  },
  { name: 'christmas', from: [12, 1], to: [12, 26], demo: [12, 18], config: { winter: { lights: true } } }, // Julbelysning 1-26 december.
  {
    // Vinternatt: solståndet, mörk himmel och starkt norrsken.
    name: 'winter-night', from: [12, 21], to: [12, 21], demo: [12, 21],
    config: {
      palette: { background: '#0b1230', sun: '#9fb8ff', skyLight: '#6f86d0' },
      light: { hemi: 0.75, sun: 0.5 },
      winter: { aurora: 1 },
    },
  },
  {
    name: 'christmas-eve', from: [12, 24], to: [12, 24], demo: [12, 24],
    config: {
      palette: { warmLamp: '#ffd9a0' },
      winter: { lights: true },
      particles: { drift: { sparkle: { kind: 'spark', count: 40, colors: ['#ffe9a8', '#ffffff'], fall: 0.3, sway: 0.5, size: 0.09 } } },
      banner: 'Merry Christmas Eve',
      site: { accent: '#ff7a6a', badge: 'star' },
    },
  },
  {
    name: 'new-years-eve', from: [12, 31], to: [12, 31], demo: [12, 31],
    config: {
      particles: { drift: { confetti: { kind: 'spark', count: 80, colors: ['#ffd24a', '#ff6a8a', '#6ad0ff', '#ffffff'], fall: -0.4, sway: 0.8, size: 0.11 } } },
      banner: "Happy New Year's Eve",
      site: { accent: '#ffd24a', badge: 'star' },
    },
  },
  {
    name: 'new-years-day', from: [1, 1], to: [1, 1], demo: [1, 1],
    config: {
      particles: { drift: { confetti: { kind: 'spark', count: 60, colors: ['#ffd24a', '#ff6a8a', '#6ad0ff', '#ffffff'], fall: -0.4, sway: 0.8, size: 0.11 } } },
      banner: 'Happy New Year',
      site: { accent: '#ffd24a', badge: 'star' },
    },
  },
];

// --- Hjälpmedel ---
const key = (month, day) => month * 100 + day; // [10, 31] → 1031: går att jämföra.
function inRange(rule, date) {
  const now = key(date.getMonth() + 1, date.getDate());
  const from = key(rule.from[0], rule.from[1]);
  const to = key(rule.to[0], rule.to[1]);
  const inside = from <= to ? now >= from && now <= to : now >= from || now <= to; // Över nyår.
  if (!inside) return false;
  return rule.weekday === undefined || date.getDay() === rule.weekday;
}
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
// Lägger ihop två config-objekt: objekt in i objekt, allt annat ersätts.
function merge(target, source) {
  for (const name of Object.keys(source)) {
    if (isObject(source[name]) && isObject(target[name])) merge(target[name], source[name]);
    else target[name] = isObject(source[name]) ? merge({}, source[name]) : source[name];
  }
  return target;
}
// Vecka 1.. av en växande händelse på ett datum (0 om regeln inte växer). Sista veckan är allt från dag 22 och framåt.
function weekOf(rule, date) {
  if (!rule.ramp) return 0;
  const start = new Date(date.getFullYear(), rule.from[0] - 1, rule.from[1]);
  const days = Math.max(0, Math.round((date - start) / 86400000));
  return Math.min(rule.ramp.weeks, Math.floor(days / 7) + 1);
}
// ?date=YYYY-MM-DD → ett lokalt datum (annars null).
function parseDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

let cached = null;
// Läser kalendern. Returnerar { names, week, config, date }:
//   names  – namnen på alla regler som gäller (årstiden först, sedan händelserna), [] = ingenting.
//   week   – vilken vecka en växande händelse är i (0 om ingen växer).
//   config – alla gällande regler ihoplagda.
// Utan argument läses adressen och klockan en gång (datumet ändras inte under besöket).
export function getSeasonState(search, now) {
  const useCache = search === undefined && now === undefined;
  if (useCache && cached) return cached;
  const query = search !== undefined ? search : (typeof location !== 'undefined' ? location.search : '');
  let params;
  try { params = new URLSearchParams(query); } catch (error) { params = new URLSearchParams(''); }
  const forced = params.get('season');
  let date = parseDate(params.get('date')) || now || new Date();
  let rules;
  if (forced === 'off' || forced === 'default') {
    rules = [];
  } else if (forced && RULES.some((rule) => rule.name === forced)) {
    // Den valda regeln på sitt demo-datum, tillsammans med allt annat som gäller då. Veckodagskravet hoppas över.
    const rule = RULES.find((r) => r.name === forced);
    const [month, day] = rule.demo || rule.from;
    date = new Date(date.getFullYear(), month - 1, day);
    // Allt som gäller det datumet (så att t.ex. halloween-night får Halloween-pumporna som den har den 31 oktober). Dagar med veckodagskrav
    // (midsommar) hoppas över om de inte är den som valts.
    rules = rule.base ? [rule] : RULES.filter((r) => r === rule || (r.weekday === undefined && inRange(r, date)));
  } else {
    rules = RULES.filter((rule) => inRange(rule, date));
  }
  const config = {};
  let week = 0;
  for (const rule of rules) {
    merge(config, rule.config || {});
    week = Math.max(week, weekOf(rule, date));
  }
  const state = { names: rules.map((rule) => rule.name), week, config, date };
  if (useCache) cached = state;
  return state;
}

// Reglernas ihoplagda inställningar (tomt objekt = inget ska ändras).
export function getSeasonConfig() {
  return getSeasonState().config;
}
// Namnet på den smalaste regeln som gäller, t.ex. 'halloween-night' (eller 'default').
export function getSeason() {
  const names = getSeasonState().names;
  return names.length ? names[names.length - 1] : 'default';
}
// true om någon regel faktiskt ändrar något.
export function seasonActive() {
  return Object.keys(getSeasonConfig()).length > 0;
}
// true om en viss regel gäller (t.ex. hasRule('halloween')).
export function hasRule(name) {
  return getSeasonState().names.includes(name);
}
// Hur mycket av en växande händelse som ska synas: 1 = fullt. Vecka 1 av 4 = 0.25. Utan växande händelse = 1.
export function rampFactor() {
  const state = getSeasonState();
  if (!state.week) return 1;
  const rule = RULES.find((r) => r.ramp && state.names.includes(r.name));
  return state.week / rule.ramp.weeks;
}
