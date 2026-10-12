// ============================================================================
// projects.js — alla projekt och texten om mig. Bara data, inget 3D – därför kan
// projektlistan (project-list.js) använda den direkt, redan medan världen laddas.
// ============================================================================
import { WORLDS } from './core.js';

// ---------------------------------------------------------------------------
// PROJEKT – listan som bestämmer vilka skyltar som finns. ÄNDRA HÄR.
// ---------------------------------------------------------------------------
// Alla projekt från filip.renemark.se. Texterna i assets/content/ är hämtade från
// sidans egna inlägg, och korta klipp till skärmarna ligger i assets/videos och assets/images.
//   world – vilken värld skylten står i. Skyltarna i en värld ställs på rad i samma
//           ordning som i listan, så ÄNDRA ORDNINGEN här för att flytta dem.
//   title – texten ovanför skärmen.
//   media – .mp4 / .webm = video, .gif = animerad gif, .png / .jpg = stillbild, null = ingen fil.
//           Video är att föredra: mycket mindre filer än gif och lättare för datorn.
//   url   – projektets egen sida. Länkas längst ner i infopanelen.
//   category – liten etikett överst i infopanelen.
//   content  – textfilen (HTML) som visas i infopanelen när man trycker Enter/Tab.
//   phone – true = klippet är filmat på höjden. Skylten blir en jättelik mobiltelefon.
//   linkText – texten på länken i infopanelen. Utelämnad = "Open the full page →".
export const PROJECTS = [
  // --- Hemma: de sex främsta, längs huvudvägen från garaget (vänster) mot Tech Art-grottan (höger). ---
  { world: WORLDS.hub, title: 'Water Shader', media: 'assets/videos/water-shader.mp4', url: 'https://filip.renemark.se/shaders-rendering/project-water-shader', category: 'Shaders · Real-Time Rendering', content: 'assets/content/water-shader.html' },
  { world: WORLDS.hub, title: 'Foliage Generator', media: 'assets/videos/foliage-generator.mp4', url: 'https://filip.renemark.se/misc/folliage-generator', category: 'Houdini · Procedural · Unreal', content: 'assets/content/foliage-generator.html' },
  { world: WORLDS.hub, title: 'AnGame: Procedural Environment', media: 'assets/videos/angame-moon-wall.mp4', url: '', category: 'Houdini · Unreal · Shaders · Post-process', content: 'assets/content/angame-environment.html' },
  { world: WORLDS.hub, title: 'SpookChester: Pixel Art Render', media: 'assets/videos/spookchester.mp4', url: 'https://filip.renemark.se/misc/spookchester-pixelart-render', category: 'Houdini · Procedural · Pipeline', content: 'assets/content/spookchester.html' },
  { world: WORLDS.hub, title: 'Mutation Protocol', media: 'assets/videos/mutation-protocol.mp4', url: 'https://filip.renemark.se/misc/mutation-protocol', category: '★ Freelance · Houdini · Rigging · Animation', content: 'assets/content/mutation-protocol.html', phone: true },
  { world: WORLDS.hub, title: 'Lemon Lagoon', media: 'assets/content-media/lemon-lagoon/kitchen-scene.jpg', url: 'https://fungusflip.itch.io/lemon-lagoon', category: 'Unreal · Game Jam · Animation · Rigging · Tech Art · Cascadeur · C++', content: 'assets/content/lemon-lagoon.html' },

  // --- Tech Art-världen ---
  { world: WORLDS.techart, title: 'VAT Fluid Pipeline', media: 'assets/videos/vat-fluid.mp4', url: 'https://filip.renemark.se/misc/bar-fluid', category: 'Houdini · VAT · VFX · Simulation', content: 'assets/content/vat-fluid.html' },
  { world: WORLDS.techart, title: 'Humanoid Rig', media: 'assets/videos/humanoid-rig.mp4', url: 'https://filip.renemark.se/misc/humanoid-rigg', category: 'Rigging · Animation · Pipeline', content: 'assets/content/humanoid-rig.html' },
  { world: WORLDS.techart, title: 'Spite: Catharsis', media: 'assets/images/spite-rubble.png', url: 'https://filip.renemark.se/misc/spite-catharsis', category: 'VFX · HLSL · Pipeline · Tools', content: 'assets/content/spite-catharsis.html' },
  { world: WORLDS.techart, title: 'Modular Farming Toolkit', media: 'assets/videos/farming-toolkit.mp4', url: 'https://filip.renemark.se/misc/farming-pack', category: 'Environment · Shaders · VFX', content: 'assets/content/farming-toolkit.html' },
  // HIDDEN for now (Filip): BioYield entry kept out of the portfolio. Remove the leading // to show it again.
  // { world: WORLDS.techart, title: 'BioYield: Unreal VFX & Systems', media: 'assets/videos/bioyield.mp4', url: '', category: 'Unreal · Niagara · VFX · Post-process · Houdini', content: 'assets/content/bioyield.html' },
  { world: WORLDS.techart, title: 'Camilla: Procedural Robots', media: 'assets/videos/camilla-robots.mp4', url: 'https://filip.renemark.se/misc/1544', category: '★ Freelance · Houdini · Procedural · VFX', content: 'assets/content/camilla.html' },


  // --- Programming-världen ---
  { world: WORLDS.prog, title: 'Idle Village', media: 'assets/videos/idle-village.mp4', url: 'https://filip.renemark.se/misc/idle-village', category: 'C# · Unity · AI · Tools', content: 'assets/content/idle-village.html', phone: true },
  { world: WORLDS.prog, title: 'Harmonies Ascendent', media: 'assets/videos/harmonies-ascendent.mp4', url: 'https://filip.renemark.se/c-programming-unity/project-harmonies-ascendent-reflection', category: 'C# · Unity · HLSL', content: 'assets/content/harmonies-ascendent.html' },
  { world: WORLDS.prog, title: 'OpenGL Foundation', media: 'assets/videos/opengl-foundation.mp4', url: 'https://filip.renemark.se/shaders-rendering/project-opengl-foundation', category: 'C++ · OpenGL · GLSL', content: 'assets/content/opengl-foundation.html' },

  // --- Art-världen ---
  { world: WORLDS.art, title: 'Cat Jam', media: 'assets/videos/cat-jam.mp4', url: 'https://filip.renemark.se/misc/cat-jam', category: 'Character · Animation', content: 'assets/content/cat-jam.html' },
  { world: WORLDS.art, title: 'Realistic Sword', media: 'assets/videos/sword-turntable.mp4', url: 'https://filip.renemark.se/misc/sword', category: 'Props · Realistic · Textures', content: 'assets/content/realistic-sword.html' },
  { world: WORLDS.art, title: 'Last Year’s Bones', media: 'assets/videos/last-years-bones.mp4', url: 'https://filip.renemark.se/misc/last-years-bones', category: 'Character · Lighting · Mood', content: 'assets/content/last-years-bones.html' },
  { world: WORLDS.art, title: 'Procedural Material', media: 'assets/videos/material.mp4', url: 'https://filip.renemark.se/misc/material', category: 'Substance Designer · Materials', content: 'assets/content/procedural-material.html' },
];

