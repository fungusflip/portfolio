// ============================================================================
// js/season-winter.js — vinterns extra saker (snö, is, snögubbar, julbelysning ...)
// ============================================================================
// Hämtas av seasonfx.js bara när den gällande configen har modules.winter (se RULES i season.js).
// Fyll i fälten du behöver (alla är valfria); gemensamma verktyg finns i js/seasonkit.js. Kontraktet står i
// seasonfx.js under "Hook-API för säsongsmoduler":
//   prepare(ctx, config)       - före buildHubCollision
//   build(ctx, config)         - efter buildHubCollision (spotOk, addObstacles, addUpdater ...)
//   afterOptimize(config)      - efter optimizeWorld(hub)
//   update(delta, car, config) - varje bild
export default {
  name: 'winter',
};
