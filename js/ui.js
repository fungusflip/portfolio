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
const DRIVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'];

window.addEventListener('keydown', (e) => {
  if (!DRIVE_KEYS.includes(e.code)) return; // Inte en körtangent? Gör ingenting.
  if (panelOpen || introOpen || listOpen) return; // Panelen, startskärmen eller projektlistan är öppen: bilen står still.
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
    if (panelOpen || introOpen || listOpen) return;
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
const touchAction = document.getElementById('touchAction'); // Mobilens "Read more"-knapp.
const parkPrompt = document.getElementById('parkPrompt');           // Den stora uppmaningen nere i mitten.
const parkPromptTitle = document.getElementById('parkPromptTitle');
let parkedAt = null;

export function setParkedAt(info) {
  parkedAt = info;
  if (info && info.content) {
    touchAction.textContent = 'Read more'; // Kort text: titeln syns redan på skylten.
    touchAction.hidden = false;
    parkPromptTitle.textContent = info.title;
    parkPrompt.hidden = false;
  } else {
    touchAction.hidden = true;
    parkPrompt.hidden = true;
  }
  // Kör bilen därifrån stängs panelen för det stället.
  if (panelOpen && panelProject !== info) closePanel();
}
// Bilen har lämnat fickan för info. Glöm den bara om det fortfarande är den guiden visar
// (har bilen redan hunnit parkera någon annanstans ska det nya stället vara kvar).
export function leaveParking(info) {
  if (parkedAt === info) setParkedAt(null);
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
  closeLightbox();
  videoObserver.disconnect(); // Byter man projekt direkt ska gamla videor och rullningslyssnare bort.
  panelBody.onscroll = null;
  panelBody.classList.remove('has-toc');
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
  // Filerna är våra egna, så det är säkert att tolka dem som HTML. Vi tolkar dem i en <template>
  // (inget hämtas där) så att vi hinner sätta loading="lazy" innan webbläsaren börjar ladda bilderna.
  if (html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    prepareContent(template.content);
    panelBody.replaceChildren(template.content);
    panelBody.scrollTop = 0;
    buildToc();
    watchVideos();
  } else {
    panelBody.textContent = 'Could not load the text. Use the link below instead.';
  }
}

// ---------------------------------------------------------------------------
// PROJEKTSIDORNAS HJÄLPARE – innehållsförteckning, bildvisare och videor.
// ---------------------------------------------------------------------------
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

// Lat laddning: bilder utanför bild hämtas först när man scrollar dit, videor hämtar bara metadata.
function prepareContent(root) {
  for (const img of root.querySelectorAll('img')) {
    img.loading = 'lazy';
    img.decoding = 'async';
  }
  for (const video of root.querySelectorAll('video')) {
    video.preload = 'metadata';
    // Videor med kontroller kan inte öppnas med ett klick (klicket spelar/pausar), så de får en knapp.
    const figure = video.closest('figure');
    if (video.controls && figure) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'zoom-btn';
      button.setAttribute('aria-label', 'Enlarge video');
      button.textContent = '⛶';
      figure.append(button);
    }
  }
}

// "On this page": en klistrig rad med knappar, byggd av sidans h2:or. Göms om det är färre än 3.
function buildToc() {
  const headings = [...panelBody.querySelectorAll(':scope > h2')];
  if (headings.length < 3) return;
  const toc = document.createElement('nav');
  toc.className = 'toc';
  toc.setAttribute('aria-label', 'On this page');
  const label = document.createElement('span');
  label.className = 'toc-label';
  label.textContent = 'On this page';
  toc.append(label);
  const buttons = headings.map((heading) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = heading.textContent;
    button.addEventListener('click', () => {
      // Räknar ut var rubriken ligger inuti den rullande rutan (scrollIntoView kan rulla hela sidan).
      const top = heading.getBoundingClientRect().top - panelBody.getBoundingClientRect().top
        + panelBody.scrollTop - toc.offsetHeight - 6;
      panelBody.scrollTo({ top, behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth' });
    });
    toc.append(button);
    return button;
  });
  panelBody.classList.add('has-toc');
  headings[0].before(toc);

  // Markerar den rubrik man läser just nu. Rör bara DOM:en när det faktiskt byter.
  let current = -1;
  let queued = false;
  const update = () => {
    queued = false;
    const line = panelBody.getBoundingClientRect().top + toc.offsetHeight + 40;
    let index = -1;
    headings.forEach((heading, i) => { if (heading.getBoundingClientRect().top <= line) index = i; });
    if (index === current) return;
    current = index;
    buttons.forEach((button, i) => button.classList.toggle('active', i === index));
    if (index >= 0) { // Håll den aktiva knappen synlig när raden rullar i sidled (mobil).
      toc.scrollTo({ left: buttons[index].offsetLeft - toc.clientWidth / 3, behavior: 'auto' });
    }
  };
  panelBody.onscroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  update();
}

// Videor som loopar och är ljudlösa (små "gif-klipp") spelar bara medan de syns. Annars pausas de.
// Har man själv pausat en video lämnar vi den ifred.
const videoObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const video = entry.target;
    if (entry.isIntersecting) {
      if (!video.dataset.userPaused && !REDUCED_MOTION.matches && !(lightbox && !lightbox.hidden)) {
        video.play().catch(() => {}); // Webbläsaren kan neka autoplay; då gör vi inget.
      }
    } else if (!video.paused) {
      video.dataset.autoPause = '1';
      video.pause();
    }
  }
}, { threshold: 0.35 });

