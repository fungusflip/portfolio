// ============================================================================
// ui.js — allt som är HTML ovanpå 3D-scenen: tangentbord och touchknappar,
// guiden nere till vänster, infopanelen och startskärmen.
// ============================================================================

// ---------------------------------------------------------------------------
// TANGENTBORD
// ---------------------------------------------------------------------------
// Webbläsaren säger bara till i ögonblicket en tangent trycks ner eller släpps.
// Vi behöver veta vilka som är nere JUST NU, så vi håller själva reda på det.
// Ett Set är en lista där varje värde bara kan finnas en gång.
export const keys = new Set();

// e.code är tangentens PLATS på tangentbordet ('KeyW'), inte bokstaven som skrivs.
// Då fungerar WASD likadant oavsett språk/layout.
const DRIVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];

window.addEventListener('keydown', (e) => {
  if (!DRIVE_KEYS.includes(e.code)) return; // Inte en körtangent? Gör ingenting.
  if (panelOpen || introOpen) return; // Infopanelen eller startskärmen är öppen: bilen står still.
  e.preventDefault(); // Stoppar webbläsarens egna beteende, t.ex. att pilarna scrollar sidan.
  keys.add(e.code);
});
// När tangenten släpps tas den bort ur listan.
window.addEventListener('keyup', (e) => keys.delete(e.code));
// 'blur' = fönstret tappar fokus (t.ex. man byter flik). Då kommer aldrig något
// 'keyup', så vi tömmer listan – annars fortsätter bilen köra av sig själv.
window.addEventListener('blur', () => keys.clear());

// ---------------------------------------------------------------------------
// TOUCHKNAPPAR – mobilens version av tangentbordet.
// ---------------------------------------------------------------------------
// Varje knapp (se index.html) lägger in sin tangent i samma lista `keys` som
// tangentbordet använder. Då behöver bilen ingenting veta om touch.
for (const button of document.querySelectorAll('.touch-btn')) {
  const code = button.dataset.key; // data-key="KeyW" i HTML blir button.dataset.key här.
  const press = (e) => {
    e.preventDefault();
    if (panelOpen || introOpen) return;
    // Fingret "fastnar" på knappen även om det glider utanför den, så man släpper aldrig av misstag.
    button.setPointerCapture(e.pointerId);
    keys.add(code);
    button.classList.add('pressed'); // CSS ger den nedtryckta knappen en annan färg.
  };
  const release = () => {
    keys.delete(code);
    button.classList.remove('pressed');
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release); // Systemet avbröt touchen (t.ex. en notis).
}

// ---------------------------------------------------------------------------
// GUIDEN OCH "VAR STÅR BILEN?"
// ---------------------------------------------------------------------------
// Skyltarna och garaget säger till med setParkedAt när bilen kör in i eller ut ur
// deras parkeringsficka. Då vet guiden vad den ska visa, och Enter vad den ska öppna.
// info = ett projekt (eller "About me"), eller null när bilen inte står någonstans.
const guideEnter = document.getElementById('guideEnter');
const guideText = document.getElementById('guideText');
const touchAction = document.getElementById('touchAction'); // Mobilens "Read more"-knapp.
let parkedAt = null;

export function setParkedAt(info) {
  parkedAt = info;
  if (info && info.content) {
    guideText.textContent = `Read more: ${info.title}`; // textContent = elementets text.
    guideEnter.hidden = false;
    touchAction.textContent = 'Read more'; // Kort text: titeln syns redan på skylten.
    touchAction.hidden = false;
  } else {
    guideEnter.hidden = true;
    touchAction.hidden = true;
  }
  // Kör bilen därifrån stängs panelen för det stället.
  if (panelOpen && panelProject !== info) closePanel();
}

// ---------------------------------------------------------------------------
// INFOPANELEN – en ruta till vänster med projektets text, bilder och videor.
// ---------------------------------------------------------------------------
// Enter eller Tab på en parkeringsruta öppnar den. Esc, Enter, Tab eller krysset stänger.
// Medan den är öppen står bilen still, så piltangenterna kan rulla texten i stället.
const panel = document.getElementById('panel');
const panelCategory = document.getElementById('panelCategory');
const panelTitle = document.getElementById('panelTitle');
const panelBody = document.getElementById('panelBody');
const panelLink = document.getElementById('panelLink');
export let panelOpen = false;
let panelProject = null; // Vilket projekt panelen visar just nu.

// Hämtade textfiler sparas här, så att varje fil bara hämtas en gång.
const contentCache = new Map();

