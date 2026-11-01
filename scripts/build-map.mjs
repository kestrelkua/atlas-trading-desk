// Bakes the War Room map: real coastlines (Natural Earth via world-atlas),
// with real countries merged into the fictional nations. Writes src/mapdata.ts.
// Run with: npm run build-map
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature, merge, mesh } from 'topojson-client';
import { geoCentroid, geoContains, geoGraticule10, geoInterpolate, geoNaturalEarth1, geoPath } from 'd3-geo';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'));

const W = 1000;
const H = 500;

/** Real countries (ISO 3166 numeric) assigned by hand; the rest fall back to region rules below. */
const EXPLICIT = {
  apologia: [124, 304],
  debts: [840],
  brittle: [826, 372],
  grevance: [250, 724, 620, 380, 56, 442],
  discretia: [756],
  bleak: [643, 112, 398],
  crude: [682, 784, 364, 368, 414, 634, 512, 887, 400, 760, 376, 792, 275, 422, 48],
  monsoonia: [356, 586, 50, 524, 144, 64, 4],
  deflatia: [392],
  orestralia: [36, 554, 598, 90, 548],
  cobaltia: [818],
};
const byId = new Map(Object.entries(EXPLICIT).flatMap(([k, ids]) => ids.map((id) => [id, k])));

function nation(g) {
  const k = byId.get(Number(g.id));
  if (k) return k;
  const [lo, la] = geoCentroid(feature(topo, g));
  if (lo < -30) return la > 15 ? 'debts' : 'volatilia';
  if (la > 35 && lo < 45) return 'austeria';
  if (la > 35 && lo < 95) return 'bleak';
  if (lo < 52 && la < 38) return 'cobaltia';
  if (lo > 110 && la < -8) return 'orestralia';
  if (lo > 60) return 'supplychina';
  return 'crude';
}

const geoms = topo.objects.countries.geometries.filter((g) => g.id !== '010');
geoms.forEach((g) => (g.nation = nation(g)));
const coll = { type: 'GeometryCollection', geometries: geoms };

const proj = geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], feature(topo, coll));
const path = geoPath(proj).digits(1);
const P = (lo, la) => proj([lo, la]).map((v) => Math.round(v * 10) / 10);

const nations = [...new Set(geoms.map((g) => g.nation))];
const countries = Object.fromEntries(nations.map((n) => [n, path(merge(topo, geoms.filter((g) => g.nation === n)))]));

const borders = {};
for (let i = 0; i < nations.length; i++)
  for (let j = i + 1; j < nations.length; j++) {
    const [a, b] = [nations[i], nations[j]];
    const d = path(mesh(topo, coll, (x, y) => (x.nation === a && y.nation === b) || (x.nation === b && y.nation === a)));
    if (d) borders[[a, b].sort().join('|')] = d;
  }

/** Label spots: [lon, lat] of the text, plus an optional [lon, lat] the leader line points to. */
const LABELS = {
  apologia: [[-100, 60]],
  debts: [[-100, 39]],
  volatilia: [[-58, -12]],
  brittle: [[-24, 60], [-2, 53.5]],
  grevance: [[-22, 43], [1, 46]],
  discretia: [[5, 69], [8.2, 46.8]],
  austeria: [[22, 50]],
  bleak: [[95, 62]],
  cobaltia: [[20, 4]],
  crude: [[38, 21]],
  monsoonia: [[80, 17]],
  supplychina: [[104, 32]],
  deflatia: [[152, 44], [138, 36]],
  orestralia: [[133, -25]],
};
const labels = Object.fromEntries(
  Object.entries(LABELS).map(([k, [at, from]]) => [k, { at: P(...at), ...(from ? { from: P(...from) } : {}) }]),
);

const PLACES = {
  hormuzzle: { at: [56.3, 26.4], label: [62, 4] },
  sueus: { at: [32.5, 30.5], label: [24, 28] },
  fab: { at: [120.5, 24], label: [140, 16] },
};
const places = Object.fromEntries(Object.entries(PLACES).map(([k, p]) => [k, { at: P(...p.at), label: P(...p.label) }]));

/** Sea lanes must stay at sea: warn about any stretch that cuts across the drawn land. */
const land = feature(topo, coll);
function checkSea(id, pts) {
  for (let i = 0; i < pts.length - 1; i++) {
    const f = geoInterpolate(pts[i], pts[i + 1]);
    for (let t = 0; t <= 1; t += 0.04) {
      const p = f(t);
      const canal = p[0] > 31.8 && p[0] < 34.2 && p[1] > 27.5 && p[1] < 31.4; // the Sue-Us Canal and its gulf are too narrow to draw at this scale
      if (!canal && land.features.some((c) => geoContains(c, p))) {
        console.warn(`lane ${id}: segment ${i} crosses land near [${p.map((v) => v.toFixed(1))}]`);
        break;
      }
    }
  }
}
const line = (coordinates, id) => {
  if (id) checkSea(id, coordinates);
  return path({ type: 'LineString', coordinates });
};
const lanes = {
  hormuzzle: line([[51.5, 27], [54.5, 26.4], [56.5, 26.6], [57.8, 25.2], [61, 23], [65, 18], [72, 10], [76.5, 6], [80, 5], [86, 5], [93, 6.5], [96, 7], [98.5, 4.8], [100.4, 3], [101.8, 2.1], [102.8, 1.6], [103.6, 0.9], [104.6, 1.3], [106, 4], [110, 10], [114, 16], [118.5, 22], [119.7, 24.2], [121.5, 27], [123, 30.5]], 'hormuzzle'),
  sueus: line([[56.5, 26.6], [57.8, 25.2], [61, 23], [58, 17], [52.5, 13.8], [48, 12.4], [43.5, 12.6], [41, 15.5], [38.5, 20], [35.8, 24.5], [34.2, 27.3], [33.1, 28.6], [32.5, 30], [32.4, 31.5], [28, 33.5], [20, 34.5], [15.5, 36], [11.8, 37.4], [8, 38.2], [2, 37.5], [-2, 36.1], [-4.5, 35.95], [-5.6, 35.9], [-6.5, 35.9], [-9.5, 36.5], [-10, 42], [-8, 46], [-6, 48.5]], 'sueus'),
  fab: line([[119.7, 24.2], [118.5, 22], [114, 16], [110, 10]], 'fab'),
  atlantic: line([[-74, 40.7], [-0.5, 51.5]]),
};

/** Resource icons, each tied to the basket market it drives. */
const ICONS = [
  ['oil', 49, 27], ['oil', -112, 56], ['oil', 60, 63],
  ['chip', 121, 23.5], ['chip', 128, 36.5], ['chip', 139, 36],
  ['vault', 8.2, 46.8], ['plane', -88, 40], ['plane', 2, 49], ['shield', -78, 37], ['shield', 10, 51],
  ['battery', 25, -6], ['ore', 121, -24],
];
const icons = ICONS.map(([kind, lo, la]) => ({ kind, at: P(lo, la) }));

const out = `// Generated by scripts/build-map.mjs from Natural Earth (public domain). Do not edit.
export const MAP = ${JSON.stringify({ w: W, h: H, sphere: path({ type: 'Sphere' }), graticule: path(geoGraticule10()), countries, borders, labels, places, lanes, icons })};
`;
writeFileSync(new URL('../src/mapdata.ts', import.meta.url), out);
console.log(`nations: ${nations.join(', ')}\nborders: ${Object.keys(borders).length}\nsize: ${(out.length / 1024).toFixed(0)} KB`);
