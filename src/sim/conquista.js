/**
 * Motor de conquista.
 *
 * No predice la historia: pone números a por qué unas expansiones fueron
 * baratas y otras suicidas. Combina cinco ideas viejas y bien contrastadas:
 *
 *  · Gradiente de pérdida de fuerza (Boulding, 1962): la potencia militar
 *    decae con la distancia al centro de poder. Todo el resto son
 *    modificadores de la pendiente de esa curva.
 *  · Fricción del terreno: montaña, desierto, selva y mar no suman
 *    kilómetros, los multiplican.
 *  · Ley de Lanchester: con armas de alcance, la ventaja numérica rinde de
 *    forma cuadrática y no lineal.
 *  · Umbral tecnomilitar: la tecnología disponible en ese año y en ese sitio
 *    reescala proyección, letalidad, logística y ventaja del defensor.
 *  · Coste de ocupación: conquistar y retener son dos problemas distintos, y
 *    el segundo se paga todos los años.
 */

import { D, CONTROL, tecnoDisponible, choquesActivos, regional, pesoDemografico, global as gGlobal } from '../core/datos.js';
import { clamp } from '../core/series.js';

const R_TIERRA = 6371;
const RAD = Math.PI / 180;

/* ── geometría ─────────────────────────────────────────────── */

export function distanciaKm([lo1, la1], [lo2, la2]) {
  const dLa = (la2 - la1) * RAD;
  const dLo = (lo2 - lo1) * RAD;
  const a = Math.sin(dLa / 2) ** 2 +
    Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin(dLo / 2) ** 2;
  return 2 * R_TIERRA * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Interpola sobre el círculo máximo entre dos puntos. */
function enRuta(a, b, t) {
  const d = distanciaKm(a, b) / R_TIERRA;
  if (d < 1e-9) return a.slice();
  const [lo1, la1] = [a[0] * RAD, a[1] * RAD];
  const [lo2, la2] = [b[0] * RAD, b[1] * RAD];
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return [Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD];
}

let cajasTierra = null;
function prepararTierra() {
  if (cajasTierra) return;
  cajasTierra = D.mundo.land.map((r) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < r.length; i += 2) {
      if (r[i] < x0) x0 = r[i];
      if (r[i] > x1) x1 = r[i];
      if (r[i + 1] < y0) y0 = r[i + 1];
      if (r[i + 1] > y1) y1 = r[i + 1];
    }
    return { r, x0, y0, x1, y1 };
  });
}

export function esTierra(lon, lat) {
  prepararTierra();
  let dentro = false;
  for (const c of cajasTierra) {
    if (lon < c.x0 || lon > c.x1 || lat < c.y0 || lat > c.y1) continue;
    const r = c.r;
    const n = r.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = r[i * 2], yi = r[i * 2 + 1];
      const xj = r[j * 2], yj = r[j * 2 + 1];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
  }
  return dentro;
}

/** Distancia aproximada de un punto a una polilínea, en km. */
function distLinea(pt, line) {
  let min = Infinity;
  for (let i = 0; i < line.length - 2; i += 2) {
    const d = distSegmento(pt, [line[i], line[i + 1]], [line[i + 2], line[i + 3]]);
    if (d < min) min = d;
  }
  return min;
}

