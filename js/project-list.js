// ============================================================================
// project-list.js — "All projects": alla projekt i en vanlig lista, för den som
// inte vill köra runt (t.ex. en rekryterare med ont om tid).
// ============================================================================
// Listan fungerar direkt, även medan 3D-världen laddas: den använder bara projektdatan
// (projects.js) och infopanelen (ui.js). Öppnas från startskärmen, med knappen uppe
// till höger i spelet, eller med tangenten P. Stängs med krysset eller Esc.
import { WORLDS } from './core.js';
import { PROJECTS, ABOUT } from './projects.js';
import { openProject, setListOpen, panelOpen } from './ui.js';

const listElement = document.getElementById('projects');
const listBody = document.getElementById('projectsBody');
let isOpen = false;
let jumpToWorld = null; // Funktion från main.js som tar bilen till en värld ("Visit in 3D").

// main.js anmäler här hur man reser till en värld, när spelet är färdigladdat.
export function setWorldJumper(callback) {
  jumpToWorld = callback;
}

// Rubrikerna för varje värld, i den ordning de visas.
const SECTIONS = [
  { world: WORLDS.hub, heading: 'Featured', visit: 'Drive around home' },
  { world: WORLDS.techart, heading: 'Tech Art', visit: 'Visit in 3D' },
  { world: WORLDS.prog, heading: 'Programming', visit: 'Visit in 3D' },
  { world: WORLDS.art, heading: 'Art', visit: 'Visit in 3D' },
];

// Ett kort: en liten bild (eller video) och projektets namn. Klick öppnar infopanelen.
function makeCard(project) {
  const card = document.createElement('button'); // En knapp, så att den går att nå med Tab och Enter.
  card.className = 'project-card';
  card.type = 'button';
  const thumb = document.createElement('div');
  thumb.className = 'project-thumb';
  // Filen laddas först när kortet syns på skärmen (se observer nedan), annars skulle
  // alla 16 klipp hämtas på en gång.
  if (project.media) thumb.dataset.media = project.media;
  const title = document.createElement('span');
  title.className = 'project-title';
  title.textContent = project.title;
  const category = document.createElement('span');
  category.className = 'project-category';
  category.textContent = project.category || '';
  card.append(thumb, title, category);
  card.addEventListener('click', () => openProject(project));
  return card;
}

// Laddar ett korts bild/video när kortet kommer in i bild. IntersectionObserver
// säger till när ett element blir synligt i en rullande ruta.
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const thumb = entry.target;
    const media = thumb.dataset.media;
    if (entry.isIntersecting && media && !thumb.firstChild) {
      if (media.endsWith('.gif')) {
        const image = document.createElement('img');
        image.src = media;
        image.alt = '';
        thumb.append(image);
      } else {
        // Video utan ljud som spelar i en loop, som skärmarna i 3D-världen.
        const video = document.createElement('video');
        video.src = media;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = true;
        thumb.append(video);
      }
    }
    // Spela bara de videor som syns, för att spara på datorn.
    const video = thumb.querySelector('video');
    if (video) {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    }
  }
}, { root: listBody, rootMargin: '200px' });

// Bygg listan en gång.
function build() {
  // "About me" först.
  const aboutSection = document.createElement('section');
  aboutSection.className = 'projects-section';
  const aboutCard = document.createElement('button');
  aboutCard.type = 'button';
  aboutCard.className = 'project-about';
  aboutCard.textContent = 'About me & contact →';
  aboutCard.addEventListener('click', () => openProject(ABOUT));
  aboutSection.append(aboutCard);
  listBody.append(aboutSection);

  for (const section of SECTIONS) {
    const element = document.createElement('section');
    element.className = 'projects-section';
    const head = document.createElement('div');
    head.className = 'projects-section-head';
    const heading = document.createElement('h2');
    heading.textContent = section.heading;
    // Liten färgprick i världens färg, så att man känner igen den från 3D-världen.
    heading.style.setProperty('--accent', section.world.accent);
    const visit = document.createElement('button');
    visit.type = 'button';
    visit.className = 'projects-visit';
    visit.textContent = `${section.visit} →`;
    visit.addEventListener('click', () => {
      if (!jumpToWorld) {
        visit.textContent = 'Still loading…';
        return;
      }
      close();
      jumpToWorld(section.world);
    });
    head.append(heading, visit);
    const grid = document.createElement('div');
    grid.className = 'projects-grid';
    for (const project of PROJECTS) {
      if (project.world !== section.world) continue;
      const card = makeCard(project);
      grid.append(card);
      observer.observe(card.querySelector('.project-thumb'));
    }
    element.append(head, grid);
    listBody.append(element);
  }
}
build();

export function open() {
  if (isOpen) return;
  isOpen = true;
  listElement.hidden = false;
  setListOpen(true);
  listBody.scrollTop = 0;
  document.body.classList.add('list-open');
}
export function close() {
  if (!isOpen) return;
  isOpen = false;
  listElement.hidden = true;
  setListOpen(false);
  document.body.classList.remove('list-open');
  for (const video of listBody.querySelectorAll('video')) video.pause();
}

document.getElementById('projectsClose').addEventListener('click', close);
document.getElementById('introProjects').addEventListener('click', open);
document.getElementById('projectsButton').addEventListener('click', open);
// capture: true = den här lyssnaren körs FÖRE de andra. Då kan Esc först stänga
// infopanelen (om den är öppen ovanpå listan) och först nästa gång själva listan.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' && !e.repeat && !panelOpen) {
    if (isOpen) close();
    else open();
  }
  if (e.code === 'Escape' && isOpen && !panelOpen) close();
}, { capture: true });
