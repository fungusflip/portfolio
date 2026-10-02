// ============================================================================
// worlds/common.js — det som alla "andra" världar har: en egen mark med eget mönster,
// skyltraden med väg och lyktor, och teleportplattan hem.
// ============================================================================
import * as THREE from 'three';
import { GROUND_SIZE, TILE_PIXELS, TILE_UNITS, toTheRight, towardCamera, worldGroup, makeEdgeFade, makeTileTexture } from '../core.js';
import { buildBillboards, billboards, ROW_UP } from '../billboards.js';
import { ROAD_DISTANCE, buildRoads, billboardDriveways } from '../roads.js';
import { buildLamps, rowLamps } from '../lamps.js';
import { padIn, buildPortal } from '../portals.js';

// Bygger grunden i en värld. drawPattern är en funktion som får en penna och ritar
// markens mönster – så skickar varje värld in sitt eget, medan resten är likadant.
export function buildWorldBasics(world, drawPattern) {
  // --- Marken ---
  const image = document.createElement('canvas');
  image.width = TILE_PIXELS;
  image.height = TILE_PIXELS;
  drawPattern(image.getContext('2d'));
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshLambertMaterial({ map: makeTileTexture(image, GROUND_SIZE / TILE_UNITS) })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(world.x, 0, world.z);
  ground.renderOrder = -10; // Samma lager som hemvärldens mark (se roads.js).
  worldGroup(world).add(ground);
  makeEdgeFade(world);

  // --- Skyltarna, vägarna och lyktorna ---
  buildBillboards(world);
  const pad = padIn(world);
  const row = billboards.filter((billboard) => billboard.project.world === world);
  const first = row[0].project;
  const last = row[row.length - 1].project;
  buildRoads(world, [
    // Huvudvägen längs skyltraden, från en bit till vänster om första skylten till en bit
    // till höger om den sista.
    { from: toTheRight(towardCamera(first, ROAD_DISTANCE), -6), to: toTheRight(towardCamera(last, ROAD_DISTANCE), 6) },
    // Från plattan (där man kommer upp) rakt upp till huvudvägen. Raden står ROW_UP ovanför mitten.
    { from: pad.at, to: towardCamera(world, ROAD_DISTANCE - ROW_UP) },
    ...billboardDriveways(world),
  ]);
  buildLamps(world, rowLamps(world));
  buildPortal(pad);
}

// Platser runt plattan där varje värld ställer sin dekoration, nedanför huvudvägen så
// att den inte skymmer skyltarna: [vänster, höger, höger längre ner].
export function decorSpots(world) {
  return [
    toTheRight(towardCamera(world, 6), -14),
    toTheRight(towardCamera(world, 6), 14),
    toTheRight(towardCamera(world, 13), 14),
  ];
}