function watchVideos() {
  for (const video of panelBody.querySelectorAll('video')) {
    if (!video.loop || !video.muted) continue;
    video.addEventListener('pause', () => {
      if (video.dataset.autoPause) delete video.dataset.autoPause;
      else video.dataset.userPaused = '1';
    });
    video.addEventListener('play', () => { delete video.dataset.userPaused; });
    videoObserver.observe(video);
  }
}

// Bildvisaren: bild eller video i helskärm över panelen.
let lightbox = null;
let lightboxStage = null;
let lightboxReturnFocus = null;

function ensureLightbox() {
  if (lightbox) return;
  lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.hidden = true;
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightboxStage = document.createElement('div');
  lightboxStage.className = 'lightbox-stage';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lightbox-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  lightbox.append(lightboxStage, close);
  // Klick utanför mediet (eller på krysset) stänger. Klick på själva mediet gör inget (videons kontroller).
  lightbox.addEventListener('click', (e) => { if (e.target !== lightboxStage.firstChild) closeLightbox(); });
  document.body.append(lightbox);
}

function openLightbox(source) {
  ensureLightbox();
  lightboxReturnFocus = document.activeElement;
  let media;
  if (source.tagName === 'VIDEO') {
    media = document.createElement('video');
    media.src = source.currentSrc || source.src;
    media.controls = true;
    media.loop = source.loop;
    media.muted = source.muted;
    media.playsInline = true;
    media.autoplay = true;
    media.addEventListener('loadedmetadata', () => { media.currentTime = source.currentTime || 0; }, { once: true });
    if (!source.paused) { source.dataset.autoPause = '1'; source.pause(); } // Originalet vilar under tiden.
  } else {
    media = document.createElement('img');
    media.src = source.currentSrc || source.src;
    media.alt = source.alt || '';
  }
  lightboxStage.replaceChildren(media);
  lightbox.hidden = false;
  lightbox.querySelector('.lightbox-close').focus({ preventScroll: true });
}

function closeLightbox() {
  if (!lightbox || lightbox.hidden) return;
  lightbox.hidden = true;
  lightboxStage.replaceChildren(); // Stoppar videon och släpper minnet.
  if (lightboxReturnFocus && document.contains(lightboxReturnFocus)) lightboxReturnFocus.focus({ preventScroll: true });
  lightboxReturnFocus = null;
  // Videor som syns i panelen får återuppta sitt spelande (observern ger ett nytt besked vid observe).
  for (const video of panelBody.querySelectorAll('video')) {
    if (video.loop && video.muted) { videoObserver.unobserve(video); videoObserver.observe(video); }
  }
}

panelBody.addEventListener('click', (e) => {
  const target = e.target;
  if (target.closest('a')) return; // Bilder som är länkar ska följa länken.
  if (target.classList.contains('zoom-btn')) {
    const video = target.closest('figure').querySelector('video');
    if (video) openLightbox(video);
  } else if (target.tagName === 'IMG') {
    openLightbox(target);
  } else if (target.tagName === 'VIDEO' && !target.controls) {
    openLightbox(target);
  }
});

