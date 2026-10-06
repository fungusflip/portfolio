// ============================================================================
// cavethemes.js — varje grotta får sin världs känsla (Tech Art, Programming, Art).
// ============================================================================
// buildCave (portals.js) bygger tre likadana gråvioletta stenhögar. Här färgas de om och
// dekoreras, så att man ser vilken värld grottan leder till redan på håll:
//   Tech Art    – blåstål, glödande cyan rutnät + trådmodell på stenarna, en svepande ljuslinje,
//                 en nodgraf-panel, flytande trådmodeller och en RGB-axelkryssare.
//   Programming – svartgrön sten med kretskortsspår och lödpunkter, en terminal med rullande
//                 kod, en pixelmonster, serverrack med blinkande LED och fallande matrix-tecken.
//   Art         – varm jordfärgad sten med stora färgstänk och penseldrag, staffli med målning,
//                 palett, färgburkar, färgade band över valvet och en vimpelgirland.
// Allt sitter PÅ stenarna, på deras toppar eller BREDVID den raka infarten (|x| < 1.7 är fri).
// Stenarnas glöd är "skal": samma form som stenen, någon procent större, med en shader som bara
// ritar linjerna (genomskinligt, additivt). Det följer stenens yta utan att jag måste placera
// varje linje för hand, och optimize.js slår ihop alla skal i en grotta till ett enda objekt.
// Grottans mått: +x = höger på skärmen, +y = upp, +z = uppåt på skärmen (ut ur öppningen),
// -z = nedåt mot kameran. Det som ska synas från kameran vetter därför åt -z (och uppåt).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, WORLDS, currentWorld, postMaterial } from './core.js';
import { shared } from './magic.js';
import { markMoving } from './optimize.js';

// ---------------------------------------------------------------------------
// Att ställa in
// ---------------------------------------------------------------------------
const SHELL_GROW = 1.02;        // Hur mycket större än stenen glödskalet är (1.02 = 2 %).
const WIRE_GROW = 1.03;         // Samma för trådmodellen på Tech Art-stenarna.
const TECH_CYAN = '#4fe8ff';    // Rutnätets och trådmodellens färg.
const TECH_GRID_CELL = 1.8;     // Rutnätets maskstorlek (världsenheter).
const TECH_SCAN_SPEED = 1.6;    // Hur fort ljuslinjen vandrar uppåt (enheter/sekund).
const TECH_SCAN_RANGE = 9;      // Hur högt den går innan den börjar om.
const PCB_CELL = 0.9;           // Kretskortsspårens maskstorlek.
const CODE_SCROLL = 0.07;       // Terminaltextens rullfart (hela texturvarv/sekund).
const SPLASH_SCALE = 3.2;       // Färgstänkens storlek (cellstorlek, enheter).
const SPLASH_AMOUNT = 0.45;     // Andel celler som får ett stänk (0–1).

// ---------------------------------------------------------------------------
// Små hjälpare
// ---------------------------------------------------------------------------
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);
const basicCache = new Map();
function basic(color, extra = {}) { // Samma färg = samma material (så optimize kan slå ihop).
  const key = color + JSON.stringify(extra);
  if (!basicCache.has(key)) basicCache.set(key, new THREE.MeshBasicMaterial({ color, ...extra }));
  return basicCache.get(key);
}
function box(parent, x, y, z, w, h, d, material) {
  const mesh = new THREE.Mesh(UNIT_BOX, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  parent.add(mesh);
  return mesh;
}
// En rak stav från punkt a till punkt b.
function stick(parent, a, b, thick, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  const mesh = new THREE.Mesh(UNIT_BOX, material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.scale.set(thick, length, thick);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  parent.add(mesh);
  return mesh;
}
function canvasTexture(width, height, draw) {
  const image = document.createElement('canvas');
  image.width = width;
  image.height = height;
  draw(image.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; // Panelerna ses snett uppifrån.
  return texture;
}
// En stående skärm som vetter mot kameran (som namnskyltarna): returnerar "brädan" att bygga på.
// Brädans +z = mot kameran, +y = upp; tilt lutar den bakåt så att den syns bättre uppifrån.
function standingScreen(parent, x, y, z, tilt) {
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  holder.rotation.y = Math.PI;
  const board = new THREE.Group();
  board.rotation.x = -tilt;
  holder.add(board);
  parent.add(holder);
  return board;
}
const hubNow = () => currentWorld === WORLDS.hub;
// Alla animerade saker anmäler en funktion (tid, delta) här. Körs från updateCaveThemes.
const updaters = [];

// Byter stenarnas material mot en egen färgad kopia (de tre grottorna delar annars material).
function tintRocks(rocks, lightColor, darkColor) {
  const lightRock = new THREE.Color(PALETTE.rock);
  const cache = new Map();
  for (const rock of rocks) {
    const old = rock.material;
    if (!cache.has(old)) {
      const copy = old.clone();
      copy.color.set(old.color.equals(lightRock) ? lightColor : darkColor);
      cache.set(old, copy);
    }
    rock.material = cache.get(old);
  }
}
// Glödskal: en kopia av varje sten, lite större, med en genomskinlig shader.
function addShells(parent, rocks, material, grow = SHELL_GROW) {
  for (const rock of rocks) {
    const shell = new THREE.Mesh(rock.geometry, material);
    shell.position.copy(rock.position);
    shell.scale.copy(rock.scale).multiplyScalar(grow);
    shell.renderOrder = 1;
    shell.userData.noShadow = true;
    parent.add(shell);
  }
}
function shellMaterial(uniforms, fragmentBody, blending) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, ...uniforms },
    vertexShader: `
      varying vec3 vW;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0); // Redan inbakad i världen när optimize slagit ihop skalen.
        vW = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vW;
      float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      // 1 på en linje vid heltalen i v, med konstant bredd i pixlar (fwidth).
      float gridLine(float v, float widthPx) {
        float f = abs(fract(v + 0.5) - 0.5);
        float w = max(fwidth(v) * widthPx, 1e-4);
        return 1.0 - smoothstep(0.0, w, f);
      }
      ${fragmentBody}`,
    transparent: true,
    depthWrite: false,
    blending,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, // Vinner över stenen under.
  });
}

