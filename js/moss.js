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

// Mossgrönt som gångras med stenens färg: gör en gråbrun sten mörkt olivgrön.
export const MOSS_MULTIPLIER = [0.5, 0.85, 0.4];
// Lav: varm orange (gångras med grått, så >1 i rött).
export const LICHEN_MULTIPLIER = [1.5, 0.8, 0.22];

// Målar en NON-indexerad form (t.ex. IcosahedronGeometry) triangel för triangel, så att varje
// platt yta får en egen färg. Ändrar formen på plats och returnerar den.
//   mossAmount  0–1: hur mycket moss (0.5 = ytor som pekar rakt upp blir gröna, sidorna fläckvis)
//   damp        0–1: hur mörk den fuktiga foten blir
//   lichen      chans per yta att vara en orange lavfläck
//   seed        gör att olika former får olika fläckar
export function paintStone(geometry, { moss = MOSS_MULTIPLIER, mossAmount = 0.5, damp = 0.4, lichen = 0.04, seed = 0 } = {}) {
  geometry.computeVertexNormals(); // Utan delade hörn ger det en platt normal per triangel.
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  geometry.computeBoundingBox();
  const minY = geometry.boundingBox.min.y;
  const spanY = Math.max(1e-6, geometry.boundingBox.max.y - minY);
  const colors = new Float32Array(position.count * 3);
  for (let face = 0; face < position.count; face += 3) {
    const cx = (position.getX(face) + position.getX(face + 1) + position.getX(face + 2)) / 3;
    const cy = (position.getY(face) + position.getY(face + 1) + position.getY(face + 2)) / 3;
    const cz = (position.getZ(face) + position.getZ(face + 1) + position.getZ(face + 2)) / 3;
    const up = normal.getY(face); // 1 = pekar rakt upp, -1 = rakt ner.
    // Fläckigt: litet brus per yta + ett större vågmönster över hela stenen.
    const fine = hash(cx * 17 + seed, cy * 17, cz * 17) - 0.5;
    const coarse = Math.sin(cx * 4 + seed * 3) * Math.sin(cz * 4 + cy * 3 + seed);
    const mask = smooth(0.1, 0.5, up + mossAmount - 0.45 + fine * 0.7 + coarse * 0.4);
    const wet = 1 - damp * (1 - smooth(0.05, 0.55, (cy - minY) / spanY)); // Mörkare nära botten.
    let r = 1 + (moss[0] - 1) * mask;
    let g = 1 + (moss[1] - 1) * mask;
    let b = 1 + (moss[2] - 1) * mask;
    if (up > 0.2 && mask < 0.7 && hash(cx * 9 + seed, cy * 9 + 5, cz * 9) < lichen) {
      [r, g, b] = LICHEN_MULTIPLIER;
    }
    for (let k = 0; k < 3; k++) {
      colors.set([r * wet, g * wet, b * wet], (face + k) * 3);
    }
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

// En stenfärg för en spridd sten: grått mellan ljus och mörkt, ofta lite mossig, ibland
// helt övervuxen. Returnerar en ny Color.
export function stoneTint(light, dark, mossColor) {
  const color = light.clone().lerp(dark, Math.random());
  const roll = Math.random();
  if (roll < 0.1) color.lerp(mossColor, 0.75);      // Helt mossbeväxt.
  else if (roll < 0.32) color.lerp(mossColor, 0.35); // Lite grön.
  return color;
}
