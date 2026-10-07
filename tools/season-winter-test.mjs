// Node-test: ger säsongskonfigen i vinter det den ska (inga löv). Kör: node tools/season-winter-test.mjs
import { getSeasonState, getSeasonConfig } from '../js/season.js';

let failed = 0;
function check(label, ok) { console.log((ok ? 'ok   ' : 'FAIL ') + label); if (!ok) failed++; }
const cases = [
  ['?season=winter', undefined],
  ['', new Date(2026, 0, 15)],
  ['', new Date(2026, 11, 10)],
  ['', new Date(2026, 1, 28)],
  ['?date=2026-12-24', undefined],
  ['?season=christmas', undefined],
];
for (const [search, now] of cases) {
  const state = getSeasonState(search, now);
  const f = state.config.foliage || {};
  console.log(search || '(date)', now ? now.toDateString() : '', '->', state.names.join(','));
  check('  foliage.groundLeaves === 0', f.groundLeaves === 0);
  check('  foliage.fallingLeaves === 0', f.fallingLeaves === 0);
  check('  foliage.leafLitter === 0', f.leafLitter === 0);
  check('  modules.winter', !!(state.config.modules && state.config.modules.winter));
}
// Som i webbläsaren: location.search läses av getSeasonConfig (cachad en gång).
globalThis.location = { search: '?season=winter' };
const f = getSeasonConfig().foliage;
check('getSeasonConfig() with location ?season=winter -> groundLeaves 0', f && f.groundLeaves === 0);
check('autumn keeps leaves', !(getSeasonState('?season=autumn').config.foliage));
process.exit(failed ? 1 : 0);
