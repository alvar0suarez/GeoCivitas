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

/**
 * Las dos instantáneas que enmarcan un año, y en qué punto entre ellas cae.
 *
 * Devuelve `[A, B, t]`: A es la última foto tomada, B la siguiente, y t la
 * fracción recorrida. Con B nulo el imperio está fuera de sus fotos —antes de
 * la primera o después de la última— y no hay nada que interpolar.
 */
export function tramoDe(pol, año) {
  if (año < pol.from || año > pol.to) return [null, null, 0];
  const s = pol.snapshots;
  if (!s.length) return [null, null, 0];
  let i = -1;
  for (let k = 0; k < s.length; k++) if (s[k].year <= año) i = k;
  if (i < 0) return [s[0], null, 0];
  if (i >= s.length - 1) return [s[i], null, 1];
  const A = s[i];
  const B = s[i + 1];
  return [A, B, clamp((año - A.year) / (B.year - A.year), 0, 1)];
}

/**
 * Extensión de una entidad en un año concreto, con la frontera interpolada.
 *
 * Una instantánea cada varios siglos deja el mapa congelado: Cartago aparecía
 * con Hispania seiscientos años seguidos porque su única foto era del 264 a. C.
 * Aquí las zonas de dos fotos consecutivas se emparejan por nombre y se mezclan:
 * las cajas de recorte se desplazan punto a punto, los países que entran o salen
 * del imperio lo hacen con un peso que va de cero a uno, y el grado de control
 * recorre su índice en vez de saltar. El resultado se mueve con cada año.
 *
 * Cada zona devuelta lleva `peso` (cuánta presencia tiene ahora, de 0 a 1) e
 * `idx` (índice de control ya interpolado).
 */
export function extensionDe(pol, año) {
  const [A, B, t] = tramoDe(pol, año);
  if (!A) return [];
  const za = zonasDe(A);
  if (!B) return za.map((z) => ({ ...z, peso: 1, idx: CONTROL[z.control].idx }));

  const zb = zonasDe(B);
  const emparejadas = new Set();
  const out = [];

  for (const b of zb) {
    const a = pareja(b, za, emparejadas);
    if (a) emparejadas.add(a);
    out.push(...mezclar(a, b, t, año));
  }
  for (const a of za) if (!emparejadas.has(a)) out.push(...mezclar(a, null, t, año));

  return out.filter((z) => z.peso > 0.04 && (z.members.length || z.extra));
}

/**
 * Empareja una zona con su equivalente en la otra foto.
 *
 * El nombre manda cuando coincide, pero las zonas se renombran —el «Limes
 * renano» del 117 es la «Galia y Rin» del 395— y emparejar por orden de lista
 * hace que Britania se transforme en el Rin y aparezcan transiciones absurdas.
 * Cuando no hay nombre común se puntúa por territorio: qué países comparten y
 * cuánto se solapan sus cajas. Por debajo del umbral es preferible no emparejar
 * y que una zona muera y otra nazca.
 */
function pareja(z, candidatas, usadas) {
  let mejor = null;
  let mejorNota = 0;
  for (const c of candidatas) {
    if (usadas.has(c)) continue;
    if (z.nombre && c.nombre === z.nombre) return c;
    const nota = parecido(z, c) + (c.control === z.control ? 0.25 : 0);
    if (nota > mejorNota) { mejorNota = nota; mejor = c; }
  }
  return mejorNota >= 0.5 ? mejor : null;
}

function parecido(a, b) {
  const ma = new Set(a.members || []);
  const mb = new Set(b.members || []);
  let comunes = 0;
  for (const m of ma) if (mb.has(m)) comunes++;
  const union = new Set([...ma, ...mb]).size;
  const jaccard = union ? comunes / union : 0;

  const ca = a.box || (a.boxes && a.boxes[0]);
  const cb = b.box || (b.boxes && b.boxes[0]);
  let solape = 0;
  if (ca && cb) {
    const w = Math.min(ca[2], cb[2]) - Math.max(ca[0], cb[0]);
    const h = Math.min(ca[3], cb[3]) - Math.max(ca[1], cb[1]);
    if (w > 0 && h > 0) {
      const inter = w * h;
      const areaA = (ca[2] - ca[0]) * (ca[3] - ca[1]);
      const areaB = (cb[2] - cb[0]) * (cb[3] - cb[1]);
      solape = inter / Math.max(1e-6, areaA + areaB - inter);
    }
  }
  return jaccard * 0.65 + solape * 0.55;
}

