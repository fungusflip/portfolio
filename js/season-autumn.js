// ============================================================================
// js/season-autumn.js — höstens extra saker (lövhögar, dimma, gäss ...)
// ============================================================================
// Hämtas av seasonfx.js bara när den gällande configen har modules.autumn (se RULES i season.js).
// Fyll i fälten du behöver (alla är valfria); gemensamma verktyg finns i js/seasonkit.js. Kontraktet står i
// seasonfx.js under "Hook-API för säsongsmoduler":
//   prepare(ctx, config)       - före buildHubCollision
//   build(ctx, config)         - efter buildHubCollision (spotOk, addObstacles, addUpdater ...)
//   afterOptimize(config)      - efter optimizeWorld(hub)
//   update(delta, car, config) - varje bild
export default {
  name: 'autumn',
};
