/**
 * Proyección y trazado de geometría.
 *
 * Dos vistas sobre el mismo estado: ortográfica (globo) y equirectangular
 * (plana). El trabajo fino está en el recorte: en el globo hay que cortar los
 * anillos por el horizonte y cerrarlos siguiendo el limbo, y en la plana hay
 * que desenrollar la longitud para que nada cruce el antimeridiano en línea
 * recta por medio del mapa.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const TAU = Math.PI * 2;

export class Vista {
  constructor() {
    this.modo = 'orto';
    this.lam = 12 * RAD;   // longitud del centro
    this.phi = 26 * RAD;   // latitud del centro
    this.k = 300;          // radio del globo / píxeles por radián
    this.w = 0;
    this.h = 0;
    this.cx = 0;
    this.cy = 0;
    this._sp = Math.sin(this.phi);
    this._cp = Math.cos(this.phi);
  }

  redimensionar(w, h) {
    this.w = w;
    this.h = h;
    this.cx = w / 2;
    this.cy = h / 2;
  }

  set centro([lonDeg, latDeg]) {
    this.lam = lonDeg * RAD;
    this.phi = Math.max(-85, Math.min(85, latDeg)) * RAD;
    this._sp = Math.sin(this.phi);
    this._cp = Math.cos(this.phi);
  }

  get centro() { return [this.lam * DEG, this.phi * DEG]; }

  girar(dLonDeg, dLatDeg) {
    this.centro = [this.lam * DEG + dLonDeg, this.phi * DEG + dLatDeg];
  }

  /** Coordenadas en el marco rotado: Z > 0 es el hemisferio visible. */
  _rot(lonDeg, latDeg) {
    const a = lonDeg * RAD - this.lam;
    const b = latDeg * RAD;
    const cb = Math.cos(b);
    const sb = Math.sin(b);
    const ca = Math.cos(a);
    return {
      x: cb * Math.sin(a),
      y: this._cp * sb - this._sp * cb * ca,
      z: this._sp * sb + this._cp * cb * ca,
    };
  }

  /** lon/lat → píxeles. Devuelve null si el punto queda al otro lado del globo. */
  proyectar(lonDeg, latDeg) {
    if (this.modo === 'orto') {
      const p = this._rot(lonDeg, latDeg);
      if (p.z < 0) return null;
      return [this.cx + this.k * p.x, this.cy - this.k * p.y];
    }
    let d = lonDeg - this.lam * DEG;
    d = ((d + 180) % 360 + 360) % 360 - 180;
    return [this.cx + d * RAD * this.k, this.cy - (latDeg * RAD - this.phi) * this.k];
  }

  /** Igual que proyectar, pero devuelve también si el punto mira a cámara. */
  proyectarSiempre(lonDeg, latDeg) {
    if (this.modo === 'orto') {
      const p = this._rot(lonDeg, latDeg);
      return { xy: [this.cx + this.k * p.x, this.cy - this.k * p.y], visible: p.z >= 0 };
    }
    return { xy: this.proyectar(lonDeg, latDeg), visible: true };
  }

  /** píxeles → lon/lat. null si el clic cae fuera del globo. */
  invertir(px, py) {
    const x = (px - this.cx) / this.k;
    const y = (this.cy - py) / this.k;
    if (this.modo === 'orto') {
      const r2 = x * x + y * y;
      if (r2 > 1) return null;
      const z = Math.sqrt(1 - r2);
      // deshace la rotación
      const lat = Math.asin(y * this._cp + z * this._sp);
      const lon = this.lam + Math.atan2(x, z * this._cp - y * this._sp);
      return [normLon(lon * DEG), lat * DEG];
    }
    const lat = (y + this.phi) * DEG;
    if (lat > 90 || lat < -90) return null;
    return [normLon(x * DEG + this.lam * DEG), lat];
  }

  /** Radio en píxeles de un círculo de r km centrado en lon/lat. */
  escalaKm(km) { return (km / 6371) * this.k; }

  /** ¿Cabe el mundo entero a lo ancho? (sólo tiene sentido en plana) */
  get anchoMundo() { return TAU * this.k; }
}

function normLon(d) { return ((d + 180) % 360 + 360) % 360 - 180; }