// ===========================================================================
// TECH ART
// ===========================================================================
const techShell = () => shellMaterial({
  uColor: { value: new THREE.Color(TECH_CYAN) },
  uCell: { value: 1 / TECH_GRID_CELL },
  uScan: { value: TECH_SCAN_SPEED },
  uRange: { value: TECH_SCAN_RANGE },
}, `
  uniform vec3 uColor;
  uniform float uCell, uScan, uRange;
  void main() {
    vec3 p = vW * uCell;
    // Rutnät: linjer där ytan skär x-, y- och z-planen (som höjdkurvor i tre riktningar).
    float g = max(max(gridLine(p.x, 1.0), gridLine(p.y, 1.0)), gridLine(p.z, 1.0));
    // Tjockare huvudlinjer var fjärde ruta.
    float major = max(max(gridLine(p.x * 0.25, 1.8), gridLine(p.y * 0.25, 1.8)), gridLine(p.z * 0.25, 1.8));
    // Ljuslinjen som sveper uppåt över berget.
    float sy = mod(uTime * uScan, uRange) - 1.0;
    float scan = exp(-pow((vW.y - sy) * 2.4, 2.0));
    float a = g * 0.34 + major * 0.5 + scan * (0.12 + g * 0.55 + major * 0.3);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), scan * 0.45) * a, 1.0);
    #include <colorspace_fragment>
  }`, THREE.AdditiveBlending);

// Nodgrafen (som i Houdini/Blender): rundade rutor med rubriker, stift och kurvade kopplingar.
function makeNodeGraphTexture() {
  return canvasTexture(512, 320, (pen, w, h) => {
    pen.fillStyle = 'rgba(8, 18, 32, 0.88)';
    pen.fillRect(0, 0, w, h);
    pen.strokeStyle = 'rgba(79, 232, 255, 0.12)';
    pen.lineWidth = 1;
    for (let x = 0; x <= w; x += 32) { pen.beginPath(); pen.moveTo(x, 0); pen.lineTo(x, h); pen.stroke(); }
    for (let y = 0; y <= h; y += 32) { pen.beginPath(); pen.moveTo(0, y); pen.lineTo(w, y); pen.stroke(); }
    // [x, y, bredd, höjd, färg]
    const nodes = [
      [24, 40, 110, 64, '#ffb347'], [24, 190, 110, 64, '#ffb347'],
      [200, 24, 120, 84, '#4fe8ff'], [200, 160, 120, 84, '#7cf29a'],
      [378, 80, 108, 100, '#ff6bd6'],
    ];
    const links = [[0, 2], [0, 3], [1, 3], [2, 4], [3, 4]];
    pen.lineWidth = 3;
    for (const [from, to] of links) {
      const [ax, ay, aw, ah] = nodes[from];
      const [bx, by, , bh] = nodes[to];
      const x1 = ax + aw, y1 = ay + ah / 2, x2 = bx, y2 = by + bh / 2;
      pen.strokeStyle = nodes[from][4];
      pen.beginPath();
      pen.moveTo(x1, y1);
      pen.bezierCurveTo(x1 + 50, y1, x2 - 50, y2, x2, y2);
      pen.stroke();
    }
    for (const [x, y, nw, nh, color] of nodes) {
      pen.fillStyle = '#0d2236';
      pen.strokeStyle = color;
      pen.lineWidth = 3;
      pen.beginPath(); pen.roundRect(x, y, nw, nh, 10); pen.fill(); pen.stroke();
      pen.fillStyle = color;
      pen.beginPath(); pen.roundRect(x, y, nw, 20, [10, 10, 0, 0]); pen.fill();
      pen.fillStyle = 'rgba(255,255,255,0.35)';
      pen.fillRect(x + 12, y + 32, nw - 40, 6);
      pen.fillRect(x + 12, y + 46, nw - 64, 6);
      pen.fillStyle = color; // Stiften.
      pen.beginPath(); pen.arc(x, y + nh / 2, 6, 0, Math.PI * 2); pen.fill();
      pen.beginPath(); pen.arc(x + nw, y + nh / 2, 6, 0, Math.PI * 2); pen.fill();
    }
    pen.strokeStyle = TECH_CYAN;
    pen.lineWidth = 6;
    pen.strokeRect(3, 3, w - 6, h - 6);
  });
}