// Det som infopanelen visar när bilen står utanför garaget. Samma fält som ett projekt.
export const ABOUT = {
  title: 'About me',
  category: 'Hello!',
  content: 'assets/content/about.html',
  url: 'mailto:filip@renemark.me',
  linkText: 'Email me →',
};

// ---------------------------------------------------------------------------
// RUTTEN – hur hemvärlden är lagd som en färdväg med distrikt. Bara data (inget 3D),
// så att andra moduler (intro-kameran, vinjetter vid skyltarna, stämpelräknaren) kan läsa
// den utan att importera three. hub.js, roads.js och hubprops.js bygger världen ur den.
// ---------------------------------------------------------------------------
// KOORDINATER: samma "right, down" som hubPoint() i home.js: right = enheter åt höger på
// skärmen, down = enheter nedåt, räknat från mitten av den ursprungliga skyltraden.
// Skyltarna står alltid vända mot kameran, så rutten läses rakt på skärmen.
//   Huvudvägen ligger 12.5 (= ROAD_DISTANCE) nedanför varje skylt: infarten går rakt ner
//   från skyltens ficka till vägen, så skyltens `down` + 12.5 = vägens `down` vid skylten.
// OBS: gen-data.mjs läser den här filen med en enkel textersättning, så håll allt nedan som
// `export const` (inga `export function`) och lägg inga fler `import`-rader.
//
// Fält per stopp:
//   title    – samma som i PROJECTS.
//   district – 'techart' | 'art' | 'prog' | 'home': vilket distrikt stoppet hör till (se districts).
//   right, down – skyltens plats (hub.js sätter project.x / project.z från dem).
//   road     – hur långt NED vägen ligger vid stoppet (= down + 12.5). Där möter infarten vägen.
//   side     – +1 / -1: åt vilket håll det finns fri mark bredvid skylten (för vinjetter).
//   s        – sträckan längs vägen från garaget, i enheter (räknas ut längst ner).
//   x, z     – världskoordinater. FYLLS I av hub.js när världen byggs (som project.x / z).
export const ROUTE = {
  // Vägen: [right, down] för varje ankarpunkt. Mellan ankarna mjuk S-kurva (se routeDownAt).
  // Första punkten = uppfarten från garaget. Alla `down` utom första är stoppets `road`.
  // Udda stopp (1, 3, 5) ligger på den NORRA raden (vägen högt, road 10), jämna (2, 4, 6) på den SÖDRA (road 18):
  // vägen svänger 8 enheter upp och ner, så sträckan mellan två stopp blir ca 26 enheter fast de står 25 isär i sidled.
  road: [[-44.5, 12.5], [-31, 10], [-6, 18], [19, 10], [44, 18], [69, 10], [94, 18], [100, 18]],
  // De sex främsta, i körordning från garaget, 25 enheter isär (right). Skyltarna står alltid NORR om vägen
  // (infarten går rakt ner till vägen); norra/södra raden skiljer sig i `down`. side = +1: den fria marken för
  // stoppets vinjett ligger ÅT HÖGER om skylten, i luckan fram till nästa skylt (right + 3.5 ... right + 13.5, minst 8
  // enheter öppen mark kvar före nästa skylt). Åt vänster ligger föregående stopps lucka (och för första stoppet stugan).
  stops: [
    { title: 'Water Shader', district: 'techart', right: -31, down: -2.5, road: 10, side: 1 },
    { title: 'Foliage Generator', district: 'techart', right: -6, down: 5.5, road: 18, side: 1 },
    { title: 'AnGame: Procedural Environment', district: 'art', right: 19, down: -2.5, road: 10, side: 1 },
    { title: 'SpookChester: Pixel Art Render', district: 'art', right: 44, down: 5.5, road: 18, side: 1 },
    { title: 'Mutation Protocol', district: 'techart', right: 69, down: -2.5, road: 10, side: 1 },
    { title: 'Lemon Lagoon', district: 'prog', right: 94, down: 5.5, road: 18, side: 1 },
  ],
  // Distriktens landmärken (stora, syns på håll). Mått i enheter: w = bredd (åt höger),
  // d = djup (nedåt), h = ungefärlig höjd. `portal` = var grottan dit ligger (portals.js).
  districts: {
    home: { name: 'Home', right: -44.5, down: 0, color: '#ffb45e' },
    techart: { name: 'Tech Art lab', right: 46.5, down: 38, w: 9, d: 7, h: 15, color: '#6f93c4', portal: { right: 57, down: 52 } },
    art: { name: 'Gallery pavilion', right: -31, down: 49, w: 8, d: 6, h: 11, color: '#ff5d8f', portal: { right: -22.5, down: 61 } },
    prog: { name: 'Server tower', right: 28.5, down: 35.5, w: 5, d: 5, h: 17, color: '#3ddc84', portal: { right: 21, down: 46 } },
  },
  // Hemvägen: redan byggda vägar som tar en tillbaka till huvudvägen. Från plaza-stickvägen
  // (right 0) runt torget och tillbaka över bron vid right -13.
  loop: { via: [[0, 16.8], [0, 27], [0, 38], [-13, 30], [-13, 16.5]], note: 'plaza stick, plaza ring, art road bridge, main road' },
};