/* ────────────────────────────────────────────────────────────
   Trazado de anillos
   ──────────────────────────────────────────────────────────── */

/**
 * Añade un anillo [lon,lat,lon,lat,…] a un Path2D en coordenadas de pantalla.
 * Devuelve false si el anillo no aporta nada visible.
 */
export function trazarAnillo(path, ring, vista) {
  return vista.modo === 'orto' ? trazarOrto(path, ring, vista) : trazarPlana(path, ring, vista);
}

function trazarOrto(path, ring, v) {
  const n = ring.length >> 1;
  if (n < 3) return false;

  const pts = new Array(n);
  let algunoVisible = false;
  let algunoOculto = false;
  for (let i = 0; i < n; i++) {
    const p = v._rot(ring[i * 2], ring[i * 2 + 1]);
    pts[i] = p;
    if (p.z >= 0) algunoVisible = true; else algunoOculto = true;
  }
  if (!algunoVisible) return false;

  const sx = (p) => v.cx + v.k * p.x;
  const sy = (p) => v.cy - v.k * p.y;

  if (!algunoOculto) {
    path.moveTo(sx(pts[0]), sy(pts[0]));
    for (let i = 1; i < n; i++) path.lineTo(sx(pts[i]), sy(pts[i]));
    path.closePath();
    return true;
  }

  // arranca en un vértice oculto para no tener que envolver el recorrido
  let start = 0;
  for (let i = 0; i < n; i++) if (pts[i].z < 0) { start = i; break; }

  const segs = [];
  let cur = null;
  for (let s = 0; s < n; s++) {
    const a = pts[(start + s) % n];
    const b = pts[(start + s + 1) % n];
    const av = a.z >= 0;
    const bv = b.z >= 0;
    if (av) cur.pts.push(a);
    if (!av && bv) {
      const c = corteHorizonte(a, b);
      cur = { entrada: c, pts: [c] };
    } else if (av && !bv) {
      const c = corteHorizonte(a, b);
      cur.pts.push(c);
      cur.salida = c;
      segs.push(cur);
      cur = null;
    }
  }
  if (!segs.length) return false;

  // Al cerrar por el limbo hay que recorrerlo en el sentido que deja el
  // interior del anillo a la izquierda, y ese sentido lo fija la orientación
  // del propio anillo: si se elige al revés se traza el complemento y el
  // resultado es una cuña que cubre medio hemisferio. Cada salida se empareja
  // con la primera entrada que aparece en ese sentido —no con la siguiente del
  // anillo—, de modo que un contorno que cruza el horizonte varias veces se
  // cierra en los bucles correctos.
  const sentido = orientacion(ring) >= 0 ? 1 : -1;

  for (const sg of segs) {
    sg.tS = Math.atan2(sg.salida.y, sg.salida.x);
    sg.tE = Math.atan2(sg.entrada.y, sg.entrada.x);
    sg.usado = false;
  }
  const norm = (t) => ((t % TAU) + TAU) % TAU;

  for (const semilla of segs) {
    if (semilla.usado) continue;
    let sg = semilla;
    let abierto = false;
    while (sg && !sg.usado) {
      sg.usado = true;
      const p0 = sg.pts[0];
      if (!abierto) { path.moveTo(sx(p0), sy(p0)); abierto = true; }
      else path.lineTo(sx(p0), sy(p0));
      for (let j = 1; j < sg.pts.length; j++) path.lineTo(sx(sg.pts[j]), sy(sg.pts[j]));

      let sig = null;
      let mejor = Infinity;
      for (const q of segs) {
        let d = norm(sentido * (q.tE - sg.tS));
        if (d < 1e-9) d = TAU;
        if (d < mejor) { mejor = d; sig = q; }
      }
      if (!sig) break;
      path.arc(v.cx, v.cy, v.k, -sg.tS, -sig.tE, sentido > 0);
      sg = sig;
    }
    path.closePath();
  }
  return true;
}

/** Área con signo del anillo en lon/lat: positiva si es antihorario. */
function orientacion(ring) {
  const n = ring.length >> 1;
  let a = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    a += (ring[j * 2] - ring[i * 2]) * (ring[j * 2 + 1] + ring[i * 2 + 1]);
  }
  return a;
}

