// ============================================================================
// stamps.js — stämpelräknaren: hur många av projekten har besökaren sett? Som
// stämplarna i ett pass. Ingen THREE här, bara data, localStorage och en liten HUD.
// ============================================================================
// Ett besök = infopanelen öppnas för projektet (ui.js anropar visit() i openPanel).
// Att bara köra in i en ficka räknas INTE: man kör ofta förbi en skylt på vägen någon
// annanstans, och en stämpel man inte bett om känns fel. Att öppna panelen är ett val.
// Det räknas oavsett om man kom dit med bilen eller via projektlistan (P): den som
// läser listan har sett projekten lika mycket.
import { PROJECTS } from './projects.js';

const STORAGE_KEY = 'portfolio-stamps';
const CV_URL = 'assets/cv/Filip_Renemark_CV.pdf';
const MAIL = 'filip@renemark.me';
const TOAST_MS = 5000; // Hur länge "stämpel"-meddelandet står kvar.

// Namnet på en värld i meddelandena (hemvärlden heter "Featured" i projektlistan).
function worldLabel(world) {
  return world && world.title === 'Home' ? 'featured' : (world && world.title) || 'this';
}

// Nyckeln för ett projekt: filnamnet på textfilen (stabilt även om titeln putsas om).
// Saknas content används titeln.
export function idOf(project) {
  const match = /([^/]+?)\.html$/i.exec(project.content || '');
  return match ? match[1] : project.title;
}

const ALL = PROJECTS.map((project) => ({ id: idOf(project), title: project.title, world: project.world }));
const VALID = new Set(ALL.map((entry) => entry.id));
// Slår upp en titel, ett id eller ett projektobjekt till ett id. null = okänt (t.ex. "About me").
function resolve(what) {
  if (!what) return null;
  if (typeof what === 'object') what = idOf(what);
  if (VALID.has(what)) return what;
  const byTitle = ALL.find((entry) => entry.title === what);
  return byTitle ? byTitle.id : null;
}

// ---------------------------------------------------------------------------
// LAGRING – localStorage kan vara spärrat (privat läge), då hålls allt bara i minnet.
// ---------------------------------------------------------------------------
const visited = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved && Array.isArray(saved.ids)) for (const id of saved.ids) if (VALID.has(id)) visited.add(id);
} catch (error) { /* Spärrat eller trasigt: börja om. */ }

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, ids: [...visited] })); } catch (error) { /* Samma sak. */ }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
const listeners = new Set();
// callback(id) körs när en ny stämpel tillkommit (id = projektets nyckel), eller med null vid reset().
export function onChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function total() { return ALL.length; }
export function count() { return visited.size; }
export function isVisited(what) { return visited.has(resolve(what)); }
export function visitedIds() { return [...visited]; }

// Stämplar ett projekt (titel, id eller projektobjekt). Returnerar true bara om det var NYTT.
export function visit(what) {
  const id = resolve(what);
  if (!id || visited.has(id)) return false;
  visited.add(id);
  save();
  announce(id);
  for (const callback of listeners) callback(id);
  return true;
}

export function reset() {
  visited.clear();
  try { localStorage.removeItem(STORAGE_KEY); } catch (error) { /* Spärrat. */ }
  pending = null;
  hideToast();
  render(false);
  for (const callback of listeners) callback(null);
}

// ---------------------------------------------------------------------------
// HUD – en liten ruta bredvid "All projects"-knappen uppe till höger, plus ett meddelande.
// ---------------------------------------------------------------------------
let counterElement = null;
let counterText = null;
let toast = null;
let toastText = null;
let toastLinks = null;
let toastTimer = 0;
let pending = null; // Nästa meddelande som väntar på att få visas: { text, final }.

function build() {
  counterElement = document.createElement('div');
  counterElement.className = 'stamps';
  counterText = document.createElement('span');
  counterText.className = 'stamps-count';
  counterElement.append(counterText);

  // role="status" = aria-live polite: skärmläsaren läser upp texten när den ändras.
  toast = document.createElement('div');
  toast.className = 'stamps-toast';
  toast.setAttribute('role', 'status');
  toastText = document.createElement('span');
  toastText.className = 'stamps-toast-text';
  toastLinks = document.createElement('span');
  toastLinks.className = 'stamps-toast-links';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'stamps-toast-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '×';
  close.addEventListener('click', hideToast);
  toast.append(toastText, toastLinks, close);
  toast.hidden = true;
  counterElement.append(toast);
  // Raden längst upp (.drive-bar) delar den med "All projects"; finns den inte hamnar räknaren i body.
  const bar = document.getElementById('driveBar');
  if (bar) bar.prepend(counterElement); else document.body.append(counterElement);
  render(false);
}

function render(pop) {
  if (!counterText) return;
  counterText.textContent = `Stamps ${visited.size} / ${ALL.length}`;
  counterElement.setAttribute('aria-label', `${visited.size} of ${ALL.length} projects seen`);
  if (pop) {
    counterElement.classList.remove('pop');
    void counterElement.offsetWidth; // Startar CSS-animationen om från början.
    counterElement.classList.add('pop');
  }
}

// Synlig bara medan man kör: inte på startskärmen, inte bakom infopanelen eller projektlistan.
function canShow() {
  const list = document.body.classList;
  return list.contains('playing') && !list.contains('panel-open') && !list.contains('list-open');
}

function announce(id) {
  render(true);
  const entry = ALL.find((item) => item.id === id);
  let text = `Stamp earned: ${entry.title}`;
  let final = false;
  if (visited.size === ALL.length) {
    final = true;
    text = `That was all ${ALL.length} projects. Thank you for taking the time to look.`;
  } else if (ALL.filter((item) => item.world === entry.world).every((item) => visited.has(item.id))) {
    text += `. All ${worldLabel(entry.world)} projects seen.`;
  }
  pending = { text, final };
  flush();
}

// Visar det väntande meddelandet så fort spelet är i ett läge där det syns.
function flush() {
  if (!pending || !toast || !canShow()) return;
  const { text, final } = pending;
  pending = null;
  clearTimeout(toastTimer);
  toast.hidden = false;
  toast.classList.toggle('final', final);
  toastLinks.replaceChildren();
  if (final) {
    const cv = document.createElement('a');
    cv.href = CV_URL;
    cv.target = '_blank';
    cv.rel = 'noopener';
    cv.textContent = 'CV (PDF)';
    const mail = document.createElement('a');
    mail.href = `mailto:${MAIL}`;
    mail.textContent = MAIL;
    toastLinks.append(cv, mail);
  }
  toastText.textContent = '';
  // Texten sätts strax efter att rutan blivit synlig, annars missar skärmläsaren ändringen.
  setTimeout(() => {
    if (toast.hidden) return; // Hann stängas igen innan texten kom.
    toastText.textContent = text;
    toast.classList.add('show');
  }, 60);
  if (!final) toastTimer = setTimeout(hideToast, TOAST_MS); // Tack-rutan med länkar står kvar tills man stänger den.
}

function hideToast() {
  clearTimeout(toastTimer);
  if (!toast) return;
  toast.classList.remove('show');
  toast.hidden = true;
  toastText.textContent = '';
  toastLinks.replaceChildren();
}

if (typeof document !== 'undefined') {
  build();
  // Panelen/listan öppnas och stängs genom klasser på <body> (ui.js, project-list.js).
  // En observer räcker: den körs bara när klasserna ändras, aldrig per bild.
  new MutationObserver(flush).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}