async function openPanel(project) {
  panelOpen = true;
  panelProject = project;
  keys.clear(); // Släpp alla körtangenter så att bilen inte fortsätter själv.
  panelCategory.textContent = project.category || '';
  panelTitle.textContent = project.title;
  panelBody.textContent = 'Loading…';
  panelBody.scrollTop = 0;
  panelLink.hidden = !project.url;
  if (project.url) panelLink.href = project.url;
  // "a || b" = a om det finns, annars b.
  panelLink.textContent = project.linkText || 'Open the full page →';
  panel.hidden = false;
  document.body.classList.add('panel-open'); // CSS gömmer touchknapparna medan panelen är öppen.

  // fetch hämtar en fil från servern. await väntar tills den är klar.
  if (!contentCache.has(project.content)) {
    try {
      const response = await fetch(project.content);
      contentCache.set(project.content, response.ok ? await response.text() : null);
    } catch (error) {
      contentCache.set(project.content, null);
    }
  }
  // Användaren kan ha stängt panelen eller bytt projekt medan filen hämtades.
  if (panelProject !== project) return;
  const html = contentCache.get(project.content);
  // innerHTML tolkar texten som HTML. Filerna är våra egna, så det är säkert.
  if (html) panelBody.innerHTML = html;
  else panelBody.textContent = 'Could not load the text. Use the link below instead.';
}

export function closePanel() {
  panelOpen = false;
  panelProject = null;
  panel.hidden = true;
  document.body.classList.remove('panel-open');
  panelBody.textContent = ''; // Släpper bilder och videor ur minnet.
  // Tangenter som hölls nedtryckta medan panelen var öppen ska inte styra bilen.
  keys.clear();
}

// Öppnar panelen för stället bilen står vid, eller stänger den om den redan är öppen.
// Används av både tangentbordet (Enter/Tab) och mobilens knapp.
function togglePanel() {
  if (panelOpen) closePanel();
  else if (parkedAt && parkedAt.content) openPanel(parkedAt);
}

document.getElementById('panelClose').addEventListener('click', closePanel);
touchAction.addEventListener('click', togglePanel);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && panelOpen) {
    closePanel();
    return;
  }
  if (e.code !== 'Enter' && e.code !== 'Tab') return;
  if (introOpen) return; // Startskärmen sköter sina egna tangenter (se nedan).
  // Tab flyttar annars fokus mellan knappar och länkar. Vi vill använda den själva.
  e.preventDefault();
  if (e.repeat) return; // Håller man tangenten nere ska panelen inte blinka av och på.
  togglePanel();
});

// ---------------------------------------------------------------------------
// STARTSKÄRMEN – syns från första stund, även medan världen laddas.
// ---------------------------------------------------------------------------
// Den berättar var besökaren har hamnat. Under laddningen visar startknappen hur
// långt det har kommit; när allt är klart blir den "Start driving". Då startar
// knappen (eller valfri tangent) spelet.
const introElement = document.getElementById('intro');
const introStart = document.getElementById('introStart');
const introProgress = document.getElementById('introProgress');
export let introOpen = true; // Medan den är true kan bilen inte köras och Enter öppnar ingen panel.
let ready = false;           // Är världen färdigladdad?
let onStart = null;          // Funktionen som main.js vill ha körd när spelet startar.

// Under laddningen: fraction = 0–1, text = vad som görs just nu.
export function setLoadingProgress(fraction, text) {
  introProgress.style.transform = `scaleX(${fraction})`;
  introStart.textContent = `${text} ${Math.round(fraction * 100)} %`;
}

// Allt är laddat: knappen blir en riktig startknapp. callback körs när man trycker.
export function setReady(callback) {
  ready = true;
  onStart = callback;
  introStart.disabled = false;
  introStart.textContent = 'Start driving';
  document.body.classList.remove('loading'); // CSS: knappen pulserar, tangenttipset syns.
}

function startGame() {
  if (!introOpen || !ready) return; // Inte klar än, eller redan startad.
  introOpen = false;
  keys.clear();
  introElement.classList.add('leaving'); // CSS tonar bort skärmen.
  document.body.classList.remove('intro-open'); // Guiden och touchknapparna kommer fram.
  setTimeout(() => { introElement.hidden = true; }, 700); // Efter toningen (0.6 s): bort helt.
  if (onStart) onStart();
}
introStart.addEventListener('click', startGame);
window.addEventListener('keydown', (e) => {
  if (!introOpen || !ready) return;
  // Kortkommandon (t.ex. Cmd+R för att ladda om) och ensamma Shift/Alt/... ska inte starta.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
  e.preventDefault();
  startGame();
});

// ---------------------------------------------------------------------------
// TONINGEN – hela fönstret tonas till en färg (vid resor och när laddningen är klar).
// ---------------------------------------------------------------------------
const fadeElement = document.getElementById('fade');
// amount = 0 (osynlig) till 1 (helt täckande). color = vilken färg.
export function setFade(amount, color) {
  if (color) fadeElement.style.background = color;
  fadeElement.style.opacity = amount;
}