function buildTech(deco, rocks) {
  tintRocks(rocks, '#6a82a3', '#46597a');
  // Trådmodell: alla stenarnas kanter i ETT linjeobjekt (lite utanför ytan så de inte flimrar).
  const edgeGeometries = rocks.map((rock) => {
    const edges = new THREE.EdgesGeometry(rock.geometry, 1);
    edges.applyMatrix4(new THREE.Matrix4().compose(rock.position, rock.quaternion, rock.scale.clone().multiplyScalar(WIRE_GROW)));
    return edges;
  });
  const wire = new THREE.LineSegments(
    mergeGeometries(edgeGeometries),
    new THREE.LineBasicMaterial({ color: TECH_CYAN, transparent: true, opacity: 0.5, depthWrite: false })
  );
  wire.userData.noShadow = true;
  deco.add(wire);
  addShells(deco, rocks, techShell());

  // Nodgraf-panelen: en svävande hologram-skärm på bergets kamerasida, ovanför namnskylten.
  const board = standingScreen(deco, 0, 4.15, -8.9, 0.55);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2.1),
    new THREE.MeshBasicMaterial({ map: makeNodeGraphTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  panel.userData.noShadow = true;
  board.add(panel);
  // Hörnstolpar så att den ser ut att vara fäst i berget.
  for (const x of [-1.7, 1.7]) box(board, x, -1.3, -0.05, 0.08, 0.9, 0.08, basic(TECH_CYAN));

  // Axelkryssaren (röd X, grön Y, blå Z) som svävar bredvid infarten.
  const gizmo = new THREE.Group();
  gizmo.position.set(-3.7, 1.9, 2.6);
  const origin = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), basic('#ffffff'));
  gizmo.add(origin);
  const tipGeometry = new THREE.ConeGeometry(0.13, 0.34, 10);
  [
    ['#ff4d5e', new THREE.Vector3(1, 0, 0)],
    ['#5dff7a', new THREE.Vector3(0, 1, 0)],
    ['#4d8dff', new THREE.Vector3(0, 0, 1)],
  ].forEach(([color, axis]) => {
    const material = basic(color);
    stick(gizmo, new THREE.Vector3(), axis.clone().multiplyScalar(1.15), 0.08, material);
    const tip = new THREE.Mesh(tipGeometry, material);
    tip.position.copy(axis).multiplyScalar(1.3);
    tip.quaternion.setFromUnitVectors(UP, axis);
    gizmo.add(tip);
  });
  gizmo.userData.noShadow = true;
  deco.add(gizmo);
  markMoving(gizmo);

  // Flytande trådmodeller: kub, ikosaeder, oktaeder. [geometri, x, y, z]
  const lineMaterial = new THREE.LineBasicMaterial({ color: TECH_CYAN });
  const floaters = [
    [new THREE.BoxGeometry(1, 1, 1), 3.7, 2.6, 2.3],
    [new THREE.IcosahedronGeometry(0.65, 0), 4.6, 1.5, 4.0],
    [new THREE.OctahedronGeometry(0.55, 0), -4.8, 3.9, 1.4],
    [new THREE.BoxGeometry(0.6, 0.6, 0.6), -2.9, 2.7, 4.6],
  ].map(([geometry, x, y, z], i) => {
    const shape = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMaterial);
    shape.position.set(x, y, z);
    shape.userData = { baseY: y, noShadow: true, phase: i * 1.7 };
    deco.add(shape);
    markMoving(shape);
    return shape;
  });
  updaters.push((t) => {
    gizmo.rotation.y = t * 0.6;
    gizmo.position.y = 1.9 + Math.sin(t * 1.3) * 0.12;
    for (const shape of floaters) {
      shape.rotation.set(t * 0.5 + shape.userData.phase, t * 0.7, 0);
      shape.position.y = shape.userData.baseY + Math.sin(t * 1.1 + shape.userData.phase) * 0.18;
    }
  });
}