function distSegmento(p, a, b) {
  const kx = Math.cos(p[1] * RAD) * 111.32;
  const ky = 110.57;
  const px = p[0] * kx, py = p[1] * ky;
  const ax = a[0] * kx, ay = a[1] * ky;
  const bx = b[0] * kx, by = b[1] * ky;
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/* ── perfil del corredor ───────────────────────────────────── */

/**
 * Recorre el trayecto entre dos puntos y devuelve el coste del terreno.
 * friccion = multiplicador de distancia; mar = fracción de tramo marítimo.
 */
export function perfilCorredor(desde, hasta, muestras = 26) {
  let friccion = 0;
  let mar = 0;
  let alturaMax = 0;
  const obstaculos = new Set();

  for (let i = 0; i <= muestras; i++) {
    const p = enRuta(desde, hasta, i / muestras);
    let f = 0;

    if (!esTierra(p[0], p[1])) { mar++; f += 0.15; }

    for (const c of D.geo.cordilleras) {
      const d = distLinea(p, c.line);
      if (d < c.ancho) {
        const peso = (1 - d / c.ancho) * (c.alt / 6100);
        if (peso > 0.06) { f += peso * 2.6; obstaculos.add(c.name); alturaMax = Math.max(alturaMax, c.alt); }
      }
    }
    for (const z of D.geo.aridas) {
      if (p[0] >= z.box[0] && p[0] <= z.box[2] && p[1] >= z.box[1] && p[1] <= z.box[3]) {
        f += z.aridez * 1.5;
        obstaculos.add(z.name);
      }
    }
    for (const z of D.geo.selvas) {
      if (p[0] >= z.box[0] && p[0] <= z.box[2] && p[1] >= z.box[1] && p[1] <= z.box[3]) {
        f += z.friccion * 1.4;
        obstaculos.add(z.name);
      }
    }
    friccion += f;
  }

  return {
    friccion: friccion / (muestras + 1),
    mar: mar / (muestras + 1),
    alturaMax,
    obstaculos: [...obstaculos],
  };
}

/* ── tecnología disponible para un actor ───────────────────── */

/**
 * Una tecnología no está disponible el año en que se inventa, sino cuando
 * llega: la adopción crece con el tiempo y decae con la distancia al foco.
 */
export function perfilTecno(año, en) {
  const acc = { proyeccion: 0, letalidad: 0, movilidad: 0, logistica: 0, fortificacion: 0 };
  const adoptadas = [];

  for (const t of tecnoDisponible(año)) {
    const dist = distanciaKm(t.origin, en);
    const retardo = (t.spread || 1) * (0.15 + dist / 14000);
    const adopcion = clamp((año - t.year) / Math.max(1, retardo), 0, 1);
    if (adopcion < 0.05) continue;
    // el umbral de entrada frena a quien no puede pagarlo
    const efic = adopcion * (1 - (t.effects.umbral ?? 0) * 0.28);
    for (const k of Object.keys(acc)) acc[k] += (t.effects[k] ?? 0) * efic;
    if (adopcion > 0.35) adoptadas.push({ t, adopcion });
  }

  // normaliza a rangos manejables sin recortar el orden de magnitud histórico
  const n = (v) => Math.tanh(v / 2.4);
  return {
    proyeccion: n(acc.proyeccion),
    letalidad: n(acc.letalidad),
    movilidad: n(acc.movilidad),
    logistica: n(acc.logistica),
    fortificacion: n(acc.fortificacion),
    adoptadas: adoptadas.sort((a, b) => b.t.year - a.t.year).slice(0, 8),
  };
}

/* ── base material ─────────────────────────────────────────── */

function regionDe(punto) {
  let mejor = D.regiones[0];
  let d = Infinity;
  for (const r of D.regiones) {
    const dd = distanciaKm(r.anchor, punto);
    if (dd < d) { d = dd; mejor = r; }
  }
  return mejor;
}

function baseMaterial(punto, año) {
  const reg = regionDe(punto);
  const pob = gGlobal('pop', año) * pesoDemografico(reg, año);
  const renta = regional(reg, 'gdppc', año);
  return { reg, pob, renta, indice: Math.log10(Math.max(1, pob * renta)) };
}

/** Penalización por catástrofe activa cerca del actor. */
function penalizacionChoque(punto, año) {
  let peor = 0;
  let cual = null;
  for (const s of choquesActivos(año, 0)) {
    const d = distanciaKm(s.center, punto);
    if (d > (s.radius || 800)) continue;
    const p = (s.severity / 5) * (1 - d / (s.radius || 800)) * 0.45;
    if (p > peor) { peor = p; cual = s; }
  }
  return { penal: peor, choque: cual };
}

/* ── evaluación ────────────────────────────────────────────── */

/**
 * @param {object} atacante {name, at:[lon,lat], color}
 * @param {object} defensor {name, at:[lon,lat], color, esEstado:boolean}
 */
export function evaluar(atacante, defensor, año) {
  const dist = distanciaKm(atacante.at, defensor.at);
  const corredor = perfilCorredor(atacante.at, defensor.at);
  const tA = perfilTecno(año, atacante.at);
  const tD = perfilTecno(año, defensor.at);
  const bA = baseMaterial(atacante.at, año);
  const bD = baseMaterial(defensor.at, año);
  const chA = penalizacionChoque(atacante.at, año);
  const chD = penalizacionChoque(defensor.at, año);

  // alcance útil: 700 km de partida, ampliado por proyección y logística
  const alcance = 700 * (1 + 2.6 * tA.proyeccion) * (1 + 0.9 * tA.logistica) * (1 + 0.5 * tA.movilidad);
  const distEfectiva = dist * (1 + corredor.friccion);
  // el mar penaliza sin capacidad naval y ayuda con ella
  const naval = clamp(tA.proyeccion * 1.3 - 0.15, 0, 1);
  const costeMar = corredor.mar * (1.9 - 1.7 * naval);
  const distFinal = distEfectiva * (1 + costeMar);

  const decaimiento = Math.exp(-distFinal / Math.max(120, alcance));

  const fuerzaA = bA.indice * decaimiento
    * (1 + 0.55 * tA.letalidad)
    * (1 - chA.penal)
    * (atacante.multiplicador ?? 1);

  const fortifica = 1 + 0.75 * tD.fortificacion + 0.45 * Math.min(1.2, corredor.friccion);
  const fuerzaD = bD.indice * fortifica * (1 - chD.penal) * (defensor.esEstado ? 1 : 0.55);

  // Lanchester cuadrático cuando ambos bandos tienen alcance
  const expo = 1 + Math.min(tA.letalidad, tD.letalidad) * 0.9;
  const pa = Math.pow(Math.max(0.01, fuerzaA), expo);
  const pd = Math.pow(Math.max(0.01, fuerzaD), expo);
  const prob = clamp(pa / (pa + pd), 0.01, 0.99);

  // clase de control que se puede sostener a esa distancia
  const razon = distFinal / Math.max(120, alcance);
  const control = razon < 0.45 ? 'nucleo' : razon < 0.95 ? 'provincia' : razon < 1.8 ? 'tributario' : 'disputado';

  // duración y coste
  const años = Math.max(1, Math.round((distFinal / (240 * (1 + tA.movilidad))) * (1 + corredor.friccion) * (1.4 - prob)));
  const vidaMedia = Math.round(25 + 320 * Math.exp(-razon) * (0.55 + 0.45 * prob));
  const costeAnual = clamp(0.12 + razon * 0.35 + corredor.friccion * 0.2 - tA.logistica * 0.15, 0.05, 1);

  return {
    prob, control, años, vidaMedia, costeAnual,
    dist, distFinal, alcance, corredor, decaimiento,
    tA, tD, bA, bD, chA, chD, naval, razon,
    factores: [
      ['Base material del atacante', bA.indice / 12],
      ['Base material del defensor', -bD.indice / 12],
      ['Decaimiento por distancia', -(1 - decaimiento)],
      ['Fricción del terreno', -clamp(corredor.friccion, 0, 1.5) / 1.5],
      ['Travesía marítima', -clamp(costeMar, 0, 1)],
      ['Proyección tecnológica', tA.proyeccion],
      ['Logística', tA.logistica],
      ['Letalidad relativa', (tA.letalidad - tD.letalidad)],
      ['Fortificación del defensor', -tD.fortificacion],
      ['Catástrofe sobre el atacante', -chA.penal / 0.45],
      ['Catástrofe sobre el defensor', chD.penal / 0.45],
    ].filter(([, v]) => Math.abs(v) > 0.005),
  };
}

export function textoControl(clase) {
  return CONTROL[clase];
}

/** Lectura en prosa del resultado, en el registro del Archivo. */
export function veredicto(r, atacante, defensor) {
  const p = r.prob;
  const partes = [];
  if (p > 0.75) partes.push(`Campaña viable. ${atacante} opera con margen sobre ${defensor}.`);
  else if (p > 0.5) partes.push(`Campaña favorable pero no barata: ${atacante} gana en el papel, y el papel no cuenta bajas.`);
  else if (p > 0.3) partes.push(`Empresa arriesgada. La ventaja de ${atacante} se disuelve antes de llegar al objetivo.`);
  else partes.push(`Sobreextensión. ${atacante} llegaría exhausto a un enemigo intacto.`);

  if (r.decaimiento < 0.35) partes.push(`A ${Math.round(r.distFinal)} km efectivos, la fuerza que llega al frente es el ${Math.round(r.decaimiento * 100)} % de la que sale.`);
  if (r.corredor.obstaculos.length) partes.push(`Interponen resistencia: ${r.corredor.obstaculos.slice(0, 3).join(', ')}.`);
  if (r.corredor.mar > 0.3) partes.push(`El ${Math.round(r.corredor.mar * 100)} % del trayecto es marítimo${r.naval < 0.3 ? ', sin capacidad naval suficiente para sostenerlo' : ' y hay marina para sostenerlo'}.`);
  if (r.chD.choque) partes.push(`El defensor atraviesa ${r.chD.choque.name}: su capacidad de respuesta está mermada.`);
  if (r.chA.choque) partes.push(`El atacante arrastra ${r.chA.choque.name}, lo que le resta base de reclutamiento.`);

  const c = CONTROL[r.control];
  partes.push(`Control sostenible a esa distancia: ${c.label.toLowerCase()}. ${c.desc} Vida media estimada del dominio: ${r.vidaMedia} años.`);
  return partes.join(' ');
}
