/**
 * Comprobación de integridad del Archivo.
 *
 * Los datos son a mano y el renderizador es tolerante: un país mal escrito no
 * rompe nada, simplemente no se pinta. Eso convierte una errata en un error
 * invisible, así que conviene cazarlas aquí.
 *
 * Uso: node tools/validar-datos.mjs
 * Sale con código 1 si encuentra errores (los avisos no hacen fallar).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (f) => JSON.parse(readFileSync(join(raiz, 'data', f), 'utf8'));

const mundo = leer('world.json');
const paises = new Set(mundo.countries.map((c) => c.name));

/** Estados reales por debajo de la resolución 110 m: no hay geometría que pintar. */
const SIN_GEOMETRIA = new Set(['Malta', 'Singapore', 'Maldives', 'Monaco', 'Liechtenstein', 'Andorra', 'San Marino']);

const errores = [];
const avisos = [];
const err = (m) => errores.push(m);
const avi = (m) => avisos.push(m);

const coordOk = (c) => Array.isArray(c) && c.length === 2
  && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90;

function revisarMiembros(donde, miembros) {
  for (const m of miembros || []) {
    if (paises.has(m)) continue;
    if (SIN_GEOMETRIA.has(m)) avi(`${donde}: «${m}» no tiene geometría a 110 m; no se dibujará`);
    else err(`${donde}: país desconocido «${m}»`);
  }
}

function revisarCaja(donde, caja) {
  if (!caja) return;
  if (caja.length !== 4) return err(`${donde}: la caja necesita 4 valores`);
  const [lo0, la0, lo1, la1] = caja;
  if (lo1 <= lo0) err(`${donde}: caja con longitudes invertidas (${lo0} → ${lo1})`);
  if (la1 <= la0) err(`${donde}: caja con latitudes invertidas (${la0} → ${la1})`);
  if (la0 < -90 || la1 > 90) err(`${donde}: latitud fuera de rango`);
}

/* ── entidades políticas ───────────────────────────────────── */

const pol = leer('polities.json');
const ids = new Set();

/** Estratos de control admitidos. '' es la envolvente plana `members`. */
const ESTRATOS = ['', 'core', 'provinces', 'march', 'client', 'tributary', 'contested', 'sphere'];
const VIAS = new Set(['conquista', 'herencia', 'matrimonio', 'tratado', 'sumision', 'colonizacion', 'federacion', 'concesion']);

for (const p of pol.polities) {
  const q = `polities/${p.id}`;
  if (ids.has(p.id)) err(`${q}: id repetido`);
  ids.add(p.id);
  if (!p.name || !p.color || !p.kind) err(`${q}: falta name, color o kind`);
  if (!coordOk(p.capital)) err(`${q}: capital fuera de rango`);
  if (p.to <= p.from) err(`${q}: vigencia invertida (${p.from} → ${p.to})`);
  for (const c of ['base', 'estado', 'limite', 'colapso']) {
    if (!p.dossier?.[c]) err(`${q}: falta dossier.${c}`);
  }
  if (!p.snapshots?.length) err(`${q}: sin instantáneas`);
  let ultimo = -Infinity;
  for (const s of p.snapshots) {
    const r = `${q}@${s.year}`;
    if (s.year <= ultimo) err(`${r}: instantáneas desordenadas`);
    ultimo = s.year;
    if (s.year < p.from - 1 || s.year > p.to + 1) avi(`${r}: instantánea fuera de la vigencia declarada`);
    // Un estrato puede venir suelto o en lista: `provinces` y `march` traen
    // varias zonas nombradas, que es lo que da grano fino al mallado.
    let fiscal = 0;
    for (const clave of ESTRATOS) {
      const bruto = clave === '' ? s : s[clave];
      if (!bruto) continue;
      for (const z of Array.isArray(bruto) ? bruto : [bruto]) {
        const e = clave ? `${r}.${clave}${z.nombre ? `/${z.nombre}` : ''}` : r;
        revisarMiembros(e, z.members);
        revisarCaja(e, z.box);
        for (const b of z.boxes || []) revisarCaja(`${e}.boxes`, b);
        for (const h of z.holes || []) revisarCaja(`${e}.holes`, h);
        for (const pts of z.poly || []) {
          if (!Array.isArray(pts) || pts.length < 3) err(`${e}: polígono con menos de tres vértices`);
          else for (const c of pts) if (!coordOk(c)) err(`${e}: vértice fuera de rango`);
        }
        if (z.via && !VIAS.has(z.via)) err(`${e}: vía de adquisición desconocida «${z.via}»`);
        // No se exige que `desde` caiga dentro de la vigencia: una entidad
        // puede ser una fase de un Estado más antiguo y heredar territorio
        // conquistado antes de su propia fecha de inicio. Lo que sí es un
        // error es haber adquirido algo después de la foto.
        if (z.desde != null && z.desde > s.year) {
          err(`${e}: adquirida en ${z.desde}, después de la instantánea de ${s.year}`);
        }
        for (const [campo, tope] of [['fiscal', 100], ['revuelta', 100]]) {
          const v = z[campo];
          if (v != null && (typeof v !== 'number' || v < 0 || v > tope)) err(`${e}: ${campo} fuera de 0–${tope}`);
        }
        if (clave !== '') fiscal += z.fiscal || 0;
      }
    }
    if (s.provinces && !Array.isArray(s.provinces)) err(`${r}: provinces debe ser una lista`);
    if (fiscal > 108) avi(`${r}: los rendimientos fiscales suman ${fiscal.toFixed(0)} % del erario`);
  }
}

