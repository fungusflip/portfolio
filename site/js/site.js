// Den vanliga portfolion: grid, filter, förhandsvideo, projektdialog, reveal.
import { PROJECTS } from './projects-data.js';

const $ = (s, r = document) => r.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = !!(navigator.connection && navigator.connection.saveData);
const canHover = matchMedia('(hover: hover)').matches;
// Ingen förhandsvideo om användaren ber om mindre rörelse eller data.
const allowPreview = !reduceMotion && !saveData;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

// ---------- Grid ----------
const grid = $('#grid');
const cards = PROJECTS.map(p => {
  const li = el('li', 'card reveal' + (p.phone ? ' phone' : ''));
  li.dataset.category = p.category;
  const btn = el('button', 'card-open');
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'dialog');

  const media = el('span', 'card-media');
  const posterSrc = p.poster || p.still;
  if (posterSrc) {
    const img = el('img');
    img.src = posterSrc;
    img.alt = ''; // Titeln står i knappen; bilden är dekor.
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 640; img.height = 400;
    media.append(img);
  }
  if (p.featured) media.append(el('span', 'badge', 'Featured'));
  if (p.freelance) { const s = el('span', 'badge star', '★ Freelance'); media.append(s); }
  if (p.video && allowPreview) media.append(el('span', 'play-hint'));

  const text = el('span', 'card-text');
  text.append(el('span', 'card-cat', p.category), el('span', 'card-title', p.title));
  const tags = el('span', 'tags tags-sm');
  p.tags.slice(0, 3).forEach(t => tags.append(el('span', 'tag', t)));
  text.append(tags);

  btn.append(media, text);
  li.append(btn);
  grid.append(li);

  if (p.video && allowPreview) attachPreview(btn, media, p.video, posterSrc);
  btn.addEventListener('click', () => openProject(p, btn));
  return { p, li };
});

// Videon skapas först vid hover/fokus, så inget laddas i förväg.
function attachPreview(btn, media, src, poster) {
  let video = null;
  const start = () => {
    if (!video) {
      video = el('video');
      video.muted = true; video.loop = true; video.playsInline = true;
      video.preload = 'none';
      video.setAttribute('aria-hidden', 'true');
      video.tabIndex = -1;
      if (poster) video.poster = poster;
      video.src = src;
      video.addEventListener('playing', () => video.classList.add('on'));
      media.insertBefore(video, media.querySelector('.badge, .play-hint'));
    }
    const pr = video.play();
    if (pr) pr.catch(() => {});
  };
  const stop = () => { if (video) { video.pause(); video.classList.remove('on'); } };
  if (canHover) {
    btn.addEventListener('pointerenter', start);
    btn.addEventListener('pointerleave', stop);
  }
  btn.addEventListener('focus', () => { if (btn.matches(':focus-visible')) start(); });
  btn.addEventListener('blur', stop);
}

// ---------- Filter ----------
const chips = [...document.querySelectorAll('.chip')];
const status = $('#filterStatus');
function applyFilter(f) {
  let n = 0;
  cards.forEach(({ p, li }) => {
    const show = f === 'all' || p.category === f;
    li.hidden = !show;
    if (show) { n++; li.classList.add('in'); }
  });
  chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.filter === f)));
  status.textContent = `${n} project${n === 1 ? '' : 's'} shown`;
}
chips.forEach(c => c.addEventListener('click', () => applyFilter(c.dataset.filter)));