function mezclar(a, b, t, año) {
  // Zona que desaparece. Si sabe cuándo se perdió, se pierde ese año exacto;
  // si no, se desvanece a lo largo del tramo.
  if (!b) {
    const peso = a.hasta != null ? (año <= a.hasta ? 1 : 0) : 1 - t;
    return [{ ...a, peso, idx: CONTROL[a.control].idx }];
  }
  // Zona que aparece. Con fecha de adquisición entra de golpe ese año.
  if (!a) {
    const peso = b.desde != null ? (año >= b.desde ? 1 : 0) : t;
    return [{ ...b, peso, idx: CONTROL[b.control].idx }];
  }

  const dominante = t < 0.5 ? a : b;
  const geom = geometriaMezclada(a, b, t);
  const idx = CONTROL[a.control].idx + (CONTROL[b.control].idx - CONTROL[a.control].idx) * t;
  const base = { ...dominante, ...geom, idx };

  const ma = new Set(a.members || []);
  const mb = new Set(b.members || []);
  const estables = [...ma].filter((m) => mb.has(m));
  const entrando = [...mb].filter((m) => !ma.has(m));
  const saliendo = [...ma].filter((m) => !mb.has(m));

  // La superficie se mide una vez sobre la zona entera y se reparte entre los
  // trozos. Midiendo cada trozo por separado, el recorte —que es el mismo para
  // los tres— pone su tope a cada uno y la zona partida abulta el doble.
  const areaBase = areaZona({ ...base, members: [...new Set([...ma, ...mb])] });
  const tierra = (lista) => lista.reduce((s, m) => s + areaPais(m), 0);
  const totalTierra = tierra([...ma, ...mb]) || 1;
  const trozo = (members, peso, transitoria) => ({
    ...base, members, peso, transitoria,
    extra: transitoria ? null : base.extra,
    areaBase, areaFrac: members.length ? tierra(members) / totalTierra : 1,
  });

  const piezas = [];
  if (estables.length || base.extra) piezas.push(trozo(estables, 1, null));
  if (entrando.length) piezas.push(trozo(entrando, b.desde != null ? (año >= b.desde ? 1 : 0) : t, 'entra'));
  if (saliendo.length) piezas.push(trozo(saliendo, a.hasta != null ? (año <= a.hasta ? 1 : 0) : 1 - t, 'sale'));
  return piezas.length ? piezas : [trozo([], 1, null)];
}

/**
 * Recorte intermedio entre dos zonas.
 *
 * Sólo se puede interpolar lo que tiene la misma forma a ambos lados: dos cajas,
 * dos listas de cajas de igual longitud, dos polígonos con los mismos vértices.
 * En cuanto la descripción cambia de tipo se toma la del lado dominante, porque
 * mezclar un rectángulo con un polígono de once puntos da basura.
 */
function geometriaMezclada(a, b, t) {
  const dom = t < 0.5 ? a : b;
  const g = { box: dom.box, boxes: dom.boxes, poly: dom.poly, holes: dom.holes };

  if (a.box && b.box) g.box = lerpCaja(a.box, b.box, t);
  if (a.boxes && b.boxes && a.boxes.length === b.boxes.length) {
    g.boxes = a.boxes.map((c, i) => lerpCaja(c, b.boxes[i], t));
  }
  if (a.poly && b.poly && a.poly.length === b.poly.length) {
    g.poly = a.poly.map((p, i) => {
      const q = b.poly[i];
      return p.length === q.length ? p.map((v, j) => [lerp(v[0], q[j][0], t), lerp(v[1], q[j][1], t)]) : dom.poly[i];
    });
  }
  if (a.holes && b.holes && a.holes.length === b.holes.length) {
    g.holes = a.holes.map((h, i) => lerpCaja(h, b.holes[i], t));
  }
  return g;
}

const lerp = (x, y, t) => x + (y - x) * t;
const lerpCaja = (c, d, t) => [lerp(c[0], d[0], t), lerp(c[1], d[1], t), lerp(c[2], d[2], t), lerp(c[3], d[3], t)];

/**
 * Descompone una instantánea en zonas por grado de control.
 *
 * Una instantánea puede traer hasta siete estratos. Los cuatro primeros nombres
 * son los históricos del Archivo y se mantienen; `march`, `client` y `sphere`
 * afinan el escalón entre «provincia» y «nada», que es justo donde se decide si
 * un imperio es un Estado o una recaudación con bandera.
 */
export function zonasDe(snap) {
  const z = [];
  for (const [clave, control] of ESTRATOS) {
    // Cuando la instantánea trae provincias nombradas, la lista plana `members`
    // es sólo su envolvente: pintarla encima borraría el mallado que aporta.
    if (clave === 'members' && snap.provinces) continue;
    const bruto = clave === 'members' ? (snap.members ? snap : null) : snap[clave];
    if (!bruto) continue;
    for (const parte of Array.isArray(bruto) ? bruto : [bruto]) z.push({ control, ...pick(parte) });
  }
  return z;
}

