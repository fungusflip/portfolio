// ============================================================================
// seasonmenu.js — knappen "Season" med en liten meny där man kan prova alla säsongslooks.
// ============================================================================
// Används av site/js/site.js (i rubriken på båda sidorna, och som flytande knapp medan man kör).
// Valet lever bara i adressen: ?season=NAMN (eller inget alls för "Today"). Sidan laddas om med samma
// adress i övrigt (andra parametrar och #hash behålls), så det funkar på alla kopior (relativa adresser).
// Tangentbord: Enter/Space öppnar, pil upp/ned flyttar, Esc stänger. Tangenterna stoppas här så att
// spelet (js/ui.js) inte tolkar dem som körning eller "Back to site".
import { getSeasonState } from './season.js';

// [etikett, värdet i ?season= (null = ingen parameter, alltså datumet gäller)]
export const SEASON_CHOICES = [
  ['Today (auto)', null],
  ['Halloween', 'halloween'],
  ['Halloween night', 'halloween-night'],
  ['Winter', 'winter'],
  ['Winter night', 'winter-night'],
  ['Spring', 'spring'],
  ['Rainy spring', 'rainy-spring'],
  ['Summer', 'summer'],
  ['Autumn', 'autumn'],
  ['Christmas Eve', 'christmas-eve'],
  ['Midsummer', 'midsummer'],
  ['Off', 'off'],
];

// Små SVG-symboler (fasta strängar, inga användardata): en per säsong. Används av knappen här och av rubriken i site.js.
const SVG_HEAD = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"';
export const BADGES = {
  pumpkin: SVG_HEAD + '><path d="M12 5c.4-1.6 1.2-2.4 2.4-2.8" fill="none" stroke="#6b8a35" stroke-width="2" stroke-linecap="round"/><path d="M12 6C6 4 2 8 2 13s4 8 10 8 10-3 10-8-4-9-10-7z" fill="#f48c06"/><path d="M12 6c-2 2-2 13 0 15M12 6c2 2 2 13 0 15" fill="none" stroke="#c4410f" stroke-width="1.2"/><path d="M8 11l2 2H6zM16 11l2 2h-4zM8 16h8l-1 2h-2l-1-1-1 1H9z" fill="#2a1838"/></svg>',
  snowflake: SVG_HEAD + ' fill="none" stroke="#cfe0ff" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/></svg>',
  flower: SVG_HEAD + '><g fill="#ffc4d8"><circle cx="12" cy="6" r="4"/><circle cx="18" cy="11" r="4"/><circle cx="15.5" cy="18" r="4"/><circle cx="8.5" cy="18" r="4"/><circle cx="6" cy="11" r="4"/></g><circle cx="12" cy="12.5" r="3" fill="#ffd24a"/></svg>',
  sun: SVG_HEAD + ' fill="none" stroke="#ffc24a" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5" fill="#ffc24a"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
  star: SVG_HEAD + '><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7L2 9.2l7.1-.6z" fill="#ffd24a"/></svg>',
  leaf: SVG_HEAD + '><path d="M20 3C9 3 4 9 4 15c0 1.6.4 3 1 4 1 .6 2.2 1 3.6 1C15 20 20 15 20 3z" fill="#e8741f"/><path d="M4.5 20C8 14 12 10 17 7" fill="none" stroke="#7a2a08" stroke-width="1.4" stroke-linecap="round"/></svg>',
};

const pretty = (name) => name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

// Texten i hörnet. Normalt dagens datum + säsongen ("7 October 2026 · Halloween week 1"). Med ?season= eller
// ?date= i adressen visas i stället förhandsvisningen, med en väg tillbaka (första valet i menyn).
function describe(params) {
  const state = getSeasonState();
  const last = state.names.length ? state.names[state.names.length - 1] : '';
  const season = last ? pretty(last) + (last === 'halloween' && state.week ? ' week ' + state.week : '') : 'No season';
  const forced = params.get('season');
  const dated = params.get('date');
  const date = (value) => value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (forced) {
    const found = SEASON_CHOICES.find(([, value]) => value === forced);
    return { preview: true, main: 'Preview: ' + (found ? found[0] : pretty(forced)), hint: 'Back to today, or try another' };
  }
  if (dated) return { preview: true, main: 'Preview: ' + date(state.date) + ' · ' + season, hint: 'Back to today, or try another' };
  return { preview: false, main: date(new Date()) + ' · ' + season, hint: 'Change season' };
}

