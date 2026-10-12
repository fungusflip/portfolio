// ============================================================================
// introtour.js — den lugna kameraturen på startskärmen.
// ============================================================================
// Medan startskärmen är uppe glider kameran sakta längs vägen förbi de första skyltarna
// och tillbaka till garaget, så att besökaren ser att det finns projekt där ute. Bilen
// står kvar i garaget: det är bara kamerans siktpunkt som flyttas.
//
// Den här filen är ren matematik (inget THREE, inget DOM) så att den går att testa i Node.
// main.js äger klockan och använder resultatet:
//   const tour = createIntroTour(routePath(), stopS, home, TOUR_DEFAULTS);
//   tour.update(delta, active);                       // en gång per bild
//   tour.right * tour.blend, tour.down * tour.blend   // förskjutning av siktpunkten, i skärmens
//                                                     // höger/ned-enheter, 0 = vanliga introvyn
//   tour.roadRight, tour.roadDown                     // vägens mittlinje under siktpunkten

// Standardvärden: ÄNDRA här för snabbare/långsammare tur.
export const TOUR_DEFAULTS = {
  startHold: 2,       // Sekunder stilla i garagevyn innan turen börjar (så att man hinner se texten).
  legTime: 7,         // Sekunder per sträcka mellan två stopp (glid + stillastående vid stoppet).
  returnTime: 11,     // Sekunder för hemvägen till garaget (längre sträcka).
  holdFraction: 0.18, // Andel av en sträcka som är helt stilla i vardera änden (dvs. dröjer vid skylten).
  lookUp: 7,          // Hur långt UPP på skärmen siktpunkten ligger ovanför vägen, så att skylten hamnar i bild.
  blendIn: 1.2,       // damp-hastighet in (lägre = mjukare).
  blendOut: 2.5,      // damp-hastighet ut, när man startar (samma som introShift).
};

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const damp = (current, goal, lambda, delta) => goal + (current - goal) * Math.exp(-lambda * delta);

// path   – routePath(): [{ right, down, s }] i stigande s.
// stopS  – s-värdena (sträcka från garaget) för de stopp turen ska dröja vid, stigande.
// home   – { right, down }: garagevyns plats (ROUTE.districts.home). Förskjutningen räknas härifrån.
export function createIntroTour(path, stopS, home, options = {}) {
  const o = { ...TOUR_DEFAULTS, ...options };
  const stops = stopS.filter((s) => s > 0);
  // Tidslinjen: startHold + en sträcka till varje stopp + hemväg. Varje sträcka = { from, to, start, length }.
  const legs = [];
  let clock = o.startHold;
  let previous = 0;
  for (const s of stops) {
    legs.push({ from: previous, to: s, start: clock, length: o.legTime });
    clock += o.legTime;
    previous = s;
  }
  if (stops.length) {
    legs.push({ from: previous, to: 0, start: clock, length: o.returnTime });
    clock += o.returnTime;
  }
  const duration = clock;
  const fadeEnd = stops.length ? stops[0] : 1; // Garagevyn glider över till vägen på första sträckan.

  // Mittlinjens punkt vid sträckan s (linjär mellan punkterna). Skriver till out.
  let cursor = 0; // Minns var i listan vi var: tiden går framåt, så sökningen blir nästan gratis.
  function roadAt(s, out) {
    if (cursor >= path.length - 1 || path[cursor].s > s) cursor = 0;
    while (cursor < path.length - 2 && path[cursor + 1].s < s) cursor++;
    const a = path[cursor];
    const b = path[Math.min(cursor + 1, path.length - 1)];
    const span = b.s - a.s;
    const t = span > 1e-6 ? Math.min(1, Math.max(0, (s - a.s) / span)) : 0;
    out.right = a.right + (b.right - a.right) * t;
    out.down = a.down + (b.down - a.down) * t;
  }

  // Sträckan längs vägen vid tidpunkten t (sekunder, loopar). Stilla vid ändarna (holdFraction).
  function sAt(t) {
    if (!legs.length) return 0;
    const time = ((t % duration) + duration) % duration;
    if (time < o.startHold) return 0;
    for (const leg of legs) {
      if (time < leg.start + leg.length) {
        const u = (time - leg.start) / leg.length;
        const eased = smoothstep(o.holdFraction, 1 - o.holdFraction, u); // Mjuk start och stopp, dröjer i ändarna.
        return leg.from + (leg.to - leg.from) * eased;
      }
    }
    return 0;
  }

  const probe = { right: 0, down: 0 }; // Återanvänds (inga nya objekt per bild).
  const tour = {
    duration,
    time: 0,               // Turens klocka (sekunder). Står still när turen inte är aktiv.
    blend: 0,              // 0 = vanliga introvyn, 1 = full tur. Glider med damp.
    s: 0,                  // Aktuell sträcka längs vägen.
    right: 0,              // Förskjutning från garagevyn: åt höger (skärmens enheter) ...
    down: 0,               // ... och nedåt.
    roadRight: home.right, // Mittlinjens punkt (utan lookUp), för skyltarnas "vakna"-avstånd.
    roadDown: home.down,
    // Sätt klockan och räkna ut förskjutningen. Används av update() och av testerna.
    seek(t) {
      tour.time = t;
      const s = sAt(t);
      tour.s = s;
      roadAt(s, probe);
      const w = smoothstep(0, fadeEnd, s); // 0 i garaget, 1 vid första stoppet.
      tour.roadRight = probe.right;
      tour.roadDown = probe.down;
      // Siktpunkten: garagevyn → vägen UPPFLYTTAD lookUp (skylten ligger ovanför vägen).
      tour.right = (probe.right - home.right) * w;
      tour.down = (probe.down - o.lookUp - home.down) * w;
    },
    // En gång per bild. active = turen ska gå (startskärmen uppe, ingen lista, inget reduced-motion ...).
    update(delta, active) {
      tour.blend = damp(tour.blend, active ? 1 : 0, active ? o.blendIn : o.blendOut, delta);
      if (active && legs.length) tour.seek(tour.time + delta);
      else if (!active && tour.blend < 0.001) {
        tour.blend = 0;
        if (tour.time !== 0) tour.seek(0); // Nästa gång: börja om vid garaget.
      }
    },
  };
  tour.seek(0);
  return tour;
}