// ===========================================================================
// PROGRAMMING
// ===========================================================================
const pcbShell = () => shellMaterial({
  uColor: { value: new THREE.Color(PALETTE.progTrace) },
  uPad: { value: new THREE.Color('#c8ffd8') },
  uCell: { value: 1 / PCB_CELL },
}, `
  uniform vec3 uColor, uPad;
  uniform float uCell;
  float lane(float i) { return 0.22 + 0.56 * h11(i + 3.0); }
  float band(float d, float w) { // 1 inom w från linjen, mjuk kant på en pixel.
    float f = max(fwidth(d), 1e-4);
    return 1.0 - smoothstep(w - f, w + f, abs(d));
  }
  void main() {
    // Välj plan efter ytans riktning (ur kantlängden), så att spåren inte smetas ut på toppar och sidor.
    vec3 n = abs(normalize(cross(dFdx(vW), dFdy(vW))));
    vec2 uv = n.y > 0.55 ? vW.xz : (n.z > n.x ? vW.xy : vW.zy);
    float plane = n.y > 0.55 ? 0.0 : (n.z > n.x ? 11.0 : 23.0);
    uv *= uCell;
    vec2 id = floor(uv);
    vec2 f = fract(uv);
    float laneY = lane(id.y + plane);
    float laneX = lane(id.x + plane + 40.0);
    // Rader och kolumner med spår: ett spår går genom en hel ruta, så grannrutor hänger ihop.
    float hz = step(h21(id + vec2(3.0, 1.0) + plane), 0.42);
    float vt = step(h21(id + vec2(9.0, 5.0) + plane), 0.36);
    float trace = max(hz * band(f.y - laneY, 0.05), vt * band(f.x - laneX, 0.05));
    // Lödpunkt (ring) där ett vågrätt och ett lodrätt spår möts, plus enstaka fristående viapunkter.
    float d = length(f - vec2(laneX, laneY));
    float pad = hz * vt * (1.0 - smoothstep(0.1, 0.13, d)) * smoothstep(0.03, 0.05, d);
    float via = step(0.93, h21(id + plane + 7.0)) * (1.0 - smoothstep(0.09, 0.12, length(f - 0.5)));
    // Pulser som rinner längs spåren.
    float pulse = 0.5 + 0.5 * sin(uTime * 2.6 + (uv.x + uv.y) * 1.9 + h21(id) * 6.0);
    float a = trace * (0.28 + 0.4 * pulse) + (pad + via) * 0.85;
    vec3 c = mix(uColor, uPad, clamp(pad + via, 0.0, 1.0));
    gl_FragColor = vec4(c * a, 1.0);
    #include <colorspace_fragment>
  }`, THREE.AdditiveBlending);

const CODE_LINES = [
  ['#7dff9e', 'const world = loadWorld("prog");'],
  ['#2f9a5c', '// every frame counts'],
  ['#c8ffd8', 'for (let i = 0; i < n; i++) {'],
  ['#7dff9e', '  tick(entities[i], dt);'],
  ['#c8ffd8', '}'],
  ['#7dff9e', 'function render(scene, cam) {'],
  ['#7dff9e', '  gl.drawArrays(TRIANGLES, 0, v);'],
  ['#c8ffd8', '}'],
  ['#2f9a5c', '/* TODO: fix the boss fight */'],
  ['#7dff9e', 'if (player.hp <= 0) respawn();'],
  ['#c8ffd8', 'class Enemy extends Entity {'],
  ['#7dff9e', '  update() { this.ai.think(); }'],
  ['#c8ffd8', '}'],
  ['#7dff9e', 'import { shader } from "./gfx";'],
  ['#2f9a5c', '// build passing: 128/128'],
  ['#7dff9e', 'export default main();'],
];
function makeCodeTexture() {
  const texture = canvasTexture(512, 512, (pen, w, h) => {
    pen.fillStyle = '#04100a';
    pen.fillRect(0, 0, w, h);
    pen.font = 'bold 24px monospace';
    pen.textBaseline = 'middle';
    const step = h / CODE_LINES.length; // Raderna fyller hela höjden: texturen går att rulla i en slinga.
    CODE_LINES.forEach(([color, text], i) => {
      pen.fillStyle = color;
      pen.fillText(text, 14, step * (i + 0.5));
    });
  });
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 0.5); // Åtta rader syns åt gången.
  return texture;
}
// Prompten under koden. Returnerar texturen och var markören ska stå (0–1 från vänster).
function makePromptTexture() {
  let cursorAt = 0;
  const texture = canvasTexture(512, 64, (pen, w, h) => {
    pen.fillStyle = '#04100a';
    pen.fillRect(0, 0, w, h);
    pen.font = 'bold 28px monospace';
    pen.textBaseline = 'middle';
    pen.fillStyle = '#c8ffd8';
    const text = 'filip@cave:~$ run';
    pen.fillText(text, 14, h / 2);
    cursorAt = (14 + pen.measureText(text).width + 12) / w;
  });
  return { texture, cursorAt };
}
// Pixelmonstret (klassiskt arkad-monster) i två bildrutor.
const INVADER_A = ['  #     #  ', '   #   #   ', '  #######  ', ' ## ### ## ', '###########', '# ####### #', '# #     # #', '   ## ##   '];
const INVADER_B = ['  #     #  ', '#  #   #  #', '# ####### #', '### ### ###', '###########', ' ######### ', '  #     #  ', ' #       # '];
const VOXEL = 0.26;
function makeInvader(parent, rows, color) {
  const cells = [];
  rows.forEach((row, r) => [...row].forEach((c, col) => { if (c === '#') cells.push([col, r]); }));
  const mesh = new THREE.InstancedMesh(UNIT_BOX, basic(color), cells.length);
  const matrix = new THREE.Matrix4();
  cells.forEach(([col, r], i) => {
    matrix.compose(
      new THREE.Vector3((col - 5) * VOXEL, (rows.length - 1 - r) * VOXEL, 0),
      new THREE.Quaternion(), new THREE.Vector3(VOXEL * 0.92, VOXEL * 0.92, VOXEL * 0.92)
    );
    mesh.setMatrixAt(i, matrix);
  });
  mesh.userData.noShadow = true;
  parent.add(mesh);
  return mesh;
}

