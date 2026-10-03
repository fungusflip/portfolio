// ============================================================================
// perf.js — prestanda: automatisk kvalitet, FPS-mätaren (tryck F), hackdetektiven,
// profileraren och testbrytarna.
// ============================================================================
import {
  renderer, keyLight, setSunShadowSize, SUN_SHADOW_SIZE, BASE_PIXEL_RATIO, USE_ANTIALIAS,
  QUALITY_STORAGE_KEY, frameNotes, note, currentWorld, WORLDS,
} from './core.js';
import { beam } from './car.js';
import { fallingLeaves, groundLeaves } from './leaves.js';
import { setGrassDensity } from './magic.js';

// ---------------------------------------------------------------------------
// 30-LÅSET
// ---------------------------------------------------------------------------
// Klarar datorn inte 60 bilder per sekund JÄMNT blir det ryckigt: de flesta bilder
// visas 1/60 s, men några 2/60 s. Ögat märker ojämnheten mer än den låga farten.
// Med låset ritas bara varannan skärmuppdatering: stadiga 30. Många konsolspel gör så.
export let lock30 = false;
let lastDrawTime = -Infinity;
// Anropas först i renderloopen: true = hoppa över den här skärmuppdateringen.
// (- 4 ms marginal, eftersom tiderna aldrig blir exakt 33.3 ms.)
export function skipFrame(time) {
  if (lock30 && time - lastDrawTime < 1000 / 30 - 4) return true;
  lastDrawTime = time;
  return false;
}

// ---------------------------------------------------------------------------
// AUTOMATISK KVALITET
// ---------------------------------------------------------------------------
// Sidan mäter hur många bilder per sekund den hinner rita, och hur jämnt. Går det
// för dåligt en stund tas en dyr effekt bort, en i taget. Snabba datorer märker ingenting.
// Nivån sparas, så att nästa besök startar på rätt nivå direkt.
const TARGET_FPS = 45;         // Under det här sänks kvaliteten.
const MAX_HITCH_SHARE = 0.08;  // Eller om fler än 8 % av bilderna är hack (ojämnt = ryckigt).
const QUALITY_WINDOW = 2;      // Sekunder som mäts åt gången.
export let qualityLevel = 0;
let qualityWait = 3;           // Mät inte de första sekunderna.
let measuredTime = 0;
let measuredFrames = 0;
let hitchesAtWindowStart = 0;

// Varje steg = en effekt som tas bort, i ordning från "kostar mest, syns minst".
const QUALITY_STEPS = [
  // Strålkastarens skugga ritar hela scenen en extra gång varje bild.
  { name: 'headlight shadows off', apply() { beam.castShadow = false; } },
  // Mindre skuggkarta = färre pixlar att rita för solens skuggor.
  { name: 'smaller sun shadows', apply() { setSunShadowSize(1024); } },
  // Hälften så många grästuvor.
  { name: 'less grass', apply() { setGrassDensity(0.5); } },
  // Sista steget: jämna 30 bilder per sekund (se 30-LÅSET).
  { name: 'steady 30 fps', apply() { lock30 = true; } },
];

function saveQualityLevel() {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, String(qualityLevel));
  } catch (error) {
    // Privat läge: inget att göra.
  }
}
// Startar på nivån som sparades förra besöket.
export function applySavedQuality() {
  let saved = 0;
  try {
    saved = Math.min(Number(localStorage.getItem(QUALITY_STORAGE_KEY)) || 0, QUALITY_STEPS.length);
  } catch (error) {
    saved = 0;
  }
  for (let i = 0; i < saved; i++) QUALITY_STEPS[i].apply();
  qualityLevel = saved;
  if (saved > 0) console.log(`[quality] starting at saved level ${saved}/${QUALITY_STEPS.length}`);
}

function lowerQuality(reason) {
  const step = QUALITY_STEPS[qualityLevel];
  note('quality change');
  step.apply();
  qualityLevel += 1;
  saveQualityLevel();
  console.log(`[quality] ${reason} → ${step.name} (level ${qualityLevel}/${QUALITY_STEPS.length})`);
  qualityWait = 1;
  measuredTime = 0;
  measuredFrames = 0;
  hitchesAtWindowStart = hitchTotal;
}

export function updateQuality(rawDelta) {
  if (qualityLevel >= QUALITY_STEPS.length) return;
  if (!statsElement.hidden) return; // Medan FPS-mätaren är öppen testar du själv (tangenterna 0–5).
  if (lock30) return;
  if (rawDelta > 0.25) return;      // Väldigt långa bilder (fliken låg i bakgrunden) räknas inte.
  if (qualityWait > 0) {
    qualityWait -= rawDelta;
    hitchesAtWindowStart = hitchTotal;
    return;
  }
  measuredTime += rawDelta;
  measuredFrames += 1;
  if (measuredTime < QUALITY_WINDOW) return;
  const fps = measuredFrames / measuredTime;
  const hitchShare = (hitchTotal - hitchesAtWindowStart) / measuredFrames;
  measuredTime = 0;
  measuredFrames = 0;
  hitchesAtWindowStart = hitchTotal;
  if (fps < TARGET_FPS) lowerQuality(`${Math.round(fps)} fps`);
  else if (hitchShare > MAX_HITCH_SHARE) lowerQuality(`${Math.round(hitchShare * 100)} % uneven frames`);
}

