// ============================================================================
// gravel.js — vägens grus som en liten bild. Vägarna (roads.js) lägger den som kakel, och
// parkeringsfickorna (billboards.js) ritar samma korn, så att fickan och uppfarten har exakt
// samma färg och karaktär.
// ============================================================================
import * as THREE from 'three';
import { PALETTE } from './core.js';

export function makeGravelImage(GRAVEL_PIXELS) {
  const gravelImage = document.createElement('canvas');
  gravelImage.width = GRAVEL_PIXELS;
  gravelImage.height = GRAVEL_PIXELS;
  const gravelPen = gravelImage.getContext('2d');
  gravelPen.fillStyle = PALETTE.gravel;
  gravelPen.fillRect(0, 0, GRAVEL_PIXELS, GRAVEL_PIXELS);
  // Allt ritas i nio kopior (±bildens storlek) så att det som går över kanten kommer in på
  // andra sidan. Då syns ingen skarv där kopiorna möts.
  function drawWrapped(draw) {
    const x = Math.random() * GRAVEL_PIXELS;
    const y = Math.random() * GRAVEL_PIXELS;
    for (const ox of [-GRAVEL_PIXELS, 0, GRAVEL_PIXELS]) {
      for (const oy of [-GRAVEL_PIXELS, 0, GRAVEL_PIXELS]) draw(x + ox, y + oy);
    }
  }
  const lightColor = new THREE.Color(PALETTE.gravelLight);
  const darkColor = new THREE.Color(PALETTE.gravelDark);
  // 1) Stora, svaga fläckar: jorden är inte lika ljus överallt.
  for (let i = 0; i < 38; i++) {
    const radius = 20 + Math.random() * 40;
    const color = (i % 2 === 0 ? lightColor : darkColor).getStyle();
    drawWrapped((x, y) => {
      const blotch = gravelPen.createRadialGradient(x, y, 0, x, y, radius);
      blotch.addColorStop(0, color.replace('rgb(', 'rgba(').replace(')', ', 0.16)'));
      blotch.addColorStop(1, color.replace('rgb(', 'rgba(').replace(')', ', 0)'));
      gravelPen.fillStyle = blotch;
      gravelPen.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    });
  }
  // 2) Småstenar: runda, olika stora och olika färg, med en mörk skugga under.
  for (let i = 0; i < 380; i++) {
    const radiusX = 1.6 + Math.random() * 3.4;
    const radiusY = radiusX * (0.6 + Math.random() * 0.4);
    const angle = Math.random() * Math.PI;
    const stone = lightColor.clone().lerp(darkColor, Math.random()).getStyle();
    drawWrapped((x, y) => {
      gravelPen.fillStyle = 'rgba(60, 45, 35, 0.35)';
      gravelPen.beginPath();
      gravelPen.ellipse(x + 0.8, y + 1, radiusX, radiusY, angle, 0, Math.PI * 2);
      gravelPen.fill();
      gravelPen.fillStyle = stone;
      gravelPen.beginPath();
      gravelPen.ellipse(x, y, radiusX, radiusY, angle, 0, Math.PI * 2);
      gravelPen.fill();
    });
  }
  // 3) Fint damm: tusentals små prickar som tar bort den släta känslan.
  for (let i = 0; i < 1400; i++) {
    gravelPen.fillStyle = i % 2 === 0 ? 'rgba(255, 245, 230, 0.18)' : 'rgba(70, 50, 35, 0.2)';
    const x = Math.random() * GRAVEL_PIXELS;
    const y = Math.random() * GRAVEL_PIXELS;
    gravelPen.fillRect(x, y, 1.2, 1.2);
  }
  return gravelImage;
}
