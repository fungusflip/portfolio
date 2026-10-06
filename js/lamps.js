// ============================================================================
// lamps.js — gatlyktor. Varje värld bygger sina egna med buildLamps.
// ============================================================================
// En lykta = stolpe + arm + lykthus + lysande glödlampa + ett mjukt sken runt lampan
// + en ljuspöl på marken under. Det finns INGEN riktig lampa i dem: varje riktig lampa
// gör varenda pixel i scenen dyrare att räkna ut. Skenet och ljuspölen är genomskinliga
// bilder som "lägger till" ljus på det som ligger under (AdditiveBlending).
// Nackdelen: bilen lyses inte upp när den kör under en lykta – bara marken ser upplyst ut.
//
// En världs alla lyktor ritas med instancing, som träden: en form per del, utplacerad
// på alla platser på en gång (6 ritanrop totalt, hur många lyktor det än är).
import * as THREE from 'three';
import {
  PALETTE, BILLBOARD_FACING, CAMERA_PITCH, currentWorld, worldGroup,
  towardCamera, toTheRight, makeGlowMaterial,
} from './core.js';
import { BILLBOARD_SPACING } from './billboards.js';
import { PROJECTS } from './projects.js';
import { ROAD_WIDTH, ROAD_DISTANCE } from './roads.js';
import { makeMoths } from './magic.js';
import { knockableInstances } from './knockables.js';

export const LAMP_SIDE = ROAD_WIDTH / 2 + 1.2; // Hur långt från vägens mitt stolpen står.
const LAMP_HEIGHT = 4;          // Stolpens höjd.
const LAMP_REACH = 1.3;         // Hur långt ut över vägen armen når.
const LAMP_POOL_SIZE = 7;       // Ljuspölens bredd på marken. ÄNDRA för större/mindre ljuscirklar.

// Åt vilket håll armen pekar ut över vägen (vinklar runt Y-axeln, som bilens heading).
export const ARM_DOWN = BILLBOARD_FACING;               // Nedåt på skärmen, mot kameran.
export const ARM_UP = BILLBOARD_FACING + Math.PI;       // Uppåt på skärmen.
export const ARM_LEFT = BILLBOARD_FACING - Math.PI / 2; // Åt vänster.

// Lyktor längs skyltraden i en värld: en mellan varje par av skyltar, plus en i varje
// ände, på den övre sidan av huvudvägen (mellan fickorna). Armen pekar ner över vägen.
export function rowLamps(world) {
  const row = PROJECTS.filter((project) => project.world === world);
  const lampLine = towardCamera(row[0], ROAD_DISTANCE - LAMP_SIDE); // Linjen där stolparna står.
  const lamps = [];
  // <= row.length ger en lykta mer än antalet skyltar. (i - 0.5) = mitt emellan två skyltar.
  for (let i = 0; i <= row.length; i++) {
    lamps.push({ at: toTheRight(lampLine, (i - 0.5) * BILLBOARD_SPACING), arm: ARM_DOWN });
  }
  return lamps;
}

// Delas av alla lyktor.
const lampPostMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.lampPost, roughness: 0.7, metalness: 0.4 });
const postGeometry = new THREE.CylinderGeometry(0.09, 0.13, LAMP_HEIGHT, 8);
const armGeometry = new THREE.BoxGeometry(0.1, 0.1, LAMP_REACH + 0.1);
const headGeometry = new THREE.BoxGeometry(0.5, 0.2, 0.7);
const bulbGeometry = new THREE.BoxGeometry(0.38, 0.06, 0.52);
const haloGeometry = new THREE.PlaneGeometry(2.2, 2.2);
const poolGeometry = new THREE.PlaneGeometry(LAMP_POOL_SIZE, LAMP_POOL_SIZE);
poolGeometry.rotateX(-Math.PI / 2); // Lägg ner den på marken.
const bulbMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' }); // Vit; färgen läggs på per lykta.
const haloMaterial = makeGlowMaterial(0.9);
const poolMaterial = makeGlowMaterial(0.45);

// Två hjälpobjekt: lampBase står där lyktan står och är vriden som den. lampPart är ett
// barn till det och flyttas till varje dels plats INNE i lyktan; dess färdiga matris
// (plats + vridning i världen) läses sedan av.
const lampBase = new THREE.Object3D();
const lampPart = new THREE.Object3D();
lampBase.add(lampPart);
const haloHelper = new THREE.Object3D();

const black = new THREE.Color(0, 0, 0);
const dimBulb = new THREE.Color();
const lampSets = []; // En post per värld som har byggt lyktor, så att de kan flimra.

