/**
 * Carga e indexación del Archivo.
 *
 * Todo lo que el resto de la aplicación pregunta sobre un año concreto
 * —quién manda, cuánta gente hay, qué se está muriendo, qué se acaba de
 * inventar— se responde aquí.
 */

import { enPares, enArrays, clamp } from './series.js';

const F = [
  ['mundo', 'world.json'],
  ['polities', 'polities.json'],
  ['prehistoria', 'prehistory.json'],
  ['choques', 'shocks.json'],
  ['tecno', 'weapons.json'],
  ['humanidad', 'humanidad.json'],
  ['geo', 'geografia.json'],
  ['ciudades', 'ciudades.json'],
  ['eventos', 'eventos.json'],
];

export const D = {
  cargado: false,
  paises: new Map(),   // nombre → anillos
  polities: [],
  regiones: [],
};

export async function cargar(progreso = () => {}) {
  const out = {};
  let hechos = 0;
  await Promise.all(F.map(async ([clave, archivo]) => {
    const r = await fetch(`./data/${archivo}`);
    if (!r.ok) throw new Error(`no se pudo leer ${archivo} (${r.status})`);
    out[clave] = await r.json();
    progreso(++hechos / F.length, archivo);
  }));

  Object.assign(D, out);
  for (const c of out.mundo.countries) D.paises.set(c.name, c.rings);
  D.polities = out.polities.polities;
  D.regiones = out.humanidad.regiones;
  D.gl = out.humanidad.global;
  D.cargado = true;

  // índices auxiliares
  D.porId = new Map(D.polities.map((p) => [p.id, p]));
  D.regionDePais = new Map();
  for (const r of D.regiones) for (const m of r.members) D.regionDePais.set(m, r.id);

  return D;
}

/* ── entidades políticas ───────────────────────────────────── */

export function activas(año) {
  return D.polities.filter((p) => año >= p.from && año <= p.to);
}

export function instantaneaDe(pol, año) {
  if (año < pol.from || año > pol.to) return null;
  let mejor = null;
  for (const s of pol.snapshots) {
    if (s.year <= año) mejor = s;
    else if (!mejor) { mejor = s; break; }  // antes del primer snapshot: usa el primero
  }
  return mejor || pol.snapshots[0] || null;
}

/** Descompone una instantánea en zonas por grado de control. */
export function zonasDe(snap) {
  const z = [];
  if (snap.members) z.push({ control: 'provincia', ...pick(snap) });
  if (snap.tributary) z.push({ control: 'tributario', ...pick(snap.tributary) });
  if (snap.contested) z.push({ control: 'disputado', ...pick(snap.contested) });
  if (snap.core) z.push({ control: 'nucleo', ...pick(snap.core) });
  return z;
}

const pick = (o) => ({ members: o.members || [], box: o.box, holes: o.holes, extra: o.extra });

export const CONTROL = {
  nucleo:     { label: 'Núcleo', desc: 'Administración directa, fiscalidad propia, reclutamiento fiable.', alfa: 0.62, patron: 'solido' },
  provincia:  { label: 'Provincia', desc: 'Gobernador nombrado, guarnición, impuesto recaudado con coste.', alfa: 0.4, patron: 'solido' },
  tributario: { label: 'Tributario', desc: 'Élite local intacta a cambio de tributo y auxilio militar. Se pierde en cuanto aparece otro postor.', alfa: 0.26, patron: 'rayado' },
  disputado:  { label: 'Disputado', desc: 'Ocupación no consolidada: frontera activa, revuelta latente o control estacional.', alfa: 0.22, patron: 'diagonal' },
};

export const ORDEN_CONTROL = ['provincia', 'tributario', 'disputado', 'nucleo'];

/* ── prehistoria ───────────────────────────────────────────── */

export function horizonteDe(año) {
  const h = D.prehistoria.horizontes;
  if (año > h[h.length - 1].year + 500) return null;
  let mejor = h[0];
  for (const x of h) if (x.year <= año) mejor = x;
  return mejor;
}

export function nivelMar(año) { return enPares(D.prehistoria.nivelMar.map((n) => [n.year, n.m]), año); }

export const TIPO_BANDA = {
  sapiens:      { c: '#22d3ee', label: 'Homo sapiens' },
  neandertal:   { c: '#fb7185', label: 'Neandertales' },
  denisovano:   { c: '#e879f9', label: 'Denisovanos' },
  otro:         { c: '#a78bfa', label: 'Otros homininos' },
  hielo:        { c: '#dbeafe', label: 'Casquete glaciar' },
  refugio:      { c: '#f5b642', label: 'Refugio glacial' },
  protoagricola:{ c: '#84cc16', label: 'Protoagrícola' },
  agricultura:  { c: '#a3e635', label: 'Agricultura' },
  urbano:       { c: '#f97316', label: 'Sociedad urbana' },
  colapso:      { c: '#78716c', label: 'Retroceso' },
};