// Fallande matrix-tecken: en shader på ett plan, kolumner av 3x5-pixels "tecken" som byter form.
function makeMatrixMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uColor: { value: new THREE.Color(PALETTE.progTrace) } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 g = vec2(vUv.x * 9.0, vUv.y * 24.0);
        vec2 id = floor(g);
        vec2 f = fract(g);
        float live = step(h(vec2(id.x, 5.0)), 0.8); // En del kolumner är tomma.
        float speed = 0.22 + 0.4 * h(vec2(id.x, 1.0));
        float headV = 1.25 - fract(uTime * speed + h(vec2(id.x, 9.0))) * 1.5; // Huvudet faller nedåt.
        float trail = vUv.y - headV; // > 0 = ovanför huvudet.
        float fade = trail > 0.0 ? exp(-trail * 4.5) : 0.0;
        // Tecknet: 3x5 pixlar som slumpas om några gånger i sekunden.
        vec2 sub = f * vec2(3.0, 5.0);
        vec2 cell = floor(sub);
        vec2 inCell = fract(sub);
        float pixel = step(0.5, h(id * 7.0 + cell + floor(uTime * (2.0 + 4.0 * h(id)))));
        float square = step(0.18, inCell.x) * step(inCell.x, 0.82) * step(0.18, inCell.y) * step(inCell.y, 0.82);
        float edge = step(0.12, f.x) * step(f.x, 0.88);
        float lead = smoothstep(0.045, 0.0, abs(trail)); // Det främsta tecknet lyser vitt.
        float a = pixel * square * edge * live * max(fade, lead) * 0.95;
        gl_FragColor = vec4(mix(uColor, vec3(0.85, 1.0, 0.9), lead) * a, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function buildProg(deco, rocks) {
  tintRocks(rocks, '#475a4f', '#2b3a32');
  addShells(deco, rocks, pcbShell());

  // Terminalen: en tjock skärm som lutar mot bergets kamerasida (halvt inbäddad).
  const board = standingScreen(deco, 0, 3.9, -8.5, 0.5);
  box(board, 0, 0, -0.17, 3.9, 2.6, 0.34, basic('#0a1511'));
  box(board, 0, 0, -0.14, 4.0, 2.7, 0.3, basic('#1d3a2b')); // Ljus kant bakom: syns som ram.
  const code = makeCodeTexture();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), new THREE.MeshBasicMaterial({ map: code }));
  screen.position.set(0, 0.2, 0.01);
  screen.userData.noShadow = true;
  board.add(screen);
  const prompt = makePromptTexture();
  const promptBar = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.45), new THREE.MeshBasicMaterial({ map: prompt.texture }));
  promptBar.position.set(0, -0.93, 0.01);
  board.add(promptBar);
  const cursor = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.32), basic(PALETTE.progTrace));
  cursor.position.set(-1.8 + prompt.cursorAt * 3.6 + 0.1, -0.93, 0.02);
  board.add(cursor);
  markMoving(screen, cursor);

  // Pixelmonstret på bergets topp (två bildrutor som byts), med en liten sockel.
  const invader = standingScreen(deco, 1.5, 5.2, -7.2, 0.45);
  box(invader, 0, -0.1, -0.1, 3.3, 0.3, 0.9, basic('#0a1511'));
  const frameA = makeInvader(invader, INVADER_A, '#7dff9e');
  const frameB = makeInvader(invader, INVADER_B, '#7dff9e');
  markMoving(frameA, frameB);

  // Serverrack bredvid infarten: staplade lådor, LED:erna är små instanser som blinkar.
  const racks = [[-4.5, 2.0, 4, 0.1], [-4.6, 3.6, 3, -0.15]]; // [x, z, antal lådor, vridning]
  const ledPlaces = [];
  for (const [x, z, count, turn] of racks) {
    const stack = new THREE.Group();
    stack.position.set(x, 0, z);
    stack.rotation.y = turn;
    for (let i = 0; i < count; i++) {
      const y = 0.25 + i * 0.5;
      box(stack, 0, y, 0, 1.0, 0.46, 0.8, basic('#16221c'));
      box(stack, 0, y + 0.1, -0.41, 0.84, 0.07, 0.02, basic('#2d3f35')); // Ventilspringa.
      for (let k = 0; k < 4; k++) ledPlaces.push([stack, -0.36 + k * 0.11, y - 0.1, -0.43]);
    }
    deco.add(stack);
  }
  const ledMesh = new THREE.InstancedMesh(UNIT_BOX, new THREE.MeshBasicMaterial({ color: '#ffffff' }), ledPlaces.length);
  const ledOff = new THREE.Color('#0d1a12');
  const ledGreen = new THREE.Color('#47ff8a');
  const ledAmber = new THREE.Color('#ffb02e');
  deco.updateMatrixWorld(true); // Stapelns plats måste vara uträknad innan LED:erna placeras.
  const ledMatrix = new THREE.Matrix4();
  ledPlaces.forEach(([stack, x, y, z], i) => {
    ledMatrix.compose(
      new THREE.Vector3(x, y, z).applyMatrix4(stack.matrix), stack.quaternion,
      new THREE.Vector3(0.08, 0.08, 0.04)
    );
    ledMesh.setMatrixAt(i, ledMatrix);
    ledMesh.setColorAt(i, ledOff);
  });
  ledMesh.userData.noShadow = true;
  deco.add(ledMesh);
  markMoving(ledMesh);
  const ledState = new Int8Array(ledPlaces.length).fill(-1);

  // Pixelblock: en hög av gröna kuber.
  const heights = [[2, 1, 0], [1, 3, 1], [0, 2, 1]];
  const cubes = [];
  heights.forEach((row, r) => row.forEach((height, c) => { for (let y = 0; y < height; y++) cubes.push([c, y, r]); }));
  const voxels = new THREE.InstancedMesh(UNIT_BOX, new THREE.MeshLambertMaterial({ color: '#ffffff' }), cubes.length);
  const greens = ['#1f8a4c', '#2fbf6a', '#3ddc84', '#7dff9e'];
  cubes.forEach(([c, y, r], i) => {
    ledMatrix.compose(
      new THREE.Vector3(3.6 + c * 0.4, 0.19 + y * 0.38, 3.2 + r * 0.4), new THREE.Quaternion(),
      new THREE.Vector3(0.36, 0.36, 0.36)
    );
    voxels.setMatrixAt(i, ledMatrix);
    voxels.setColorAt(i, new THREE.Color(greens[(c * 3 + y * 2 + r) % greens.length]));
  });
  deco.add(voxels);

  // Matrix-gardiner på var sida om infarten (vända mot kameran).
  const matrix = makeMatrixMaterial();
  for (const x of [-3.2, 3.3]) {
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4.0), matrix);
    curtain.position.set(x, 2.2, 1.7);
    curtain.rotation.y = Math.PI;
    curtain.userData.noShadow = true;
    deco.add(curtain);
  }

  updaters.push((t) => {
    code.offset.y = -((t * CODE_SCROLL) % 1);
    cursor.visible = Math.floor(t * 2) % 2 === 0;
    const second = Math.floor(t * 1.6) % 2 === 0;
    frameA.visible = second;
    frameB.visible = !second;
    // LED:erna: var och en blinkar i sin egen takt. Färgen sätts bara om när tillståndet ändras.
    let changed = false;
    for (let i = 0; i < ledState.length; i++) {
      const on = Math.sin(t * (1.5 + (i % 5) * 1.1) + i * 1.9) > -0.2 ? (i % 7 === 0 ? 2 : 1) : 0;
      if (on !== ledState[i]) {
        ledState[i] = on;
        ledMesh.setColorAt(i, on === 0 ? ledOff : on === 1 ? ledGreen : ledAmber);
        changed = true;
      }
    }
    if (changed) ledMesh.instanceColor.needsUpdate = true;
  });
}