// ---------------------------------------------------------------------------
// HACKDETEKTIVEN
// ---------------------------------------------------------------------------
// Ett "hack" är en enstaka bild som tar mycket längre tid än de andra. Koden skriver
// en anteckning (note i core.js) när den gör något som kan vara dyrt. Tar en bild
// längre än HITCH_TIME skrivs bildens anteckningar ut i konsolen och räknas i mätaren.
const HITCH_TIME = 0.028;        // Sekunder. En normal bild vid 60 FPS tar ca 0.017.
const HITCH_TIME_LOCKED = 0.045; // Med 30-låset tar en normal bild 0.033.
let hitchTotal = 0;
let hitchClockStart = performance.now();
const hitchCounts = new Map();   // Orsak → antal hack.
let lastHitch = 'none yet';
let lastProgramCount = 0;

// Körs först i varje bild. rawDelta = hur lång FÖRRA bilden blev.
export function checkHitch(rawDelta) {
  const limit = lock30 ? HITCH_TIME_LOCKED : HITCH_TIME;
  if (rawDelta > limit && rawDelta < 3) { // Över 3 s låg fliken nog i bakgrunden.
    hitchTotal += 1;
    // Inga anteckningar? Då avgör förra bildens CPU-tid om det var vår kod eller något annat.
    let cause = [...frameNotes].join(' + ');
    if (!cause) {
      cause = lastFrameWork > rawDelta * 1000 * 0.6
        ? `slow code: ${lastFrameSlowest}`
        : `waiting on GPU/browser (code only ${Math.round(lastFrameWork)} ms)`;
    }
    hitchCounts.set(cause, (hitchCounts.get(cause) || 0) + 1);
    lastHitch = `${Math.round(rawDelta * 1000)} ms: ${cause}`;
    console.log(`[hitch] ${lastHitch}`);
  }
  frameNotes.clear();
}

// Skräpsamlingen (garbage collection) syns som att minnet plötsligt MINSKAR.
// performance.memory finns bara i Chrome/Brave.
let lastHeap = 0;
function checkGarbage() {
  if (!performance.memory) return;
  const used = performance.memory.usedJSHeapSize;
  if (used < lastHeap - 1000000) note('garbage collection');
  lastHeap = used;
}
// Har en ny shader skapats? Det tar ofta 50–300 ms första gången.
function checkNewShaders() {
  const count = renderer.info.programs.length;
  if (count > lastProgramCount && lastProgramCount > 0) note('new shader compiled');
  lastProgramCount = count;
}

// ---------------------------------------------------------------------------
// PROFILERAREN – vart tar tiden vägen i varje bild?
// ---------------------------------------------------------------------------
// Renderloopen mäter hur lång tid varje DEL tar för processorn (CPU), och om webbläsaren
// tillåter det även grafikkortets (GPU) tid. En bild har 16.7 ms på sig vid 60 FPS.
const SECTIONS = ['game', 'leaves', 'render', 'previews'];
const sectionTotal = {};
const sectionMax = {};
for (const name of SECTIONS) {
  sectionTotal[name] = 0;
  sectionMax[name] = 0;
}
let profiledFrames = 0;
let lastFrameWork = 0;
let lastFrameSlowest = '';

// times = { game, leaves, render, previews } i ms, total = hela bildens CPU-tid.
export function recordFrame(times, total) {
  let slowest = SECTIONS[0];
  for (const name of SECTIONS) {
    sectionTotal[name] += times[name];
    sectionMax[name] = Math.max(sectionMax[name], times[name]);
    if (times[name] > times[slowest]) slowest = name;
  }
  profiledFrames += 1;
  lastFrameWork = total;
  lastFrameSlowest = `${slowest} ${Math.round(times[slowest])} ms`;
  checkNewShaders();
  checkGarbage();
  readGpuTimers();
}

// Grafikkortets tid: EXT_disjoint_timer_query_webgl2 låter grafikkortet ta tid på sitt
// eget arbete. Svaret kommer några bilder senare, så frågorna sparas i en kö.
const gl = renderer.getContext();
const gpuTimer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const gpuQueries = [];
let gpuTotal = 0;
let gpuMax = 0;
let gpuCount = 0;
export function startGpuTimer() {
  if (!gpuTimer || gpuQueries.length > 6) return null;
  const query = gl.createQuery();
  gl.beginQuery(gpuTimer.TIME_ELAPSED_EXT, query);
  return query;
}
export function endGpuTimer(query) {
  if (!query) return;
  gl.endQuery(gpuTimer.TIME_ELAPSED_EXT);
  gpuQueries.push(query);
}
function readGpuTimers() {
  while (gpuQueries.length > 0) {
    const query = gpuQueries[0];
    if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
    const disjoint = gl.getParameter(gpuTimer.GPU_DISJOINT_EXT); // true = mätningen blev störd.
    const nanoseconds = gl.getQueryParameter(query, gl.QUERY_RESULT);
    gl.deleteQuery(query);
    gpuQueries.shift();
    if (disjoint) continue;
    const ms = nanoseconds / 1e6;
    gpuTotal += ms;
    gpuMax = Math.max(gpuMax, ms);
    gpuCount += 1;
  }
}

