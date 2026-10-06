// ============================================================================
// moss.js — mossa, fukt och lavfläckar, inbakade i stenarnas hörnfärger (vertex colors).
// ============================================================================
// Stenarna är EN delad form som ritas många gånger (InstancedMesh). Därför bakas mossan in i
// formens hörn i stället för att vara en bild: mossgrönt på ytor som pekar uppåt, mörkare
// "fuktig" fot, och några få orange lavfläckar. Materialet ritas med vertexColors: true, och
// färgen per sten (instanceColor) gångras sedan ovanpå. Allt är fortfarande platt skuggat.
import * as THREE from 'three';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Samma ingångar ger alltid samma slumptal 0–1 (så att delade hörn får samma färg).
const hash = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// Dämpad olivgrön ton som gångras med stenens färg: en grå sten får bara en svag grågrön skjuts,
// aldrig skarpt grönt. (Stenens egen färg dominerar; värdena ligger nära 1.)
export const MOSS_MULTIPLIER = [0.82, 0.95, 0.68];

// Målar en form hörn för hörn, med mjuka övergångar. Färgen är en slät funktion av hörnets PLATS
// (samma plats = samma färg i alla trianglar), så den interpoleras över ytorna i stället för att
// ge hårda fasettfläckar. "Uppåt" är riktningen från stenens mitt (normaliserad plats), inte
// ytans egen normal. Ändrar formen på plats och returnerar den. Lav är borttagen (den blev hård).
//   mossAmount  0–1: hur mycket moss (0.5 = ovansidan grönskimrar, sidorna knappt)
//   damp        0–1: hur mörk den fuktiga foten blir
//   seed        gör att olika former får olika fläckar
export function paintStone(geometry, { moss = MOSS_MULTIPLIER, mossAmount = 0.5, damp = 0.4, seed = 0 } = {}) {
  const position = geometry.attributes.position;
  geometry.computeBoundingBox();
  const minY = geometry.boundingBox.min.y;
  const spanY = Math.max(1e-6, geometry.boundingBox.max.y - minY);
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const length = Math.hypot(x, y, z) || 1;
    const up = y / length; // 1 = rakt upp från mitten, -1 = rakt ner.
    // Lågfrekvent, slätt brus (några få svep över hela stenen).
    const noise = Math.sin(x * 2.3 + seed * 3) * Math.sin(z * 2.1 + y * 1.7 + seed) * 0.5
      + Math.sin(x * 1.1 - z * 1.3 + seed * 5) * 0.3;
    const mask = smooth(-0.2, 0.9, up + mossAmount - 0.5 + noise * 0.45);
    const wet = 1 - damp * (1 - smooth(0.0, 0.6, (y - minY) / spanY)); // Mjukt mörkare nära botten.
    colors.set([
      (1 + (moss[0] - 1) * mask) * wet,
      (1 + (moss[1] - 1) * mask) * wet,
      (1 + (moss[2] - 1) * mask) * wet,
    ], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Samma idé för en mjuk, indexerad form (kantstenarna): färgen räknas per hörn, och brus från
// hörnets plats gör att delade hörn får samma färg. Mossan kryper in från kanterna på ovansidan.
export function paintVertices(geometry, { moss = MOSS_MULTIPLIER, strength = 0.6, damp = 0.35, bottomY = 0, topY = 1 } = {}) {
  geometry.computeVertexNormals();
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const patch = 0.5 + 0.5 * Math.sin(z * 9 + x * 7) * Math.cos(z * 4.3 - x * 3); // Fläckar längs kanten.
    const noise = hash(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50));
    const mask = smooth(0.6, 0.95, normal.getY(i)) * smooth(0.4, 0.85, patch * 0.7 + noise * 0.5) * strength;
    const wet = 1 - damp * (1 - smooth(bottomY, bottomY + (topY - bottomY) * 0.6, y));
    colors.set([
      (1 + (moss[0] - 1) * mask) * wet,
      (1 + (moss[1] - 1) * mask) * wet,
      (1 + (moss[2] - 1) * mask) * wet,
    ], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// En stenfärg för en spridd sten: grått mellan ljus och mörkt, ibland med en svag grön ton. Returnerar en ny Color.
export function stoneTint(light, dark, mossColor) {
  const color = light.clone().lerp(dark, Math.random());
  const roll = Math.random();
  if (roll < 0.15) color.lerp(mossColor, 0.2); // Bara en svag grön ton på en minoritet.
  return color;
}