// ===========================================================================
// ART
// ===========================================================================
const PAINTS = [...PALETTE.artPaints, '#ff8a3d', '#9b5de5']; // Rosa, turkos, gul, blå, orange, lila.
const splashShell = () => shellMaterial({
  uPal: { value: PAINTS.map((c) => new THREE.Color(c)) },
  uSize: { value: SPLASH_SCALE },
  uAmount: { value: SPLASH_AMOUNT },
}, `
  uniform vec3 uPal[${PAINTS.length}];
  uniform float uSize, uAmount;
  // Ett lager av klickar: varje cell i ett 3D-rutnät kan ha en sfär (utdragen = penseldrag) som
  // skär ytan i en rund eller avlång fläck. Radien håller sig inom cellen så kanterna inte klipps.
  vec4 blobs(vec3 p, float size, float radius, float stretch, float amount, float seed) {
    vec3 q = p / size;
    vec3 id = floor(q) + seed;
    vec3 f = fract(q);
    float hash = h31(id);
    if (hash > amount) return vec4(0.0);
    vec3 centre = vec3(0.5) + (vec3(h31(id + 3.1), h31(id + 7.7), h31(id + 11.3)) - 0.5) * 0.06;
    float pick = h31(id + 5.5);
    vec3 scale = pick < 0.4 ? vec3(stretch, 1.0, 1.0) : (pick < 0.7 ? vec3(1.0, 1.0, stretch) : vec3(1.0, stretch, 1.0));
    float d = length((f - centre) * scale);
    float soft = max(fwidth(d), 1e-3);
    float a = 1.0 - smoothstep(radius - soft, radius, d);
    int k = int(floor(h31(id + 1.7) * ${PAINTS.length}.0));
    return vec4(uPal[k], a);
  }
  void main() {
    vec4 outColor = vec4(0.0);
    vec4 big = blobs(vW, uSize, 0.3, 1.0, uAmount, 0.0);        // Stora stänk.
    vec4 stroke = blobs(vW, uSize * 0.8, 0.21, 0.5, 0.4, 41.0); // Penseldrag: långa, smala.
    vec4 dots = blobs(vW, uSize * 0.35, 0.17, 1.0, 0.22, 83.0); // Små stänk.
    outColor = mix(outColor, big, big.a);
    outColor = mix(vec4(stroke.rgb, 1.0), outColor, 1.0 - stroke.a) * vec4(1.0, 1.0, 1.0, 1.0);
    float alpha = max(max(big.a, stroke.a), dots.a);
    vec3 color = big.rgb * big.a;
    color = mix(color, stroke.rgb, stroke.a);
    color = mix(color, dots.rgb, dots.a);
    gl_FragColor = vec4(color, alpha * 0.92);
    #include <colorspace_fragment>
  }`, THREE.NormalBlending);