/** Punto del segmento a→b donde z = 0, normalizado sobre la esfera. */
function corteHorizonte(a, b) {
  const t = a.z / (a.z - b.z);
  let x = a.x + (b.x - a.x) * t;
  let y = a.y + (b.y - a.y) * t;
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m, z: 0 };
}

function trazarPlana(path, ring, v) {
  const n = ring.length >> 1;
  if (n < 3) return false;
  const kd = v.k * RAD;
  const lon0 = v.lam * DEG;
  const xs = new Array(n);
  const ys = new Array(n);

  let lon = normLon(ring[0] - lon0);
  xs[0] = v.cx + lon * kd;
  ys[0] = v.cy - (ring[1] * RAD - v.phi) * v.k;
  let prev = lon;
  let min = xs[0];
  let max = xs[0];

  for (let i = 1; i < n; i++) {
    let l = normLon(ring[i * 2] - lon0);
    // desenrolla: nunca saltamos más de medio mundo entre vértices
    while (l - prev > 180) l -= 360;
    while (l - prev < -180) l += 360;
    prev = l;
    const x = v.cx + l * kd;
    xs[i] = x;
    ys[i] = v.cy - (ring[i * 2 + 1] * RAD - v.phi) * v.k;
    if (x < min) min = x;
    if (x > max) max = x;
  }

  const mundo = v.anchoMundo;
  const desde = Math.floor((0 - max) / mundo);
  const hasta = Math.ceil((v.w - min) / mundo);
  let dibujado = false;
  for (let c = desde; c <= hasta; c++) {
    const dx = c * mundo;
    if (max + dx < -40 || min + dx > v.w + 40) continue;
    path.moveTo(xs[0] + dx, ys[0]);
    for (let i = 1; i < n; i++) path.lineTo(xs[i] + dx, ys[i]);
    path.closePath();
    dibujado = true;
  }
  return dibujado;
}

/** Traza una polilínea (rutas, cordilleras) con las mismas reglas. */
export function trazarLinea(path, line, vista, cerrar = false) {
  const n = line.length >> 1;
  if (n < 2) return false;
  let mov = false;
  let ant = null;
  for (let i = 0; i < n; i++) {
    const r = vista.proyectarSiempre(line[i * 2], line[i * 2 + 1]);
    if (!r.visible || !r.xy) { mov = false; ant = null; continue; }
    const [x, y] = r.xy;
    if (ant && vista.modo === 'plana' && Math.abs(x - ant[0]) > vista.anchoMundo / 2) mov = false;
    if (!mov) { path.moveTo(x, y); mov = true; } else path.lineTo(x, y);
    ant = [x, y];
  }
  if (cerrar && mov) path.closePath();
  return mov;
}

/** Anillo rectangular en lon/lat, subdividido para que se curve bien. */
export function anilloCaja([lo0, la0, lo1, la1], paso = 4) {
  const r = [];
  for (let x = lo0; x < lo1; x += paso) r.push(Math.min(x, lo1), la0);
  for (let y = la0; y < la1; y += paso) r.push(lo1, Math.min(y, la1));
  for (let x = lo1; x > lo0; x -= paso) r.push(Math.max(x, lo0), la1);
  for (let y = la1; y > la0; y -= paso) r.push(lo0, Math.max(y, la0));
  return r;
}

/** Elipse inscrita en una caja lon/lat: manchas climáticas sin esquinas. */
export function anilloElipse([lo0, la0, lo1, la1], pasos = 40) {
  const cx = (lo0 + lo1) / 2;
  const cy = (la0 + la1) / 2;
  const rx = (lo1 - lo0) / 2;
  const ry = (la1 - la0) / 2;
  const r = [];
  for (let i = 0; i < pasos; i++) {
    const t = (i / pasos) * TAU;
    r.push(cx + rx * Math.cos(t), cy + ry * Math.sin(t));
  }
  return r;
}

/** ¿Se solapan dos cajas lon/lat? */
export function cajasSolapan(a, b) {
  return !(b[0] >= a[2] || b[2] <= a[0] || b[1] >= a[3] || b[3] <= a[1]);
}

export { RAD, DEG, TAU, normLon };