// ---------- Projektdialog ----------
const dlg = $('#projectDialog');
let lastFocus = null;
async function openProject(p, opener, fromHash) {
  lastFocus = opener || null;
  dlg.dataset.id = p.id;
  $('#dlgCat').textContent = p.category + (p.freelance ? ' · ★ Freelance' : '');
  $('#dlgTitle').textContent = p.title;
  const tags = $('#dlgTags'); tags.replaceChildren();
  p.tags.forEach(t => tags.append(el('li', '', t)));
  const link = $('#dlgLink'); link.href = p.url;
  const body = $('#dlgBody'); body.replaceChildren(el('p', 'dlg-error', 'Loading…'));
  body.scrollTop = 0;
  if (!dlg.open) dlg.showModal();
  if (!fromHash) history.replaceState(null, '', '#project=' + p.id);

  // Huvudbild/-video överst; videon laddas först här, med kontroller.
  const hero = el('figure', 'dlg-hero' + (p.phone ? ' phone' : ''));
  // Bara stillbilden överst: texten under har egna videor, som laddas först när de spelas.
  if (p.poster || p.still) {
    const i = el('img'); i.src = p.still || p.poster; i.alt = p.title + ' preview'; hero.append(i);
  }
  try {
    const res = await fetch(p.content);
    if (!res.ok) throw new Error(res.status);
    const tpl = document.createElement('template');
    tpl.innerHTML = await res.text();
    // Spara data: inga videor/bilder laddas före scroll, och inga autoplay.
    tpl.content.querySelectorAll('video').forEach(v => { v.preload = 'none'; v.removeAttribute('autoplay'); });
    tpl.content.querySelectorAll('img, iframe').forEach(i => { i.loading = 'lazy'; if (!i.hasAttribute('alt') && i.tagName === 'IMG') i.alt = ''; });
    if (dlg.dataset.id !== p.id) return; // Hann bytas/stängas under laddning.
    body.replaceChildren(hero, tpl.content);
  } catch (e) {
    body.replaceChildren(hero, el('p', 'dlg-error', 'Could not load the write-up. Use the button below to open the full page.'));
  }
}
function closeDialog() {
  dlg.querySelectorAll('video').forEach(v => v.pause());
  dlg.close();
}
$('#dlgClose').addEventListener('click', closeDialog);
$('#dlgClose2').addEventListener('click', closeDialog);
// Klick på bakgrunden (utanför kortet) stänger.
dlg.addEventListener('click', e => { if (e.target === dlg) closeDialog(); });
dlg.addEventListener('close', () => {
  dlg.querySelectorAll('video').forEach(v => v.pause());
  if (location.hash.startsWith('#project=')) history.replaceState(null, '', location.pathname + location.search);
  if (lastFocus) lastFocus.focus();
});
function fromHash() {
  const m = location.hash.match(/^#project=([\w-]+)/);
  const p = m && PROJECTS.find(x => x.id === m[1]);
  if (p) openProject(p, null, true);
}

// ---------- Meny (mobil) ----------
const nav = $('#siteNav'), toggle = $('#navToggle');
toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
});
nav.addEventListener('click', e => { if (e.target.closest('a')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
});

// ---------- Reveal + aktiv menylänk ----------
const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !reduceMotion) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  reveals.forEach(r => io.observe(r));
} else reveals.forEach(r => r.classList.add('in'));

if ('IntersectionObserver' in window) {
  const links = new Map([...nav.querySelectorAll('ul a')].map(a => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { links.forEach(a => a.classList.remove('active')); const a = links.get(e.target.id); if (a) a.classList.add('active'); }
  }), { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((a, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
}

// ---------- Höstlöv i hero (billigt: CSS-animation, 12 stycken) ----------
if (!reduceMotion) {
  const box = $('#leaves');
  const colors = ['var(--leaf-1)', 'var(--leaf-2)', 'var(--leaf-3)'];
  for (let i = 0; i < 12; i++) {
    const l = el('span', 'leaf');
    l.style.cssText = `left:${Math.round(Math.random() * 100)}%;--s:${10 + Math.round(Math.random() * 12)}px;--c:${colors[i % 3]};--d:${9 + Math.round(Math.random() * 8)}s;--delay:${-Math.round(Math.random() * 14)}s;--sway:${Math.round(Math.random() * 120 - 60)}px`;
    box.append(l);
  }
}

applyFilter('all');
fromHash();
addEventListener('hashchange', fromHash);