// Adressen för ett val: samma sida, samma övriga parametrar, samma #hash.
function urlFor(value) {
  const url = new URL(location.href);
  url.searchParams.delete('date');
  if (value === null) url.searchParams.delete('season');
  else url.searchParams.set('season', value);
  return url.pathname + url.search + url.hash; // Relativt: ingen värd inbakad.
}

// Första besöket i den här fliken: knapparna pulserar ett par gånger så att man ser dem (båda knapparna, rubrikens och spelets).
let nudge = false;
try {
  if (!sessionStorage.getItem('seasonNudged')) { sessionStorage.setItem('seasonNudged', '1'); nudge = true; }
} catch (error) { /* sessionStorage spärrat: ingen puls */ }
let menuCount = 0;
// Bygger knappen + menyn. variant: 'header' (i rubriken) eller 'game' (flytande medan man kör).
export function createSeasonMenu(variant = '') {
  const id = 'seasonMenu' + ++menuCount;
  const params = new URLSearchParams(location.search);
  const wrap = document.createElement('div');
  wrap.className = 'season-switch' + (variant ? ' season-switch--' + variant : '');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'season-btn';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', id);
  const info = describe(params);
  const glyph = document.createElement('span');
  glyph.className = 'season-btn-glyph';
  const badge = (getSeasonState().config.site || {}).badge;
  glyph.innerHTML = BADGES[badge] || BADGES.leaf; // Fasta SVG-strängar ovan.
  const text = document.createElement('span');
  text.className = 'season-btn-text';
  const main = document.createElement('span');
  main.className = 'season-btn-main';
  main.textContent = info.main;
  const hint = document.createElement('span');
  hint.className = 'season-btn-hint';
  hint.textContent = info.hint;
  text.append(main, hint);
  button.title = 'Change season';
  button.setAttribute('aria-label', 'Change season. ' + info.main);
  button.append(glyph, text);
  if (info.preview) wrap.classList.add('season-switch--preview');
  if (nudge) wrap.classList.add('season-switch--nudge');

  const menu = document.createElement('ul');
  menu.className = 'season-menu';
  menu.id = id;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Preview a season');
  menu.hidden = true;
  const forced = params.get('season');
  const items = SEASON_CHOICES.map(([text, value]) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'none');
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'season-item';
    item.textContent = value === null && info.preview ? 'Back to today' : text;
    item.setAttribute('role', 'menuitemradio');
    const checked = value === null ? !forced : value === forced;
    item.setAttribute('aria-checked', String(checked));
    item.addEventListener('click', () => {
      if (checked) { close(true); return; }
      location.assign(urlFor(value));
    });
    li.append(item);
    menu.append(li);
    return item;
  });

  function open() {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    (items.find((i) => i.getAttribute('aria-checked') === 'true') || items[0]).focus();
  }
  function close(refocus) {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  }
  button.addEventListener('click', () => (menu.hidden ? open() : close(false)));
  document.addEventListener('pointerdown', (event) => { if (!wrap.contains(event.target)) close(false); });
  wrap.addEventListener('keydown', (event) => {
    event.stopPropagation(); // Spelet ska inte se tangenterna härifrån.
    if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); close(true); return; }
    if (event.key === 'ArrowDown' && menu.hidden && event.target === button) { event.preventDefault(); open(); return; }
    if (menu.hidden || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End')) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement);
    let next = at;
    if (event.key === 'ArrowDown') next = (at + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (at - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else next = items.length - 1;
    items[next].focus();
  });
  wrap.addEventListener('keyup', (event) => event.stopPropagation());
  wrap.addEventListener('focusout', (event) => { if (!wrap.contains(event.relatedTarget)) close(false); });

  wrap.append(button, menu);
  return wrap;
}