// ---------------------------------------------------------------------------
// FPS-MÄTAREN (tryck F, eller lägg till #stats i adressen) OCH TESTBRYTARNA
// ---------------------------------------------------------------------------
//   1 = solens skuggor   2 = strålkastarens skugga   3 = löven   4 = halv upplösning
//   5 = 30-låset         0 = återställ full kvalitet
const statsElement = document.getElementById('stats');
statsElement.hidden = location.hash !== '#stats';
// Vi räknar ALLT som ritas under en bild själva, så three.js ska inte nollställa vid varje render().
renderer.info.autoReset = false;
let halfResolution = false;

function setPixelRatio(ratio) {
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight);
}
function resetHitchCount() {
  hitchCounts.clear();
  hitchTotal = 0;
  hitchClockStart = performance.now();
  lastHitch = 'none yet';
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && !e.repeat) statsElement.hidden = !statsElement.hidden;
  if (statsElement.hidden || e.repeat) return;
  if (e.code === 'Digit1') keyLight.castShadow = !keyLight.castShadow;
  if (e.code === 'Digit2') beam.castShadow = !beam.castShadow;
  if (e.code === 'Digit3') {
    fallingLeaves.visible = !fallingLeaves.visible;
    groundLeaves.visible = fallingLeaves.visible && currentWorld === WORLDS.hub;
  }
  if (e.code === 'Digit4') {
    halfResolution = !halfResolution;
    setPixelRatio(halfResolution ? BASE_PIXEL_RATIO * 0.5 : BASE_PIXEL_RATIO);
  }
  if (e.code === 'Digit5') {
    lock30 = !lock30;
    resetHitchCount();
  }
  if (e.code === 'Digit0') {
    qualityLevel = 0;
    keyLight.castShadow = true;
    beam.castShadow = true;
    setSunShadowSize(SUN_SHADOW_SIZE);
    halfResolution = false;
    setPixelRatio(BASE_PIXEL_RATIO);
    lock30 = false;
    saveQualityLevel(); // Nivå 0 sparas, så att nästa besök också startar på full kvalitet.
    resetHitchCount();
  }
});
const onOff = (value) => (value ? 'on' : 'OFF');

let statsTime = 0;
let statsFrames = 0;
// Körs sist i varje bild. Texten uppdateras två gånger per sekund.
export function updateStats(rawDelta) {
  statsTime += rawDelta;
  statsFrames += 1;
  if (statsTime < 0.5) return;
  const fps = Math.round(statsFrames / statsTime);
  statsTime = 0;
  statsFrames = 0;
  if (statsElement.hidden) return;
  const info = renderer.info.render;
  const top = [...hitchCounts].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([cause, count]) => `  ${count}× ${cause}`).join('\n');
  const cpu = SECTIONS.map((name) => `${name} ${(sectionTotal[name] / Math.max(1, profiledFrames)).toFixed(1)} (max ${sectionMax[name].toFixed(0)})`).join(' · ');
  for (const name of SECTIONS) {
    sectionTotal[name] = 0;
    sectionMax[name] = 0;
  }
  profiledFrames = 0;
  const gpu = !gpuTimer ? 'gpu n/a' : gpuCount ? `gpu ${(gpuTotal / gpuCount).toFixed(1)} ms (max ${gpuMax.toFixed(0)})` : 'gpu …';
  gpuTotal = 0;
  gpuMax = 0;
  gpuCount = 0;
  const minutes = (performance.now() - hitchClockStart) / 60000;
  const perMinute = minutes > 0.05 ? Math.round(hitchTotal / minutes) : '-';
  const heap = performance.memory ? ` · ${Math.round(performance.memory.usedJSHeapSize / 1e6)} MB` : '';
  statsElement.textContent = `${perMinute} hitches/min · ${gpu}${USE_ANTIALIAS ? '' : ' · no AA'}\ncpu ms: ${cpu}\n`
    + `${fps} fps · ${info.calls} draw calls · ${Math.round(info.triangles / 1000)}k triangles · quality ${qualityLevel}${heap}`
    + `\n1 sun shadow ${onOff(keyLight.castShadow)} · 2 headlight shadow ${onOff(beam.castShadow)} · 3 leaves ${onOff(fallingLeaves.visible)} · 4 half res ${onOff(halfResolution)} · 5 lock 30 ${onOff(lock30)} · 0 reset`
    + `\nlast hitch: ${lastHitch}` + (top ? `\nmost common:\n${top}` : '');
}