/* ── choques, tecnología, eventos ──────────────────────────── */

export function choquesActivos(año, margen = 0) {
  return D.choques.shocks.filter((s) => año >= s.year - margen && año <= (s.endYear ?? s.year) + margen);
}

export function tecnoDisponible(año) {
  return D.tecno.tech.filter((t) => año >= t.year);
}

/** Fracción de difusión de una tecnología en el año dado (0 a 1). */
export function difusion(t, año) {
  if (año < t.year) return 0;
  return clamp((año - t.year) / (t.spread || 1), 0, 1);
}

export function eventosEn(año, ventana = 60) {
  return D.eventos.eventos.filter((e) => Math.abs(e.year - año) <= ventana);
}

/* ── condición humana ──────────────────────────────────────── */

export function global(metrica, año) {
  const g = D.gl;
  if (!g[metrica]) return null;
  return enArrays(g.years, g[metrica], año);
}

/**
 * Valor de una métrica en una región. Sólo tres factores están anclados en
 * los datos (peso demográfico, renta y salud relativas); el resto se deriva
 * de ellos con elasticidades fijas y documentadas. Es una textura razonada,
 * no una medición.
 */
export function regional(reg, metrica, año) {
  const g = global(metrica, año);
  if (g == null) return null;
  const rGdp = enPares(reg.gdppcRel, año) ?? 1;
  const rVida = enPares(reg.lifeRel, año) ?? 1;
  const rUrb = enPares(reg.urbanRel, año) ?? 1;

  switch (metrica) {
    case 'pop':       return global('pop', año) * pesoDemografico(reg, año);
    case 'gdppc':     return g * rGdp;
    case 'lifeExp':   return g * rVida;
    case 'urban':     return clamp(g * rUrb, 0, 96);
    case 'childMort': return clamp(g * (2 - rVida), 2, 600);
    case 'kcal':      return clamp(g * (0.78 + 0.22 * Math.pow(rGdp, 0.4)), 1500, 3800);
    case 'literacy':  return clamp(g * Math.pow(rGdp, 0.6), 0, 99.5);
    case 'yield':     return g * Math.pow(rGdp, 0.5);
    case 'violence':  return g * Math.pow(1 / rGdp, 0.4);
    case 'unfree':    return clamp(g * Math.pow(1 / rGdp, 0.3), 0, 60);
    case 'hours':     return g * Math.pow(1 / rGdp, 0.15);
    case 'energy':    return g * Math.pow(rGdp, 0.9);
    default:          return g;
  }
}

/** Peso demográfico normalizado: las cuotas de las regiones suman 1. */
export function pesoDemografico(reg, año) {
  let tot = 0;
  for (const r of D.regiones) tot += Math.max(0, enPares(r.popShare, año) ?? 0);
  const s = Math.max(0, enPares(reg.popShare, año) ?? 0);
  return tot > 0 ? s / tot : 0;
}

/**
 * Índice de Condición Humana: media de siete componentes normalizados sobre
 * su rango histórico. No es un dato observado; es una lente para comparar
 * épocas y regiones con una sola cifra.
 */
export function ich(reg, año) {
  const n = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1);
  const vida = n(regional(reg, 'lifeExp', año), 24, 90);
  const inf = 1 - n(regional(reg, 'childMort', año), 5, 500);
  const com = n(regional(reg, 'kcal', año), 1700, 3300);
  const let_ = n(regional(reg, 'literacy', año), 0, 100);
  const paz = 1 - n(Math.log10(Math.max(1, regional(reg, 'violence', año))), 0, 2.7);
  const lib = 1 - n(regional(reg, 'unfree', año), 0, 35);
  const ren = n(Math.log10(Math.max(100, regional(reg, 'gdppc', año))), 2.3, 4.8);
  return (vida + inf + com + let_ + paz + lib + ren) / 7;
}

export const COMPONENTES_ICH = [
  ['lifeExp', 'Esperanza de vida'],
  ['childMort', 'Supervivencia infantil'],
  ['kcal', 'Alimentación'],
  ['literacy', 'Alfabetización'],
  ['violence', 'Seguridad física'],
  ['unfree', 'Libertad personal'],
  ['gdppc', 'Renta'],
];

/* ── ciudades ──────────────────────────────────────────────── */

/** Población (en miles) de una ciudad en el año dado; 0 si no existe aún. */
export function poblacionCiudad(c, año) {
  const p = c.p;
  if (!p.length || año < p[0][0] - 150) return 0;
  if (año < p[0][0]) return p[0][1] * ((año - (p[0][0] - 150)) / 150);
  return enPares(p, año) ?? 0;
}

export function ciudadesActivas(año, minimo = 8) {
  const out = [];
  for (const c of D.ciudades.ciudades) {
    const v = poblacionCiudad(c, año);
    if (v >= minimo) out.push({ c, v });
  }
  return out.sort((a, b) => b.v - a.v);
}