export function closePanel() {
  panelOpen = false;
  panelProject = null;
  panel.hidden = true;
  document.body.classList.remove('panel-open');
  closeLightbox();
  videoObserver.disconnect();
  panelBody.onscroll = null;
  panelBody.classList.remove('has-toc');
  panelBody.textContent = ''; // Släpper bilder och videor ur minnet.
  // Tangenter som hölls nedtryckta medan panelen var öppen ska inte styra bilen.
  keys.clear();
}

// Öppnar panelen för ett visst projekt (används av projektlistan, se project-list.js).
export function openProject(project) {
  openPanel(project);
}

// Projektlistan: medan den är öppen står bilen still och Enter öppnar inget.
export let listOpen = false;
export function setListOpen(open) {
  listOpen = open;
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
parkPrompt.addEventListener('click', () => {
  togglePanel();
  parkPrompt.blur(); // Släpp fokus, annars "klickar" Enter på knappen också och panelen stängs direkt igen.
});

// Flyttar uppmaningen till en punkt på skärmen (i pixlar), eller tillbaka till nere i mitten (null).
// Anropas varje bild: rör bara DOM:en när något faktiskt ändrats.
let promptAnchored = false;
let promptLeft = '';
let promptTop = '';
export function placeParkPrompt(spot) {
  if (spot) {
    const left = `${spot.x}px`;
    const top = `${spot.y}px`;
    if (!promptAnchored) { parkPrompt.classList.add('anchored'); promptAnchored = true; }
    if (left !== promptLeft) { parkPrompt.style.left = left; promptLeft = left; }
    if (top !== promptTop) { parkPrompt.style.top = top; promptTop = top; }
  } else if (promptAnchored || promptLeft || promptTop) {
    parkPrompt.classList.remove('anchored');
    parkPrompt.style.left = '';
    parkPrompt.style.top = '';
    promptAnchored = false; promptLeft = ''; promptTop = '';
  }
}
// Medan bildvisaren är öppen tar den Esc (och sväljer Enter/Tab) FÖRE alla andra lyssnare.
// Capture-fasen på window körs först, så panelen och projektlistan märker aldrig tangenten.
window.addEventListener('keydown', (e) => {
  if (!lightbox || lightbox.hidden) return;
  if (e.code === 'Escape') closeLightbox();
  else if (e.code !== 'Enter' && e.code !== 'Tab') return; // Övriga tangenter (t.ex. mellanslag på en video) får passera.
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && panelOpen) {
    closePanel();
    return;
  }
  // Esc när inget annat är öppet: tillbaka till webbplatsen. (Projektlistan har redan tagit
  // sitt Esc och satt defaultPrevented, se project-list.js.)
  if (e.code === 'Escape' && !e.repeat && !e.defaultPrevented && !introOpen && !listOpen && hasStarted) {
    backToSite();
    return;
  }
  if (e.code !== 'Enter' && e.code !== 'Tab') return;
  if (introOpen || listOpen) return; // Startskärmen och projektlistan sköter sina egna tangenter.
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
let hasStarted = false;      // Har spelet startats minst en gång? ("Back to site" och sedan "Resume driving".)
let introHideTimer = 0;

// Under laddningen: fraction = 0–1, text = vad som görs just nu.
export function setLoadingProgress(fraction, text) {
  introProgress.style.transform = `scaleX(${fraction})`;
  introStart.textContent = `${text} ${Math.round(fraction * 100)} %`;
}

// Allt är laddat: knappen blir en riktig startknapp. callback körs när man trycker.
// label = knappens text (t.ex. "Start in Art" när adressen leder till en viss värld).
export function setReady(callback, label = 'Start driving') {
  ready = true;
  onStart = callback;
  introStart.disabled = false;
  introStart.textContent = label;
  document.body.classList.remove('loading'); // CSS: knappen pulserar, tangenttipset syns.
}

// Startar spelet från koden (t.ex. när man väljer "Visit in 3D" i projektlistan).
// Returnerar false om världen inte är färdigladdad än.
// Returnerar true bara om det här var den FÖRSTA starten (då kör onStart i main.js, som
// också tar hand om en värld man valt). Var spelet redan igång, eller återupptas det efter
// "Back to site", returnerar den false: anroparen får då resa dit direkt.
export function startFromCode() {
  if (!ready) return false;
  const first = introOpen && !hasStarted;
  startGame();
  return first;
}

function startGame() {
  if (!introOpen || !ready) return; // Inte klar än, eller redan startad.
  introOpen = false;
  keys.clear();
  clearTimeout(introHideTimer);
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); // Spelet ligger högst upp på sidan.
  document.body.classList.add('playing'); // CSS: sidan går inte att scrolla, webbplatsen göms.
  introElement.classList.add('leaving'); // CSS tonar bort skärmen.
  document.body.classList.remove('intro-open'); // Guiden och touchknapparna kommer fram.
  introHideTimer = setTimeout(() => { introElement.hidden = true; measureHero(); }, 700); // Efter toningen (0.6 s): bort helt.
  measureHero();
  if (onStart && !hasStarted) onStart(); // Första gången: bilen backar ut. Vid "Resume driving" står den kvar.
  hasStarted = true;
}
introStart.addEventListener('click', startGame);

// Tillbaka till webbplatsen: spelet pausas (se canvasVisible) och startskärmen visas igen.
export function backToSite() {
  if (introOpen || !hasStarted) return;
  closePanel();
  introOpen = true;
  keys.clear();
  clearTimeout(introHideTimer);
  document.body.classList.remove('playing');
  document.body.classList.add('intro-open');
  introElement.hidden = false;
  introElement.classList.remove('leaving');
  introStart.textContent = 'Resume driving';
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  measureHero();
}
document.getElementById('backButton').addEventListener('click', (e) => {
  backToSite();
  e.currentTarget.blur(); // Annars kan Space "klicka" den igen.
});

// "Drive my portfolio" på webbplatsen (alla länkar/knappar med data-drive). Är världen inte
// klar än scrollar vi bara upp till startskärmen, där laddningen syns.
export function driveFromSite() {
  if (!ready) window.scrollTo({ top: 0, behavior: 'smooth' });
  else startGame();
}
for (const element of document.querySelectorAll('[data-drive]')) {
  element.addEventListener('click', (e) => {
    e.preventDefault();
    driveFromSite();
  });
}

// Tangenter som scrollar sidan eller flyttar fokus: de startar aldrig spelet, så att man kan
// rulla ner på webbplatsen medan startskärmen är öppen.
const SCROLL_CODES = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Tab'];
window.addEventListener('keydown', (e) => {
  if (!introOpen || !ready || listOpen) return;
  // Kortkommandon (t.ex. Cmd+R för att ladda om) och ensamma Shift/Alt/... ska inte starta.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
  if (SCROLL_CODES.includes(e.code)) return;
  if (e.code === 'KeyP') return; // P öppnar projektlistan i stället (se project-list.js).
  if (window.scrollY > window.innerHeight * 0.25) return; // Har man scrollat ner läser man webbplatsen.
  // Fokus på en länk/knapp/ruta (t.ex. Enter i menyn eller i projektdialogen): låt den sköta tangenten.
  if (e.target !== document.body && e.target !== document.documentElement) return;
  if (document.querySelector('dialog[open]')) return;
  e.preventDefault();
  startGame();
});

// Är spelet synligt just nu? När startskärmen är uppe och man scrollat förbi den ritas
// ingenting (se main.js), så att grafikkortet vilar.
export let canvasVisible = true;
let heroHeight = window.innerHeight;
function measureHero() {
  heroHeight = introElement.offsetHeight || window.innerHeight;
  updateCanvasVisible();
}
function updateCanvasVisible() {
  canvasVisible = !introOpen || window.scrollY < heroHeight;
}
window.addEventListener('scroll', updateCanvasVisible, { passive: true });
window.addEventListener('resize', measureHero);
measureHero();

// ---------------------------------------------------------------------------
// TONINGEN – hela fönstret tonas till en färg (vid resor och när laddningen är klar).
// ---------------------------------------------------------------------------
const fadeElement = document.getElementById('fade');
// amount = 0 (osynlig) till 1 (helt täckande). color = vilken färg.
export function setFade(amount, color) {
  if (color) fadeElement.style.background = color;
  fadeElement.style.opacity = amount;
}
