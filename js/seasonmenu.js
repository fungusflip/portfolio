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

const pretty = (name) => name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

// Texten i hörnet. Normalt dagens datum + säsongen ("7 October 2026 · Halloween week 1"). Med ?season= eller
// ?date= i adressen visas i stället förhandsvisningen, med en väg tillbaka (första valet i menyn).
function describe(params) {
  const state = getSeasonState();
  const last = state.names.length ? state.names[state.names.length - 1] : '';
  const season = last ? pretty(last) + (last === 'halloween' && state.week ? ' week ' + state.week : '') : 'No season';
  const forced = params.get('season');
  const dated = params.get('date');
  const date = (value) => value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  if (forced) {
    const found = SEASON_CHOICES.find(([, value]) => value === forced);
    return { preview: true, main: 'Preview: ' + (found ? found[0] : pretty(forced)), hint: 'Back to today, or try another' };
  }
  if (dated) return { preview: true, main: 'Preview: ' + date(state.date) + ' · ' + season, hint: 'Back to today, or try another' };
  return { preview: false, main: date(new Date()) + ' · ' + season, hint: 'Want to try another season?' };
}

// Adressen för ett val: samma sida, samma övriga parametrar, samma #hash.
function urlFor(value) {
  const url = new URL(location.href);
  url.searchParams.delete('date');
  if (value === null) url.searchParams.delete('season');
  else url.searchParams.set('season', value);
  return url.pathname + url.search + url.hash; // Relativt: ingen värd inbakad.
}

let menuCount = 0;
// Bygger knappen + menyn. variant: '' (rubriken) eller 'game' (flytande medan man kör).
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
  const main = document.createElement('span');
  main.className = 'season-btn-main';
  main.textContent = info.main;
  const hint = document.createElement('span');
  hint.className = 'season-btn-hint';
  hint.textContent = info.hint;
  button.append(main, hint);
  if (info.preview) wrap.classList.add('season-switch--preview');

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
