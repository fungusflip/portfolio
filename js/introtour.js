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
  legTime: 8,         // Sekunder per sträcka mellan två stopp.
  returnTime: 14,     // Sekunder för hemvägen till garaget (längre sträcka).
  glide: 0.4,         // Fart vid ett mellanstopp, som andel av sträckans medelfart: 0 = stannar helt, 1 = ingen avmattning.
  smoothRadius: 10,   // Mittlinjen glättas över +-så här många enheter, så att kurvorna inte får vassa hörn.
  followRate: 3,      // Siktpunkten hänger efter målet med den här damp-hastigheten (lägre = mjukare).
  lookUp: 7,          // Hur långt UPP på skärmen siktpunkten ligger ovanför vägen, så att skylten hamnar i bild.
  blendIn: 1.2,       // damp-hastighet in (lägre = mjukare).
  blendOut: 2.5,      // damp-hastighet ut, när man startar (samma som introShift).
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
  // Garagevyn glider över till vägen. Övergången sträcker sig över första TVÅ sträckorna (inte bara den första),
  // så att den aldrig behöver vara snabb när kameran redan åker fort (hemvägen passerar samma plats).
  const fadeEnd = stops.length > 1 ? stops[1] : (stops[0] || 1);

  // Mittlinjen, tätt samplad och glättad (tre boxfilter ≈ en gauss), så att riktningen byts mjukt vid skarvarna
  // i vägens korta raka bitar. Kameran får inga ryck i sidled. Ändarna hålls fast (klamrade).
  const STEP = 0.5;
  const maxS = path.length ? path[path.length - 1].s : 0;
  const count = Math.max(2, Math.ceil(maxS / STEP) + 1);
  let right = new Float64Array(count);
  let down = new Float64Array(count);
  {
    let k = 0;
    for (let i = 0; i < count; i++) {
      const s = Math.min(maxS, i * STEP);
      while (k < path.length - 2 && path[k + 1].s < s) k++;
      const a = path[k];
      const b = path[Math.min(k + 1, path.length - 1)];
      const span = b.s - a.s;
      const t = span > 1e-6 ? Math.min(1, Math.max(0, (s - a.s) / span)) : 0;
      right[i] = a.right + (b.right - a.right) * t;
      down[i] = a.down + (b.down - a.down) * t;
    }
    const w = Math.max(0, Math.round(o.smoothRadius / STEP / 3)); // Tre pass, så varje pass är ~1/3 av radien.
    const blur = (src) => {
      const out = new Float64Array(count);
      for (let i = 0; i < count; i++) {
        let sum = 0;
        for (let j = -w; j <= w; j++) sum += src[Math.min(count - 1, Math.max(0, i + j))];
        out[i] = sum / (2 * w + 1);
      }
      return out;
    };
    for (let pass = 0; pass < 3 && w > 0; pass++) { right = blur(right); down = blur(down); }
  }
  // Mittlinjens punkt vid sträckan s: kubisk Catmull-Rom mellan de glättade samplen, så att även
  // riktningen (inte bara läget) är kontinuerlig och kameran inte får mikroskakningar i varje sampel.
  function catmull(arr, i, t) {
    const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(count - 1, i + 2)];
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function roadAt(s, out) {
    const f = Math.min(count - 1, Math.max(0, s / STEP));
    const i = Math.min(count - 2, Math.floor(f));
    const t = f - i;
    out.right = catmull(right, i, t);
    out.down = catmull(down, i, t);
  }

  // Tidslinjen som nyckelbilder { t, s, v }: sträcka och fart. Mellan nycklarna ett kubiskt Hermite-
  // segment, så farten är kontinuerlig överallt: ingen stannar-och-startar-om vid skyltarna. Vid
  // mellanstopp är farten bara `glide` av medelfarten (kameran dröjer, men står inte still). Vändpunkten
  // (sista stoppet) och garaget har fart 0, eftersom riktningen byts där.
  const keys = [{ t: 0, s: 0, v: 0 }, { t: o.startHold, s: 0, v: 0 }];
  {
    let time = o.startHold;
    let prev = 0;
    stops.forEach((stopS_, i) => {
      time += o.legTime;
      const last = i === stops.length - 1;
      const avg = (stopS_ - prev) / o.legTime;
      keys.push({ t: time, s: stopS_, v: last ? 0 : avg * o.glide });
      prev = stopS_;
    });
    if (stops.length) keys.push({ t: time + o.returnTime, s: 0, v: 0 });
  }
  // Hermite kräver att farten i en ände inte överstiger ~3x medelfarten, annars översvänger s. Klampa.
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    const avg = Math.abs(b.s - a.s) / dt;
    const cap = 2.5 * avg;
    a.v = Math.sign(a.v || (b.s - a.s)) * Math.min(Math.abs(a.v), cap) * (a.v === 0 ? 0 : 1);
    b.v = Math.sign(b.v || (a.s - b.s)) * Math.min(Math.abs(b.v), cap) * (b.v === 0 ? 0 : 1);
  }

  // Sträckan längs vägen vid tidpunkten t (sekunder, loopar).
  function sAt(t) {
    if (keys.length < 3) return 0;
    const time = ((t % duration) + duration) % duration;
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (time <= b.t) {
        const dt = b.t - a.t;
        if (dt <= 0) return b.s;
        const u = (time - a.t) / dt;
        const u2 = u * u, u3 = u2 * u;
        // Hermite-basfunktioner: position och fart i båda ändar.
        return (2 * u3 - 3 * u2 + 1) * a.s + (u3 - 2 * u2 + u) * dt * a.v
          + (-2 * u3 + 3 * u2) * b.s + (u3 - u2) * dt * b.v;
      }
    }
    return 0;
  }

  const probe = { right: 0, down: 0 }; // Återanvänds (inga nya objekt per bild).
  const start = { right: 0, down: 0 }; // Mittlinjens första punkt (där turen börjar på vägen).
  roadAt(0, start);
  const tour = {
    duration,
    time: 0,               // Turens klocka (sekunder). Står still när turen inte är aktiv.
    blend: 0,              // 0 = vanliga introvyn, 1 = full tur. Glider med damp.
    s: 0,                  // Aktuell sträcka längs vägen.
    right: 0,              // Förskjutning från garagevyn: åt höger (skärmens enheter) ... (efterhängande, mjukad)
    down: 0,               // ... och nedåt.
    goalRight: 0,          // Samma sak men exakt, utan efterhäng. update() mjukar right/down mot dessa.
    goalDown: 0,
    roadRight: home.right, // Mittlinjens punkt (utan lookUp), för skyltarnas "vakna"-avstånd.
    roadDown: home.down,
    // Sätt klockan och räkna ut förskjutningen. Används av update() och av testerna.
    seek(t) {
      tour.time = t;
      const s = sAt(t);
      tour.s = s;
      roadAt(s, probe);
      // w: 0 i garaget, 1 när övergången är klar. Mjukare än smoothstep (noll även i andraderivatan), så
      // att övergången inte ger något ryck i accelerationen.
      const u = Math.min(1, Math.max(0, s / fadeEnd));
      const w = u * u * u * (u * (u * 6 - 15) + 10);
      tour.roadRight = probe.right;
      tour.roadDown = probe.down;
      // Siktpunkten: vägens egen rörelse (probe - roadAt(0)) + den KONSTANTA skillnaden garagevy → väg, uppflyttad
      // lookUp (skylten ligger ovanför vägen), som tonas in med w. Bara den konstanta delen multipliceras med w,
      // annars skulle w:s derivata gånger hela vägsträckan ge en kraftig acceleration.
      tour.goalRight = (probe.right - start.right) + (start.right - home.right) * w;
      tour.goalDown = (probe.down - start.down) + (start.down - o.lookUp - home.down) * w;
      tour.right = tour.goalRight; // seek hoppar rakt dit (tester, återställning); update() mjukar.
      tour.down = tour.goalDown;
    },
    // En gång per bild. active = turen ska gå (startskärmen uppe, ingen lista, inget reduced-motion ...).
    update(delta, active) {
      tour.blend = damp(tour.blend, active ? 1 : 0, active ? o.blendIn : o.blendOut, delta);
      if (active && keys.length > 2) {
        const keepRight = tour.right, keepDown = tour.down;
        tour.seek(tour.time + delta);
        // Siktpunkten hänger efter målet en aning: små ojämnheter jämnas ut och farten blir aldrig ryckig.
        tour.right = damp(keepRight, tour.goalRight, o.followRate, delta);
        tour.down = damp(keepDown, tour.goalDown, o.followRate, delta);
      } else if (!active && tour.blend < 0.001) {
        tour.blend = 0;
        if (tour.time !== 0) tour.seek(0); // Nästa gång: börja om vid garaget.
      }
    },
  };
  tour.seek(0);
  return tour;
}
