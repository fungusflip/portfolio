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