// Bygger lyktorna i en värld. lamps = [{ at: {x, z}, arm: vinkel }, ...]. Ljuset får världens färg.
export function buildLamps(world, lamps) {
  const count = lamps.length;
  const posts = new THREE.InstancedMesh(postGeometry, lampPostMaterial, count);
  const arms = new THREE.InstancedMesh(armGeometry, lampPostMaterial, count);
  const heads = new THREE.InstancedMesh(headGeometry, lampPostMaterial, count);
  const bulbs = new THREE.InstancedMesh(bulbGeometry, bulbMaterial, count);
  const halos = new THREE.InstancedMesh(haloGeometry, haloMaterial, count);
  const pools = new THREE.InstancedMesh(poolGeometry, poolMaterial, count);
  function place(mesh, i, x, y, z) {
    lampPart.position.set(x, y, z);
    lampBase.updateMatrixWorld(true);
    mesh.setMatrixAt(i, lampPart.matrixWorld);
  }
  const glowColor = new THREE.Color(world.accent);
  const bulbColor = glowColor.clone().lerp(new THREE.Color('#ffffff'), 0.5); // Ljusare än skenet.
  const mothCenters = [];
  lamps.forEach((lamp, i) => {
    lampBase.position.set(lamp.at.x, 0, lamp.at.z);
    lampBase.rotation.y = lamp.arm;
    place(posts, i, 0, LAMP_HEIGHT / 2, 0);
    place(arms, i, 0, LAMP_HEIGHT - 0.1, LAMP_REACH / 2);
    place(heads, i, 0, LAMP_HEIGHT - 0.15, LAMP_REACH);
    place(bulbs, i, 0, LAMP_HEIGHT - 0.27, LAMP_REACH);
    place(pools, i, 0, 0.09, LAMP_REACH); // 0.09 = strax över marken och kanttoningen.
    // Skenet: samma plats som glödlampan, men vridet mot kameran. 'YXZ' = vrid först
    // runt Y (mot kameran i sidled), sedan runt X (luta upp mot kameran).
    lampPart.position.set(0, LAMP_HEIGHT - 0.35, LAMP_REACH);
    lampBase.updateMatrixWorld(true);
    haloHelper.position.setFromMatrixPosition(lampPart.matrixWorld);
    mothCenters.push(haloHelper.position.clone()); // Nattfjärilarna flyger runt glödlampan.
    haloHelper.rotation.set(-CAMERA_PITCH, BILLBOARD_FACING, 0, 'YXZ');
    haloHelper.updateMatrix();
    halos.setMatrixAt(i, haloHelper.matrix);
    halos.setColorAt(i, glowColor);
    pools.setColorAt(i, glowColor);
    bulbs.setColorAt(i, bulbColor);
    // Var femte lykta är "trasig" och flimrar ibland. % 5 === 2 = nummer 2, 7, 12 ...
    lamp.faulty = i % 5 === 2;
    lamp.flickerLeft = 0; // Sekunder kvar av en pågående flimmerattack.
    // lamp.knock(dirX, dirZ): bilen kör över lyktan. Stolpe, arm, hus och lampa välter runt
    // foten; skenet, ljuspölen och lampan släcks. Anropas från collision.js (via hub.js).
    lamp.knock = knockableInstances(lamp.at, [
      { mesh: posts, index: i }, { mesh: arms, index: i }, { mesh: heads, index: i },
      { mesh: bulbs, index: i }, { mesh: halos, index: i },
    ], () => {
      lamp.knocked = true; // updateLamps låter den vara släckt.
      black.set(0, 0, 0);
      halos.setColorAt(i, black);
      pools.setColorAt(i, black);
      bulbs.setColorAt(i, dimBulb.copy(bulbColor).multiplyScalar(0.15));
      halos.instanceColor.needsUpdate = true;
      pools.instanceColor.needsUpdate = true;
      bulbs.instanceColor.needsUpdate = true;
    });
  });
  worldGroup(world).add(posts, arms, heads, bulbs, halos, pools, makeMoths(mothCenters, world.accent));
  lampSets.push({ world, lamps, bulbs, halos, pools, glowColor, bulbColor });
}

// --- Flimmer ---
// En trasig lykta lyser stadigt det mesta av tiden, men får då och då en kort
// "attack" där den blinkar oregelbundet, som ett glappande lysrör.
const FLICKER_CHANCE = 0.25; // Chans per sekund att en attack börjar. ÄNDRA för oftare/mer sällan.
const FLICKER_LENGTH = 0.8;  // Hur länge en attack håller på, i sekunder (ungefär).
const flickerColor = new THREE.Color();
// Körs en gång per bild. Bara lyktorna i världen bilen är i flimrar.
export function updateLamps(delta) {
  for (const set of lampSets) {
    if (set.world !== currentWorld) continue;
    let changed = false;
    set.lamps.forEach((lamp, i) => {
      if (!lamp.faulty || lamp.knocked) return;
      let brightness = 1;
      if (lamp.flickerLeft > 0) {
        lamp.flickerLeft -= delta;
        brightness = Math.random() < 0.45 ? 0.12 : 1; // Nästan släckt eller tänd, slumpat varje bild.
        if (lamp.flickerLeft <= 0) brightness = 1;    // Attacken är slut: tänd igen.
      } else if (Math.random() < FLICKER_CHANCE * delta) {
        lamp.flickerLeft = FLICKER_LENGTH * (0.5 + Math.random());
      } else {
        return; // Lyser stadigt: inget att ändra.
      }
      // Svart (0) = "lägg inte till något ljus" med AdditiveBlending.
      flickerColor.copy(set.glowColor).multiplyScalar(brightness);
      set.halos.setColorAt(i, flickerColor);
      set.pools.setColorAt(i, flickerColor);
      flickerColor.copy(set.bulbColor).multiplyScalar(0.25 + brightness * 0.75); // Glödlampan blir aldrig helt svart.
      set.bulbs.setColorAt(i, flickerColor);
      changed = true;
    });
    // Skicka de nya färgerna till grafikkortet – bara om något ändrats.
    if (changed) {
      set.halos.instanceColor.needsUpdate = true;
      set.pools.instanceColor.needsUpdate = true;
      set.bulbs.instanceColor.needsUpdate = true;
    }
  }
}