// Mjuk höjd (nedåt-värde) på huvudvägen vid en viss `right`: smoothstep mellan ankarpunkterna,
// så vägen är rak vid varje stopp och bågar mellan dem. Utanför ändarna: första/sista värdet.
export const routeDownAt = (right) => {
  const road = ROUTE.road;
  if (right <= road[0][0]) return road[0][1];
  for (let i = 1; i < road.length; i++) {
    if (right <= road[i][0]) {
      const t = (right - road[i - 1][0]) / (road[i][0] - road[i - 1][0]);
      return road[i - 1][1] + (road[i][1] - road[i - 1][1]) * (t * t * (3 - 2 * t));
    }
  }
  return road[road.length - 1][1];
};

// Vägens mittlinje som punkter [{ right, down, s }], s = sträcka från garaget. `step` = ungefärligt
// avstånd i `right` mellan punkterna. Ankarpunkter och `extra` (rights där sidovägar lämnar huvudvägen) tas alltid med.
export const routePath = (step = 3.5, extra = []) => {
  const rights = [];
  for (const [right] of ROUTE.road) rights.push(right);
  for (const right of extra) rights.push(right);
  const first = ROUTE.road[0][0];
  const last = ROUTE.road[ROUTE.road.length - 1][0];
  const fixed = rights.slice();
  for (let right = first + step; right < last; right += step) {
    if (fixed.every((at) => Math.abs(at - right) > step * 0.35)) rights.push(right); // Inte alldeles intill en ankarpunkt.
  }
  rights.sort((a, b) => a - b);
  const points = [];
  let along = 0;
  for (const right of rights) {
    if (points.length && right - points[points.length - 1].right < 0.01) continue; // Dubblett.
    const down = routeDownAt(right);
    if (points.length) {
      const before = points[points.length - 1];
      along += Math.hypot(right - before.right, down - before.down);
    }
    points.push({ right, down, s: along });
  }
  return points;
};

// Stoppen i körordning (en kopia av listan, själva objekten delas): { title, district, right, down, road, side, s, x?, z? }.
export const routeStops = () => ROUTE.stops.slice();
// Stoppet för ett projekt (på titeln), eller null om projektet inte är ett av de främsta.
export const stopFor = (title) => ROUTE.stops.find((stop) => stop.title === title) || null;
// Stoppen i ett distrikt ('techart' | 'art' | 'prog' | 'home').
export const stopsIn = (district) => ROUTE.stops.filter((stop) => stop.district === district);

// Sträckan längs vägen (från garaget) till varje stopp: räknas en gång här så att `s` finns på stoppen.
{
  const path = routePath(0.5);
  for (const stop of ROUTE.stops) {
    let best = path[0];
    for (const point of path) if (Math.abs(point.right - stop.right) < Math.abs(best.right - stop.right)) best = point;
    stop.s = Math.round(best.s * 10) / 10;
  }
}