// Målningen på staffliet: ett litet landskap i varma färger med penseldrag.
function makePaintingTexture() {
  return canvasTexture(256, 320, (pen, w, h) => {
    const sky = pen.createLinearGradient(0, 0, 0, h * 0.6);
    sky.addColorStop(0, '#ff8a5c');
    sky.addColorStop(1, '#ffd36b');
    pen.fillStyle = sky;
    pen.fillRect(0, 0, w, h);
    pen.fillStyle = '#fff2b0';
    pen.beginPath(); pen.arc(w * 0.68, h * 0.3, 38, 0, Math.PI * 2); pen.fill();
    const hills = [['#2ec4b6', 0.58, 0.2], ['#3a86ff', 0.7, 0.35], ['#6a3d9a', 0.82, 0.1]];
    for (const [color, y, phase] of hills) {
      pen.fillStyle = color;
      pen.beginPath();
      pen.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) pen.lineTo(x, h * y + Math.sin(x * 0.03 + phase * 20) * 22);
      pen.lineTo(w, h);
      pen.fill();
    }
    pen.lineCap = 'round';
    for (let i = 0; i < 26; i++) { // Penseldrag ovanpå.
      pen.strokeStyle = PAINTS[i % PAINTS.length];
      pen.lineWidth = 6 + (i % 3) * 3;
      const x = (i * 53) % w;
      const y = 40 + ((i * 97) % (h - 80));
      pen.beginPath(); pen.moveTo(x, y); pen.quadraticCurveTo(x + 24, y - 14, x + 50, y + 4); pen.stroke();
    }
    pen.strokeStyle = '#ffffff';
    pen.lineWidth = 8;
    pen.strokeRect(4, 4, w - 8, h - 8);
  });
}

function buildEasel(deco, x, z) {
  const easel = new THREE.Group();
  easel.position.set(x, 0, z);
  easel.rotation.y = Math.PI + 0.25; // Vänd mot kameran, lite vriden.
  const wood = postMaterial;
  stick(easel, new THREE.Vector3(-0.55, 0, 0.5), new THREE.Vector3(-0.38, 2.15, 0.0), 0.09, wood);
  stick(easel, new THREE.Vector3(0.55, 0, 0.5), new THREE.Vector3(0.38, 2.15, 0.0), 0.09, wood);
  stick(easel, new THREE.Vector3(0, 0, -0.85), new THREE.Vector3(0, 2.1, -0.1), 0.09, wood);
  box(easel, 0, 0.78, 0.28, 1.4, 0.07, 0.3, wood); // Hyllan.
  const canvas = new THREE.Group();
  canvas.position.set(0, 1.5, 0.1);
  canvas.rotation.x = -0.12;
  box(canvas, 0, 0, 0, 1.3, 1.6, 0.07, basic('#f3ead8'));
  const painting = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.45), new THREE.MeshBasicMaterial({ map: makePaintingTexture() }));
  painting.position.z = 0.04;
  painting.userData.noShadow = true;
  canvas.add(painting);
  easel.add(canvas);
  deco.add(easel);
}

// Paletten: en brun, nedtryckt tummhålsform med färgklickar. Ligger platt på marken.
function buildPalette(deco, x, z) {
  const palette = new THREE.Group();
  palette.position.set(x, 0.06, z);
  palette.rotation.y = 0.5;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.07, 20), basic('#c9955c'));
  base.scale.set(1.3, 1, 0.9);
  palette.add(base);
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 12), basic('#3d2a22'));
  hole.position.set(-0.7, 0, 0.2);
  palette.add(hole);
  const dollop = new THREE.SphereGeometry(0.17, 10, 6);
  PAINTS.forEach((color, i) => {
    const angle = 0.6 + i * 0.5;
    const blob = new THREE.Mesh(dollop, basic(color));
    blob.position.set(Math.cos(angle) * 0.8 * 1.0 + 0.1, 0.05, Math.sin(angle) * 0.5 - 0.05);
    blob.scale.set(1, 0.45, 1);
    palette.add(blob);
  });
  deco.add(palette);
}