const ESTRATOS = [
  ['sphere', 'influencia'],
  ['contested', 'disputado'],
  ['tributary', 'tributario'],
  ['client', 'cliente'],
  ['march', 'marca'],
  ['members', 'provincia'],
  ['provinces', 'provincia'],
  ['core', 'nucleo'],
];

const pick = (o) => ({
  members: o.members || [],
  box: o.box, boxes: o.boxes, poly: o.poly, holes: o.holes, extra: o.extra,
  nombre: o.nombre, nota: o.nota, via: o.via, desde: o.desde,
  guarnicion: o.guarnicion, fiscal: o.fiscal, revuelta: o.revuelta,
});

/**
 * Grados de control, del mando directo a la mera hegemonía.
 *
 * `idx` es el índice de control efectivo (0–100): cuánto de lo que el centro
 * ordena llega a ejecutarse sobre el terreno. Permite pintar el mapa por
 * solidez del mando en lugar de por identidad del imperio, y promediar la
 * extensión de una entidad en una sola cifra comparable entre siglos.
 */
export const CONTROL = {
  nucleo:     { idx: 92, label: 'Núcleo', desc: 'Administración directa, fiscalidad propia, reclutamiento fiable.', alfa: 0.62, patron: 'solido' },
  provincia:  { idx: 74, label: 'Provincia', desc: 'Gobernador nombrado, guarnición permanente, impuesto recaudado con coste.', alfa: 0.44, patron: 'solido' },
  marca:      { idx: 56, label: 'Marca', desc: 'Franja militarizada bajo mando fronterizo: se sostiene con guarnición, no con administración. Fiscalidad simbólica.', alfa: 0.34, patron: 'punteado' },
  cliente:    { idx: 40, label: 'Cliente', desc: 'Dinastía local reconocida por el centro, que controla su exterior y le deja el interior. Hereda sus propias crisis.', alfa: 0.3, patron: 'malla' },
  tributario: { idx: 27, label: 'Tributario', desc: 'Élite local intacta a cambio de tributo y auxilio militar. Se pierde en cuanto aparece otro postor.', alfa: 0.26, patron: 'rayado' },
  disputado:  { idx: 14, label: 'Disputado', desc: 'Ocupación no consolidada: frontera activa, revuelta latente o control estacional.', alfa: 0.22, patron: 'diagonal' },
  influencia: { idx: 8,  label: 'Influencia', desc: 'Sin administración ni guarnición: hegemonía comercial, naval o diplomática. Se ve en los precios, no en los mapas.', alfa: 0.14, patron: 'niebla' },
};

/** De abajo a arriba: lo más flojo se pinta primero para que no tape lo firme. */
export const ORDEN_CONTROL = ['influencia', 'disputado', 'tributario', 'cliente', 'marca', 'provincia', 'nucleo'];

/** Cómo se adquirió una zona. Cambia lo que cuesta conservarla. */
export const VIA = {
  conquista:    'Conquista militar',
  herencia:     'Herencia dinástica',
  matrimonio:   'Enlace matrimonial',
  tratado:      'Tratado o compra',
  sumision:     'Sumisión negociada',
  colonizacion: 'Colonización de poblamiento',
  federacion:   'Federación o adhesión',
  concesion:    'Concesión y factoría',
};

/**
 * Superficie aproximada de una zona, en millones de km².
 *
 * Basta con que sea proporcional: sólo se usa para pesar el perfil de control,
 * de modo que una marca inmensa y despoblada no valga lo mismo que un núcleo
 * pequeño y denso por el mero hecho de ser una entrada de la misma lista.
 */
export function areaZona(z) {
  const cajas = [];
  if (z.box) cajas.push(z.box);
  for (const b of z.boxes || []) cajas.push(b);
  // Un polígono se mide por su superficie real, no por su caja envolvente: la
  // de Andalucía triplicaría lo que ocupa la propia Andalucía.
  let deLosPoligonos = 0;
  for (const p of z.poly || []) deLosPoligonos += areaPoligono(p);
  let tierra = 0;
  for (const m of z.members || []) tierra += areaPais(m);
  if (!cajas.length && !deLosPoligonos) return tierra;

  let recorte = deLosPoligonos;
  for (const c of cajas) recorte += areaCaja(c);
  for (const h of z.holes || []) recorte -= areaCaja(h) * 0.6;

  // La caja incluye mar y país ajeno; la lista de miembros incluye lo que la
  // caja deja fuera. Lo gobernado no puede pasar de ninguna de las dos.
  const a = tierra > 0 ? Math.min(tierra, recorte) : recorte;
  return Math.max(0.02, a);
}

