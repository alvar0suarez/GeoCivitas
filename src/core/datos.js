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
  ['batallas', 'batallas.json'],
  ['inventos', 'inventos.json'],
  ['lenguas', 'lenguas.json'],
  ['politica', 'politica.json'],
  ['fuentes', 'fuentes.json'],
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
  // La versión empaquetada en un solo archivo deja el Archivo ya incrustado;
  // la versión servida por HTTP lo pide pieza a pieza.
  const incrustado = globalThis.__GEO_DATA;
  await Promise.all(F.map(async ([clave, archivo]) => {
    if (incrustado) {
      out[clave] = incrustado[clave];
    } else {
      const r = await fetch(`./data/${archivo}`);
      if (!r.ok) throw new Error(`no se pudo leer ${archivo} (${r.status})`);
      out[clave] = await r.json();
    }
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

/* ── batallas, invenciones, lenguas, gobierno ──────────────── */

export function batallasEn(año, ventana = 40) {
  return D.batallas.batallas.filter((b) => Math.abs(b.year - año) <= ventana);
}

export function inventosEn(año, ventana = 90) {
  return D.inventos.inventos.filter((i) => año >= i.year && año - i.year <= Math.max(ventana, i.difusion));
}

/** Extensión de una familia lingüística en el año dado. */
export function expansionDe(fam, año) {
  if (año < fam.fecha - 500) return null;
  let mejor = fam.expansion[0];
  for (const e of fam.expansion) if (e.year <= año) mejor = e;
  return mejor;
}

/** Reparto de la humanidad por régimen, normalizado al 100 %. */
export function regimenesEn(año) {
  const { years, tipos } = D.politica.regimenes;
  const crudo = tipos.map((t) => ({ t, v: Math.max(0, enArrays(years, t.serie, año)) }));
  const tot = crudo.reduce((s, x) => s + x.v, 0) || 1;
  return crudo.map((x) => ({ tipo: x.t, pct: (x.v / tot) * 100 })).filter((x) => x.pct > 0.05)
    .sort((a, b) => b.pct - a.pct);
}

export function institucionesEn(año, ventana = 140) {
  return D.politica.instituciones.filter((i) => Math.abs(i.year - año) <= ventana);
}

/* ── procedencia y controversia ────────────────────────────── */

/**
 * Debates abiertos que afectan a un registro concreto. Que un dato esté
 * discutido no es un defecto del atlas: es información sobre el dato.
 */
export function debatesDe(familia, id) {
  return D.fuentes.debates.filter((d) => d.afecta === `${familia}/${id}`);
}

export function obraPorId(id) {
  return D.fuentes.obras.find((o) => o.id === id) || null;
}

export const NIVEL_CONFIANZA = {
  alta: { label: 'Alta', color: '#a3e635' },
  media: { label: 'Media', color: '#f5b642' },
  baja: { label: 'Baja', color: '#fb7185' },
  escenario: { label: 'Escenario', color: '#e879f9' },
};

/* ── búsqueda global ───────────────────────────────────────── */

let indice = null;

/** Índice plano de todo lo consultable, para el buscador. */
export function buscar(q) {
  if (!indice) construirIndice();
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const tn = norm(t);
  const out = [];
  for (const e of indice) {
    const i = e.busca.indexOf(tn);
    if (i < 0) continue;
    out.push({ ...e, orden: (i === 0 ? 0 : 1) * 1000 + i });
  }
  return out.sort((a, b) => a.orden - b.orden).slice(0, 40);
}

function construirIndice() {
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  indice = [];
  const add = (clase, etiqueta, año, texto, sel, at) =>
    indice.push({ clase, etiqueta, año, texto, sel, at, busca: norm(texto + ' ' + etiqueta) });

  for (const p of D.polities) add('ENTIDAD', p.kind, p.snapshots[0].year, p.name, { tipo: 'polity', pol: p }, p.capital);
  for (const b of D.batallas.batallas) add('BATALLA', b.bandos.join(' vs '), b.year, b.name, { tipo: 'batalla', batalla: b }, b.at);
  for (const i of D.inventos.inventos) add('INVENCIÓN', i.campo, i.year, i.name, { tipo: 'invento', invento: i }, i.at);
  for (const t of D.tecno.tech) add('TECNOMILITAR', t.class, t.year, t.name, { tipo: 'tecno', tecno: t }, t.origin);
  for (const s of D.choques.shocks) add('CHOQUE', s.place, s.year, s.name, { tipo: 'choque', choque: s }, s.center);
  for (const e of D.eventos.eventos) add('HITO', e.type, e.year, e.t, { tipo: 'evento', evento: e }, e.at);
  for (const f of D.lenguas.familias) add('LENGUA', `${f.hablantes} M hablantes`, f.fecha, f.name, { tipo: 'lengua', familia: f }, f.urheimat);
  for (const t of D.lenguas.teoriasOrigen) add('TEORÍA', t.defensa, t.rango[1], t.name, { tipo: 'teoria', teoria: t }, null);
  for (const i of D.politica.instituciones) add('INSTITUCIÓN', 'gobierno', i.year, i.name, { tipo: 'institucion', inst: i }, i.at);
  for (const p of D.geo.pasos) add('PASO', p.tipo, null, p.name, { tipo: 'paso', paso: p }, p.at);
  for (const r of D.geo.rutas) add('RUTA', r.tipo, r.from, r.name, { tipo: 'ruta', ruta: r }, null);
  for (const r of D.regiones) add('REGIÓN', 'macrorregión', null, r.name, { tipo: 'region', reg: r }, r.anchor);
  for (const c of D.ciudades.ciudades) add('CIUDAD', 'centro urbano', c.p[0][0], c.n, { tipo: 'ciudad', ciudad: c }, c.c);
  for (const d of D.fuentes.debates) add('DEBATE', 'controversia abierta', null, d.tema, { tipo: 'debate', debate: d }, null);
}

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
