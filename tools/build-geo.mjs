/**
 * Convierte los TopoJSON de world-atlas (110m) en un formato plano y compacto
 * que el cliente puede consumir sin librerías externas.
 *
 * Salida: data/world.json
 *   { land: [Float32-friendly arrays [lon,lat,lon,lat,...]],
 *     countries: [{ id, name, rings: [[lon,lat,...], ...] }] }
 *
 * Uso: node tools/build-geo.mjs <dir-con-topojson>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) {
  console.error('uso: node tools/build-geo.mjs <dir-con-topojson>');
  process.exit(1);
}

const PREC = 100; // 2 decimales

function decodeArcs(topo) {
  const { scale, translate } = topo.transform;
  return topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    const out = new Array(arc.length);
    for (let i = 0; i < arc.length; i++) {
      x += arc[i][0];
      y += arc[i][1];
      out[i] = [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    }
    return out;
  });
}

function ringFromArcIndexes(arcs, indexes) {
  const pts = [];
  for (const idx of indexes) {
    const reversed = idx < 0;
    const arc = arcs[reversed ? ~idx : idx];
    const seq = reversed ? arc.slice().reverse() : arc;
    // evita duplicar el punto de unión entre arcos consecutivos
    for (let i = pts.length ? 1 : 0; i < seq.length; i++) pts.push(seq[i]);
  }
  const flat = [];
  let last = null;
  for (const [lon, lat] of pts) {
    const a = Math.round(lon * PREC) / PREC;
    const b = Math.round(lat * PREC) / PREC;
    if (last && last[0] === a && last[1] === b) continue; // colapsa duplicados
    flat.push(a, b);
    last = [a, b];
  }
  return flat;
}

function polygonsOf(geom, arcs) {
  const rings = [];
  const push = (poly) => {
    for (const ringIdx of poly) {
      const r = ringFromArcIndexes(arcs, ringIdx);
      if (r.length >= 8) rings.push(r); // descarta islotes degenerados
    }
  };
  if (geom.type === 'Polygon') push(geom.arcs);
  else if (geom.type === 'MultiPolygon') geom.arcs.forEach(push);
  else if (geom.type === 'GeometryCollection') {
    for (const g of geom.geometries) rings.push(...polygonsOf(g, arcs));
  }
  return rings;
}

const landTopo = JSON.parse(readFileSync(join(src, 'land-110m.json'), 'utf8'));
const cTopo = JSON.parse(readFileSync(join(src, 'countries-110m.json'), 'utf8'));

const landArcs = decodeArcs(landTopo);
const land = polygonsOf(landTopo.objects.land, landArcs);

const cArcs = decodeArcs(cTopo);
const countries = cTopo.objects.countries.geometries
  .map((g) => ({
    id: g.id,
    name: g.properties?.name ?? '',
    rings: polygonsOf(g, cArcs),
  }))
  .filter((c) => c.rings.length);

mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(
  join(root, 'data', 'world.json'),
  JSON.stringify({ meta: { source: 'Natural Earth 110m vía world-atlas', precision: '0.01°' }, land, countries })
);

const bytes = readFileSync(join(root, 'data', 'world.json')).length;
console.log(`land: ${land.length} anillos | países: ${countries.length} | ${(bytes / 1024).toFixed(0)} KB`);