/* ── resto de registros ────────────────────────────────────── */

for (const h of leer('prehistory.json').horizontes) {
  for (const b of h.bands) {
    revisarMiembros(`prehistory/${h.year}/${b.id}`, b.members);
    revisarCaja(`prehistory/${h.year}/${b.id}`, b.box);
  }
}

for (const f of leer('lenguas.json').familias) {
  if (!coordOk(f.urheimat)) err(`lenguas/${f.id}: urheimat fuera de rango`);
  let ultimo = -Infinity;
  for (const e of f.expansion) {
    if (e.year <= ultimo) err(`lenguas/${f.id}: expansión desordenada en ${e.year}`);
    ultimo = e.year;
    revisarMiembros(`lenguas/${f.id}@${e.year}`, e.members);
    revisarCaja(`lenguas/${f.id}@${e.year}`, e.box);
  }
}

const puntos = [
  ['shocks.json', (d) => d.shocks, 'center', 'id'],
  ['weapons.json', (d) => d.tech, 'origin', 'id'],
  ['batallas.json', (d) => d.batallas, 'at', 'id'],
  ['inventos.json', (d) => d.inventos, 'at', 'id'],
  ['eventos.json', (d) => d.eventos, 'at', 't'],
  ['politica.json', (d) => d.instituciones, 'at', 'name'],
];
for (const [archivo, sacar, campo, clave] of puntos) {
  const vistos = new Set();
  for (const x of sacar(leer(archivo))) {
    const q = `${archivo}/${x[clave]}`;
    if (!coordOk(x[campo])) err(`${q}: ${campo} fuera de rango`);
    if (typeof x.year !== 'number') err(`${q}: sin año`);
    if (clave === 'id') {
      if (vistos.has(x.id)) err(`${q}: id repetido`);
      vistos.add(x.id);
    }
  }
}

for (const c of leer('ciudades.json').ciudades) {
  if (!coordOk(c.c)) err(`ciudades/${c.n}: coordenada fuera de rango`);
  let ultimo = -Infinity;
  for (const [a] of c.p) {
    if (a <= ultimo) err(`ciudades/${c.n}: serie desordenada en ${a}`);
    ultimo = a;
  }
}

const hum = leer('humanidad.json');
const n = hum.global.years.length;
for (const [k, v] of Object.entries(hum.global)) {
  if (k !== 'years' && v.length !== n) err(`humanidad/global.${k}: ${v.length} valores para ${n} años`);
}
for (const r of hum.regiones) {
  revisarMiembros(`humanidad/${r.id}`, r.members);
  if (!coordOk(r.anchor)) err(`humanidad/${r.id}: anchor fuera de rango`);
}

const pl = leer('politica.json').regimenes;
for (const t of pl.tipos) {
  if (t.serie.length !== pl.years.length) err(`politica/${t.id}: serie descuadrada`);
}

/* ── informe ───────────────────────────────────────────────── */

for (const a of avisos) console.log(`aviso  · ${a}`);
for (const e of errores) console.error(`ERROR  · ${e}`);
console.log(`\n${pol.polities.length} entidades · ${avisos.length} avisos · ${errores.length} errores`);
process.exit(errores.length ? 1 : 0);