const cajaDe = (pts) => {
  let lo0 = 180, la0 = 90, lo1 = -180, la1 = -90;
  for (const [x, y] of pts) {
    if (x < lo0) lo0 = x; if (x > lo1) lo1 = x;
    if (y < la0) la0 = y; if (y > la1) la1 = y;
  }
  return [lo0, la0, lo1, la1];
};

/** Superficie de un polígono lon/lat, en millones de km². */
function areaPoligono(pts) {
  const n = pts.length;
  let s = 0;
  let lat = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    s += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    lat += pts[i][1];
  }
  return Math.abs(s / 2) * Math.cos((lat / Math.max(1, n)) * Math.PI / 180) * 12321 / 1e6;
}

function areaCaja([lo0, la0, lo1, la1]) {
  const cos = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
  return Math.abs(lo1 - lo0) * Math.abs(la1 - la0) * cos * 12321 / 1e6;
}

const cachePais = new Map();
export function areaPais(nombre) {
  if (cachePais.has(nombre)) return cachePais.get(nombre);
  const rings = D.paises.get(nombre);
  let a = 0;
  for (const r of rings || []) {
    const n = r.length >> 1;
    let s = 0;
    let latm = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      s += r[j * 2] * r[i * 2 + 1] - r[i * 2] * r[j * 2 + 1];
      latm += r[i * 2 + 1];
    }
    a += Math.abs(s / 2) * Math.cos((latm / Math.max(1, n)) * Math.PI / 180);
  }
  const v = a * 12321 / 1e6;
  cachePais.set(nombre, v);
  return v;
}

/**
 * Reparto de la extensión de una instantánea por grado de control, ponderado
 * por superficie y ordenado de más firme a más flojo.
 */
export function perfilControl(zonas) {
  if (!zonas || !zonas.length) return { partes: [], indice: null, area: 0 };
  const partes = [];
  for (const z of zonas) {
    // Una zona a medio entrar cuenta a medias: si no, el imperio salta de
    // tamaño el año en que cruza el punto medio entre dos instantáneas.
    const area = (z.areaBase ?? areaZona(z)) * (z.areaFrac ?? 1) * (z.peso ?? 1);
    if (area <= 0) continue;
    const ya = partes.find((p) => p.control === z.control);
    if (ya) { ya.area += area; ya.zonas.push(z); }
    else partes.push({ control: z.control, area, zonas: [z] });
  }
  const total = partes.reduce((s, p) => s + p.area, 0) || 1;
  for (const p of partes) p.pct = (p.area / total) * 100;
  partes.sort((a, b) => CONTROL[b.control].idx - CONTROL[a.control].idx);
  const indice = partes.reduce((s, p) => s + p.zonas.reduce(
    (q, z) => q + (z.idx ?? CONTROL[z.control].idx) * (z.areaBase ?? areaZona(z)) * (z.areaFrac ?? 1) * (z.peso ?? 1), 0), 0) / total;
  return { partes, indice, area: total };
}

/** Perfil de mando de una entidad en un año, ya con la frontera interpolada. */
export function perfilDe(pol, año) {
  return perfilControl(extensionDe(pol, año));
}

/** Índice de control efectivo de una entidad en un año, de 0 a 100. */
export function indiceControl(pol, año) {
  return perfilDe(pol, año).indice;
}

/** Centro aproximado de una zona, para encuadrar el mapa al seleccionarla. */
export function centroDe(z) {
  const c = z.box || (z.boxes && z.boxes[0]) || (z.poly && cajaDe(z.poly[0]));
  return c ? [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2] : null;
}

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

  for (const p of D.polities) {
    add('ENTIDAD', p.kind, p.snapshots[0].year, p.name, { tipo: 'polity', pol: p }, p.capital);
    // Las zonas nombradas del mallado son consultables por sí mismas: buscar
    // «Dacia» o «limes renano» debe llevar al año y al encuadre correctos.
    const vistas = new Set();
    for (const s of p.snapshots) {
      for (const z of zonasDe(s)) {
        if (!z.nombre || vistas.has(z.nombre)) continue;
        vistas.add(z.nombre);
        add('ZONA', `${CONTROL[z.control].label} · ${p.short || p.name}`, s.year, z.nombre,
          { tipo: 'polity', pol: p }, centroDe(z));
      }
    }
  }
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