function buildBucket(deco, x, z, color) {
  const bucket = new THREE.Group();
  bucket.position.set(x, 0, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.33, 0.6, 14), basic('#8fa0b3'));
  body.position.y = 0.3;
  bucket.add(body);
  const paint = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 14), basic(color));
  paint.position.y = 0.58;
  bucket.add(paint);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 5, 12, Math.PI), basic('#5d6b7a'));
  handle.position.y = 0.6;
  bucket.add(handle);
  // Ett glatt färgspill på marken framför.
  const spill = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14), basic(color));
  spill.rotation.x = -Math.PI / 2;
  spill.scale.set(1.2, 0.8, 1);
  spill.position.set(0.1, 0.03, -0.6);
  bucket.add(spill);
  deco.add(bucket);
}

function buildArt(deco, rocks) {
  tintRocks(rocks, '#a8826a', '#7f6050');
  addShells(deco, rocks, splashShell());

  buildEasel(deco, -3.7, 3.4);
  buildPalette(deco, -4.9, 4.6);
  buildBucket(deco, 3.7, 2.7, PAINTS[0]);
  buildBucket(deco, 4.6, 3.6, PAINTS[1]);
  // Färgtuber som ligger på marken.
  const tube = new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8);
  const cap = new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8);
  [[PAINTS[2], 3.1, 4.2, 0.4], [PAINTS[3], 3.4, 4.5, -0.3], [PAINTS[4], 2.9, 4.8, 1.1]].forEach(([color, x, z, turn]) => {
    const group = new THREE.Group();
    group.position.set(x, 0.1, z);
    group.rotation.set(0, turn, Math.PI / 2);
    group.add(new THREE.Mesh(tube, basic('#d9d9e0')));
    const tip = new THREE.Mesh(cap, basic(color));
    tip.position.y = 0.3;
    group.add(tip);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.16, 8), basic(color));
    band.position.y = -0.1;
    group.add(band);
    deco.add(group);
  });

  // Färgade band över valvet: fyra tjocka bågar i målarfärger, framför öppningen och högt över bilen.
  PAINTS.slice(0, 4).forEach((color, i) => {
    const z = 0.5 + i * 0.25;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.5, 3.0, z), new THREE.Vector3(-1.9, 5.4 + i * 0.05, z + 0.1),
      new THREE.Vector3(0, 6.0 + i * 0.08, z), new THREE.Vector3(1.9, 5.4 + i * 0.05, z + 0.1),
      new THREE.Vector3(3.5, 3.0, z),
    ]);
    deco.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.1, 6, false), basic(color)));
  });

  // Vimpelgirlanden: två stolpar och en hängande lina med färgade flaggor som svajar.
  const poleTop = 4.4;
  for (const x of [-4.9, 4.9]) {
    stick(deco, new THREE.Vector3(x, 0, 2.3), new THREE.Vector3(x, poleTop, 2.3), 0.12, postMaterial);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), basic(PAINTS[x < 0 ? 2 : 4]));
    knob.position.set(x, poleTop + 0.1, 2.3);
    deco.add(knob);
  }
  const cord = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4.9, poleTop, 2.3), new THREE.Vector3(-2.4, poleTop - 0.75, 2.3),
    new THREE.Vector3(0, poleTop - 1.0, 2.3), new THREE.Vector3(2.4, poleTop - 0.75, 2.3),
    new THREE.Vector3(4.9, poleTop, 2.3),
  ]);
  deco.add(new THREE.Mesh(new THREE.TubeGeometry(cord, 30, 0.03, 4, false), basic('#3d2a22')));
  const flagGeometry = new THREE.BufferGeometry();
  flagGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.19, 0, 0, 0.19, 0, 0, 0, -0.5, 0], 3));
  flagGeometry.computeVertexNormals();
  const flags = [];
  for (let i = 0; i < 11; i++) {
    const flag = new THREE.Mesh(flagGeometry, basic(PAINTS[i % PAINTS.length], { side: THREE.DoubleSide }));
    flag.position.copy(cord.getPointAt((i + 0.5) / 11));
    flag.userData.noShadow = true;
    deco.add(flag);
    markMoving(flag);
    flags.push(flag);
  }
  updaters.push((t) => {
    flags.forEach((flag, i) => { flag.rotation.z = Math.sin(t * 1.9 + i * 0.9) * 0.18; });
  });
}

// ---------------------------------------------------------------------------
// Ingången hit
// ---------------------------------------------------------------------------
// Anropas sist i buildCave. Stenarna är de första barnen i gruppen (alla med vertexColors).
export function decorateCave(portal, group) {
  const rocks = group.children.filter((child) => child.isMesh && child.material.vertexColors);
  const deco = new THREE.Group();
  deco.name = 'caveTheme';
  group.add(deco);
  if (portal.leadsTo === WORLDS.techart) buildTech(deco, rocks);
  else if (portal.leadsTo === WORLDS.prog) buildProg(deco, rocks);
  else if (portal.leadsTo === WORLDS.art) buildArt(deco, rocks);
}

// Körs varje bild från main.js (bara medan hemvärlden syns).
export function updateCaveThemes() {
  if (!hubNow()) return;
  const t = shared.uTime.value;
  for (const update of updaters) update(t);
}
