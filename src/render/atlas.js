/**
 * Renderizador del atlas.
 *
 * Un único lienzo, dibujado por capas de fondo a primer plano. Todo lo que se
 * puede pinchar deja su Path2D en `this.golpes` para poder resolver el clic
 * sin repetir geometría.
 */

import { Vista, trazarAnillo, trazarLinea, anilloCaja, anilloElipse, cajasSolapan } from '../core/proyeccion.js';
import {
  D, activas, instantaneaDe, zonasDe, CONTROL, ORDEN_CONTROL, horizonteDe,
  TIPO_BANDA, choquesActivos, tecnoDisponible, difusion, eventosEn,
  regional, ich, ciudadesActivas,
} from '../core/datos.js';
import { rgba, RAMPAS, clamp, num } from '../core/series.js';

const TAU = Math.PI * 2;

export class Atlas {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.vista = new Vista();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.golpes = [];
    this.etiquetas = [];
    this.patrones = new Map();
    this.estrellas = null;
    this.t = 0;
  }

  redimensionar() {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.round(r.width * this.dpr);
    this.cv.height = Math.round(r.height * this.dpr);
    this.vista.redimensionar(r.width, r.height);
    this.estrellas = null;
  }

  /* ── ciclo principal ──────────────────────────────────────── */

  dibujar(est) {
    const { ctx, vista } = this;
    this.t = performance.now() / 1000;
    this.golpes = [];
    this.etiquetas = [];

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, vista.w, vista.h);

    this.fondo(est);
    if (vista.modo === 'orto') { ctx.save(); this.recorteGlobo(ctx); }

    this.oceano(est);
    this.tierra(est);
    if (est.capas.orografia) this.orografia(est);
    if (est.tematica !== 'ninguna') this.coropleta(est);
    this.costa();
    if (est.capas.prehistoria) this.prehistoria(est);
    if (est.capas.soberania) this.soberania(est);
    if (est.capas.rutas) this.rutas(est);
    if (est.capas.densidad) this.densidad(est);
    if (est.capas.choques) this.choques(est);
    if (est.capas.tecno) this.tecno(est);
    if (est.frente) this.frenteConquista(est);

    if (vista.modo === 'orto') { ctx.restore(); this.limbo(); }

    this.graticula(est);
    if (est.capas.pasos) this.pasos(est);
    if (est.capas.eventos) this.eventos(est);
    this.rotulos(est);

    ctx.restore();
  }

  recorteGlobo(ctx) {
    const { cx, cy, k } = this.vista;
    ctx.beginPath();
    ctx.arc(cx, cy, k, 0, TAU);
    ctx.clip();
  }

  /* ── fondo ────────────────────────────────────────────────── */

  fondo(est) {
    const { ctx, vista } = this;
    const g = ctx.createRadialGradient(vista.cx, vista.cy, 0, vista.cx, vista.cy, Math.max(vista.w, vista.h) * 0.75);
    g.addColorStop(0, '#070d18');
    g.addColorStop(1, '#03060b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vista.w, vista.h);

    if (!this.estrellas) this.sembrarEstrellas();
    ctx.save();
    for (const s of this.estrellas) {
      ctx.globalAlpha = s.a * (0.55 + 0.45 * Math.sin(this.t * s.f + s.p));
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.restore();
  }

  sembrarEstrellas() {
    const { w, h } = this.vista;
    const n = Math.round((w * h) / 5200);
    const out = [];
    let seed = 20250730;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      out.push({
        x: rnd() * w, y: rnd() * h,
        r: rnd() > 0.93 ? 2 : 1,
        a: 0.12 + rnd() * 0.45,
        f: 0.4 + rnd() * 1.6,
        p: rnd() * TAU,
        c: rnd() > 0.85 ? '#a5f3fc' : '#dbe9f4',
      });
    }
    this.estrellas = out;
  }

  oceano(est) {
    const { ctx, vista } = this;
    if (vista.modo === 'orto') {
      const { cx, cy, k } = vista;
      const g = ctx.createRadialGradient(cx - k * 0.35, cy - k * 0.4, k * 0.05, cx, cy, k);
      g.addColorStop(0, '#0a2338');
      g.addColorStop(0.55, '#061524');
      g.addColorStop(1, '#030a12');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, k, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = '#061423';
      const p = new Path2D();
      const r = anilloCaja([-180, -90, 180, 90], 10);
      trazarAnillo(p, r, vista);
      ctx.fill(p);
    }

    // plataforma continental emergida en periodos glaciales
    const nm = est.nivelMar;
    if (nm < -25) {
      ctx.save();
      ctx.fillStyle = 'rgba(94, 234, 212, 0.13)';
      ctx.strokeStyle = 'rgba(94, 234, 212, 0.28)';
      ctx.lineWidth = 0.6;
      ctx.setLineDash([3, 3]);
      for (const pf of D.prehistoria.plataformas) {
        if (nm > pf.umbral) continue;
        const p = new Path2D();
        if (trazarAnillo(p, pf.ring, this.vista)) { ctx.fill(p); ctx.stroke(p); }
      }
      ctx.restore();
    }
  }

  limbo() {
    const { ctx, vista } = this;
    const { cx, cy, k } = vista;
    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, k * 0.92, cx, cy, k * 1.14);
    g.addColorStop(0, 'rgba(34,211,238,0)');
    g.addColorStop(0.45, 'rgba(34,211,238,0.16)');
    g.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, k * 1.14, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, k, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  graticula(est) {
    const { ctx, vista } = this;
    if (!est.capas.graticula) return;
    ctx.save();
    if (vista.modo === 'orto') this.recorteGlobo(ctx);
    ctx.strokeStyle = 'rgba(90, 160, 190, 0.14)';
    ctx.lineWidth = 0.5;
    const p = new Path2D();
    for (let lon = -180; lon < 180; lon += 15) {
      const l = [];
      for (let lat = -88; lat <= 88; lat += 3) l.push(lon, lat);
      trazarLinea(p, l, vista);
    }
    for (let lat = -75; lat <= 75; lat += 15) {
      const l = [];
      for (let lon = -180; lon <= 180; lon += 4) l.push(lon, lat);
      trazarLinea(p, l, vista);
    }
    ctx.stroke(p);
    // ecuador marcado
    ctx.strokeStyle = 'rgba(245, 182, 66, 0.2)';
    const eq = new Path2D();
    const l = [];
    for (let lon = -180; lon <= 180; lon += 4) l.push(lon, 0);
    trazarLinea(eq, l, vista);
    ctx.stroke(eq);
    ctx.restore();
  }

  /* ── tierra ───────────────────────────────────────────────── */

  tierra(est) {
    const { ctx, vista } = this;
    const p = new Path2D();
    for (const ring of D.mundo.land) trazarAnillo(p, ring, vista);
    ctx.fillStyle = '#1d374c';
    ctx.fill(p);
    this.pathTierra = p;
  }

  /** Perfil costero por encima de las capas de relleno, para que no se pierda. */
  costa() {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(140, 205, 232, 0.34)';
    ctx.lineWidth = 0.6;
    ctx.stroke(this.pathTierra);
    ctx.restore();
  }

  /* ── orografía ────────────────────────────────────────────── */

  orografia() {
    const { ctx, vista } = this;
    ctx.save();
    ctx.clip(this.pathTierra);   // el clima se pinta en tierra, no en el mar

    for (const z of D.geo.aridas) {
      const p = new Path2D();
      if (!trazarAnillo(p, anilloElipse(z.box), vista)) continue;
      ctx.fillStyle = `rgba(214, 174, 104, ${0.07 + z.aridez * 0.1})`;
      ctx.fill(p);
    }
    for (const z of D.geo.selvas) {
      const p = new Path2D();
      if (!trazarAnillo(p, anilloElipse(z.box), vista)) continue;
      ctx.fillStyle = `rgba(56, 190, 120, ${0.05 + z.friccion * 0.08})`;
      ctx.fill(p);
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const c of D.geo.cordilleras) {
      const p = new Path2D();
      if (!trazarLinea(p, c.line, vista)) continue;
      const ancho = Math.max(1.5, vista.escalaKm(c.ancho) * 0.75);
      ctx.strokeStyle = `rgba(126, 102, 76, ${0.1 + (c.alt / 6100) * 0.16})`;
      ctx.lineWidth = ancho;
      ctx.stroke(p);
      ctx.strokeStyle = `rgba(206, 184, 152, ${0.12 + (c.alt / 6100) * 0.28})`;
      ctx.lineWidth = Math.max(0.6, ancho * 0.16);
      ctx.stroke(p);
    }
    ctx.restore();
  }

  /* ── coropletas regionales ────────────────────────────────── */

  coropleta(est) {
    const { ctx, vista } = this;
    const m = est.tematica;
    const conf = ESCALAS[m];
    if (!conf) return;
    const año = est.año;

    const vals = D.regiones.map((r) => (m === 'ich' ? ich(r, año) : regional(r, m, año)));
    let lo = conf.lo;
    let hi = conf.hi;
    if (conf.auto) {
      lo = Math.min(...vals);
      hi = Math.max(...vals);
      if (hi - lo < 1e-6) hi = lo + 1;
    }

    ctx.save();
    D.regiones.forEach((reg, i) => {
      const p = new Path2D();
      let algo = false;
      for (const nombre of reg.members) {
        const rings = D.paises.get(nombre);
        if (!rings) continue;
        for (const r of rings) algo = trazarAnillo(p, r, vista) || algo;
      }
      if (!algo) return;
      let t = (vals[i] - lo) / (hi - lo);
      if (conf.inv) t = 1 - t;
      ctx.fillStyle = conf.rampa(clamp(t, 0, 1));
      ctx.globalAlpha = 0.72;
      ctx.fill(p);
      this.golpes.push({ tipo: 'region', path: p, reg, valor: vals[i] });
    });
    ctx.restore();
  }

  /* ── prehistoria ──────────────────────────────────────────── */

  prehistoria(est) {
    const { ctx, vista } = this;
    const h = horizonteDe(est.año);
    if (!h || est.año > -2800) return;
    ctx.save();
    for (const b of h.bands) {
      const info = TIPO_BANDA[b.kind] || TIPO_BANDA.sapiens;
      const p = new Path2D();
      let algo = false;
      for (const nombre of b.members) {
        const rings = D.paises.get(nombre);
        if (!rings) continue;
        for (const r of rings) algo = trazarAnillo(p, r, vista) || algo;
      }
      if (!algo) continue;
      ctx.save();
      if (b.box) {
        const cp = new Path2D();
        trazarAnillo(cp, anilloCaja(b.box, 3), vista);
        ctx.clip(cp);
      }
      ctx.globalAlpha = b.kind === 'hielo' ? 0.46 : 0.2;
      ctx.fillStyle = info.c;
      ctx.fill(p);
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = info.c;
      ctx.lineWidth = 0.7;
      ctx.setLineDash(b.kind === 'hielo' ? [] : [5, 4]);
      ctx.stroke(p);
      ctx.restore();
      this.golpes.push({ tipo: 'banda', path: p, banda: b, horizonte: h, color: info.c });
    }
    ctx.restore();
  }

  /* ── soberanía ────────────────────────────────────────────── */

  soberania(est) {
    const { ctx, vista } = this;
    const pols = activas(est.año);
    ctx.save();

    for (const pol of pols) {
      const snap = instantaneaDe(pol, est.año);
      if (!snap) continue;
      const zonas = zonasDe(snap);
      const zonasOrd = ORDEN_CONTROL.map((c) => zonas.find((z) => z.control === c)).filter(Boolean);
      let pathPrincipal = null;

      for (const z of zonasOrd) {
        const p = new Path2D();
        let algo = false;
        for (const nombre of z.members) {
          const rings = D.paises.get(nombre);
          if (!rings) continue;
          for (const r of rings) algo = trazarAnillo(p, r, vista) || algo;
        }
        if (z.extra) for (const r of z.extra) algo = trazarAnillo(p, r, vista) || algo;
        if (!algo) continue;

        const cfg = CONTROL[z.control];
        ctx.save();
        this.aplicarRecorte(ctx, z);

        ctx.globalAlpha = cfg.alfa * (est.resaltado === pol.id ? 1.25 : 1) * (pol.speculative ? 0.72 : 1);
        ctx.fillStyle = pol.color;
        ctx.fill(p);

        if (cfg.patron !== 'solido') {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = this.patron(pol.color, cfg.patron);
          ctx.fill(p);
        }

        ctx.globalAlpha = z.control === 'nucleo' ? 0.95 : 0.5;
        ctx.strokeStyle = pol.color;
        ctx.lineWidth = z.control === 'nucleo' ? 1.1 : 0.7;
        if (pol.speculative) ctx.setLineDash([6, 4]);
        if (z.control === 'disputado') ctx.setLineDash([2, 3]);
        ctx.stroke(p);
        ctx.restore();

        if (z.control === 'provincia' || !pathPrincipal) pathPrincipal = p;
        this.golpes.push({ tipo: 'polity', path: p, pol, control: z.control, recorte: z });
      }

      const c = vista.proyectar(pol.capital[0], pol.capital[1]);
      if (c) {
        this.etiquetas.push({ x: c[0], y: c[1], texto: pol.short || pol.name, color: pol.color, prio: 0, estilo: 'titulo', spec: !!pol.speculative });
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = pol.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(c[0], c[1], 3.2, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = pol.color;
        ctx.beginPath();
        ctx.arc(c[0], c[1], 1.3, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /**
   * Recorta a la caja de la zona y perfora sus huecos con la regla par-impar.
   * Un hueco que no solapa la caja no resta nada: con par-impar se sumaría, así
   * que se descarta antes de construir el recorte.
   */
  aplicarRecorte(ctx, z) {
    if (!z.box && !z.holes) return;
    const rec = new Path2D();
    if (z.box) trazarAnillo(rec, anilloCaja(z.box, 3), this.vista);
    else rec.rect(0, 0, this.vista.w, this.vista.h);
    if (z.holes) {
      for (const h of z.holes) {
        if (z.box && !cajasSolapan(z.box, h)) continue;
        trazarAnillo(rec, anilloCaja(h, 3), this.vista);
      }
    }
    ctx.clip(rec, 'evenodd');
  }

  patron(color, tipo) {
    const clave = color + tipo;
    if (this.patrones.has(clave)) return this.patrones.get(clave);
    const s = 7;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.strokeStyle = color;
    g.lineWidth = 1.4;
    g.globalAlpha = 0.55;
    g.beginPath();
    if (tipo === 'rayado') { g.moveTo(0, s / 2); g.lineTo(s, s / 2); }
    else { g.moveTo(-1, s + 1); g.lineTo(s + 1, -1); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(s - 1, s + 1); g.lineTo(s + 1, s - 1); }
    g.stroke();
    const pat = this.ctx.createPattern(c, 'repeat');
    this.patrones.set(clave, pat);
    return pat;
  }

  /* ── rutas comerciales ────────────────────────────────────── */

  rutas(est) {
    const { ctx, vista } = this;
    ctx.save();
    ctx.lineCap = 'round';
    for (const r of D.geo.rutas) {
      if (est.año < r.from || est.año > r.to) continue;
      const p = new Path2D();
      if (!trazarLinea(p, r.line, vista)) continue;
      const col = r.tipo === 'maritimo' ? '#38bdf8' : r.tipo === 'fluvial' ? '#5eead4' : '#f5b642';
      ctx.globalAlpha = r.speculative ? 0.4 : 0.55;
      ctx.strokeStyle = rgba(col, 0.5);
      ctx.lineWidth = 2.4;
      ctx.setLineDash([]);
      ctx.stroke(p);

      // pulso de tráfico
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([10, 190]);
      ctx.lineDashOffset = -((this.t * 55) % 200);
      ctx.stroke(p);
      this.golpes.push({ tipo: 'ruta', path: p, ruta: r, trazo: true });
    }
    ctx.restore();
  }

  /* ── densidad de población ────────────────────────────────── */

  densidad(est) {
    const { ctx, vista } = this;
    const ciudades = ciudadesActivas(est.año, 5);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const { c, v } of ciudades) {
      const xy = vista.proyectar(c.c[0], c.c[1]);
      if (!xy) continue;
      const r = clamp(Math.sqrt(v) * 0.42 * (vista.k / 300), 2.2, 92);
      const g = ctx.createRadialGradient(xy[0], xy[1], 0, xy[0], xy[1], r);
      const int = clamp(0.1 + Math.log10(v + 1) * 0.13, 0.1, 0.5);
      g.addColorStop(0, `rgba(255, 236, 190, ${int})`);
      g.addColorStop(0.35, `rgba(245, 182, 66, ${int * 0.55})`);
      g.addColorStop(1, 'rgba(245, 182, 66, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], r, 0, TAU);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
    const grandes = ciudades.slice(0, 22);
    for (const { c, v } of grandes) {
      const xy = vista.proyectar(c.c[0], c.c[1]);
      if (!xy) continue;
      const r = clamp(1.2 + Math.log10(v + 1) * 1.5, 1.4, 6);
      ctx.fillStyle = '#fff7e6';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], r * 0.42, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245,182,66,.7)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], r, 0, TAU);
      ctx.stroke();
      this.etiquetas.push({ x: xy[0], y: xy[1] + r + 3, texto: `${c.n} · ${num(v)}k`, color: '#f5b642', prio: 2, estilo: 'menor' });
    }
    ctx.restore();
  }

  /* ── choques ──────────────────────────────────────────────── */

  choques(est) {
    const { ctx, vista } = this;
    const act = choquesActivos(est.año, 0);
    ctx.save();
    for (const s of act) {
      const xy = vista.proyectar(s.center[0], s.center[1]);
      if (!xy) continue;
      const km = s.radius || 800;
      // una pandemia con 14 000 km de alcance no puede pintarse como una mancha:
      // teñiría medio planeta. Por encima de cierta huella se dibuja el contorno
      // del alcance, no su relleno.
      const R = Math.min(vista.escalaKm(km), Math.min(vista.w, vista.h) * 0.45);
      const difusa = km > 3500;
      const col = COLOR_CHOQUE[s.type] || '#fb7185';
      const fase = (this.t * 0.5) % 1;

      if (!difusa) {
        const g = ctx.createRadialGradient(xy[0], xy[1], 0, xy[0], xy[1], Math.max(6, R));
        g.addColorStop(0, rgba(col, 0.26));
        g.addColorStop(0.6, rgba(col, 0.09));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], Math.max(6, R), 0, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = rgba(col, 0.3);
        ctx.lineWidth = 0.9;
        ctx.setLineDash([2, 6]);
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], R, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.strokeStyle = rgba(col, (difusa ? 0.45 : 0.75) * (1 - fase));
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], Math.max(8, R) * (0.25 + fase * 0.85), 0, TAU);
      ctx.stroke();

      ctx.strokeStyle = rgba(col, 0.9);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], 4, 0, TAU);
      ctx.moveTo(xy[0] - 7, xy[1]); ctx.lineTo(xy[0] + 7, xy[1]);
      ctx.moveTo(xy[0], xy[1] - 7); ctx.lineTo(xy[0], xy[1] + 7);
      ctx.stroke();

      this.etiquetas.push({ x: xy[0], y: xy[1] - 11, texto: s.name.toUpperCase(), color: col, prio: 1, estilo: 'aviso' });
      const hp = new Path2D();
      hp.arc(xy[0], xy[1], Math.max(12, R * 0.5), 0, TAU);
      this.golpes.push({ tipo: 'choque', path: hp, choque: s });
    }
    ctx.restore();
  }

  /* ── difusión tecnomilitar ────────────────────────────────── */

  tecno(est) {
    const { ctx, vista } = this;
    const disp = tecnoDisponible(est.año).slice(-9);
    ctx.save();
    for (const t of disp) {
      const xy = vista.proyectar(t.origin[0], t.origin[1]);
      if (!xy) continue;
      const d = difusion(t, est.año);
      const R = vista.escalaKm(600 + d * 11000);
      const reciente = est.año - t.year < (t.spread || 1);
      const col = t.speculative ? '#e879f9' : reciente ? '#a3e635' : '#67e8f9';

      ctx.globalAlpha = reciente ? 0.5 : 0.2;
      ctx.strokeStyle = col;
      ctx.lineWidth = reciente ? 1.3 : 0.7;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], R, 0, TAU);
      ctx.stroke();

      ctx.globalAlpha = 0.95;
      ctx.setLineDash([]);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(xy[0], xy[1] - 4);
      ctx.lineTo(xy[0] + 4, xy[1]);
      ctx.lineTo(xy[0], xy[1] + 4);
      ctx.lineTo(xy[0] - 4, xy[1]);
      ctx.closePath();
      ctx.fill();

      if (reciente) this.etiquetas.push({ x: xy[0], y: xy[1] - 9, texto: t.name.toUpperCase(), color: col, prio: 1, estilo: 'aviso' });
      const hp = new Path2D();
      hp.arc(xy[0], xy[1], 10, 0, TAU);
      this.golpes.push({ tipo: 'tecno', path: hp, tecno: t });
    }
    ctx.restore();
  }

  /* ── pasos y estrechos ───────────────────────────────────── */

  pasos() {
    const { ctx, vista } = this;
    ctx.save();
    for (const p of D.geo.pasos) {
      const xy = vista.proyectar(p.at[0], p.at[1]);
      if (!xy) continue;
      const col = p.tipo === 'maritimo' ? '#38bdf8' : '#f5b642';
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xy[0] - 5, xy[1] - 5); ctx.lineTo(xy[0] + 5, xy[1] + 5);
      ctx.moveTo(xy[0] + 5, xy[1] - 5); ctx.lineTo(xy[0] - 5, xy[1] + 5);
      ctx.stroke();
      const hp = new Path2D();
      hp.arc(xy[0], xy[1], 9, 0, TAU);
      this.golpes.push({ tipo: 'paso', path: hp, paso: p });
    }
    ctx.restore();
  }

  /* ── hitos ────────────────────────────────────────────────── */

  eventos(est) {
    const { ctx, vista } = this;
    const evs = eventosEn(est.año, 45);
    ctx.save();
    for (const e of evs) {
      const xy = vista.proyectar(e.at[0], e.at[1]);
      if (!xy) continue;
      const cerca = Math.abs(e.year - est.año) < 12;
      ctx.globalAlpha = cerca ? 0.95 : 0.4;
      ctx.strokeStyle = e.speculative ? '#e879f9' : '#dbe9f4';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xy[0], xy[1] - 5);
      ctx.lineTo(xy[0] + 5, xy[1]);
      ctx.lineTo(xy[0], xy[1] + 5);
      ctx.lineTo(xy[0] - 5, xy[1]);
      ctx.closePath();
      ctx.stroke();
      if (cerca) {
        ctx.fillStyle = 'rgba(219,233,244,.85)';
        ctx.fill();
        this.etiquetas.push({ x: xy[0], y: xy[1] - 10, texto: e.t.toUpperCase(), color: '#dbe9f4', prio: 1, estilo: 'aviso' });
      }
      const hp = new Path2D();
      hp.arc(xy[0], xy[1], 9, 0, TAU);
      this.golpes.push({ tipo: 'evento', path: hp, evento: e });
    }
    ctx.restore();
  }

  /* ── frente de conquista (simulador) ──────────────────────── */

  frenteConquista(est) {
    const { ctx, vista } = this;
    const f = est.frente;
    const a = vista.proyectar(f.desde[0], f.desde[1]);
    const b = vista.proyectar(f.hasta[0], f.hasta[1]);
    if (!a || !b) return;
    ctx.save();
    const col = f.prob > 0.6 ? '#a3e635' : f.prob > 0.35 ? '#f5b642' : '#fb7185';
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -((this.t * 30) % 24);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.22;
    ctx.quadraticCurveTo(mx, my, b[0], b[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [pt, r] of [[a, 5], [b, 8]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], r, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(f.prob * 100)} %`, mx, my - 6);
    ctx.restore();
  }

  /* ── rótulos ──────────────────────────────────────────────── */

  rotulos() {
    const { ctx } = this;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const puestos = [];
    // los nombres de estado se colocan primero: si algo se cae por colisión,
    // que sea el rótulo de una ciudad y no el de quien manda
    const orden = this.etiquetas.sort((a, b) => a.prio - b.prio);

    for (const e of orden) {
      const titulo = e.estilo === 'titulo';
      const size = titulo ? 10.5 : e.estilo === 'menor' ? 8.5 : 9;
      ctx.font = `${titulo ? 600 : 400} ${size}px ui-monospace, "SF Mono", monospace`;
      const w = ctx.measureText(e.texto).width;
      const caja = { x: e.x - w / 2 - 3, y: e.y - size / 2 - 2, w: w + 6, h: size + 4 };
      let choca = false;
      for (const q of puestos) {
        if (caja.x < q.x + q.w && caja.x + caja.w > q.x && caja.y < q.y + q.h && caja.y + caja.h > q.y) { choca = true; break; }
      }
      if (choca) continue;
      puestos.push(caja);

      ctx.fillStyle = 'rgba(3, 8, 15, 0.55)';
      ctx.fillRect(caja.x, caja.y, caja.w, caja.h);
      ctx.fillStyle = e.color;
      if (titulo) { ctx.shadowColor = e.color; ctx.shadowBlur = 9; }
      ctx.fillText(e.texto, e.x, e.y);
      ctx.shadowBlur = 0;
      if (e.spec) {
        ctx.strokeStyle = rgba(e.color, 0.5);
        ctx.lineWidth = 0.6;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(caja.x, caja.y, caja.w, caja.h);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  /* ── interacción ──────────────────────────────────────────── */

  golpeEn(x, y) {
    const { ctx } = this;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    const prioridad = { choque: 1, tecno: 1, evento: 1, paso: 1, ruta: 2, polity: 3, banda: 4, region: 5 };
    let mejor = null;
    for (const g of this.golpes) {
      const dentro = g.trazo
        ? (ctx.lineWidth = 9, ctx.isPointInStroke(g.path, x, y))
        : ctx.isPointInPath(g.path, x, y);
      if (!dentro) continue;
      const pr = prioridad[g.tipo] ?? 9;
      if (!mejor || pr < mejor.pr) mejor = { g, pr };
    }
    ctx.restore();
    return mejor ? mejor.g : null;
  }
}

const COLOR_CHOQUE = {
  peste: '#e879f9',
  sequia: '#f5b642',
  hambruna: '#fb923c',
  erupcion: '#fb7185',
  clima: '#67e8f9',
  sismo: '#a78bfa',
  antropico: '#a3e635',
};

export const ESCALAS = {
  ich:       { label: 'Índice de condición humana', lo: 0, hi: 1, rampa: RAMPAS.frio, unidad: '' },
  pop:       { label: 'Población regional', auto: true, rampa: RAMPAS.calor, unidad: 'M' },
  gdppc:     { label: 'Renta por persona', lo: 200, hi: 30000, log: true, rampa: RAMPAS.calor, unidad: '$' },
  lifeExp:   { label: 'Esperanza de vida', lo: 22, hi: 92, rampa: RAMPAS.frio, unidad: 'años' },
  childMort: { label: 'Mortalidad infantil', lo: 5, hi: 500, inv: true, rampa: RAMPAS.riesgo, unidad: '‰' },
  kcal:      { label: 'Alimentación', lo: 1600, hi: 3600, rampa: RAMPAS.campo, unidad: 'kcal' },
  yield:     { label: 'Rendimiento agrícola', lo: 0, hi: 7, rampa: RAMPAS.campo, unidad: 't/ha' },
  urban:     { label: 'Urbanización', lo: 0, hi: 96, rampa: RAMPAS.calor, unidad: '%' },
  literacy:  { label: 'Alfabetización', lo: 0, hi: 100, rampa: RAMPAS.vida, unidad: '%' },
  violence:  { label: 'Muerte violenta', lo: 2, hi: 500, inv: true, rampa: RAMPAS.riesgo, unidad: '/100k' },
  unfree:    { label: 'Población no libre', lo: 0, hi: 40, inv: true, rampa: RAMPAS.riesgo, unidad: '%' },
  hours:     { label: 'Jornada anual', lo: 1200, hi: 3100, inv: true, rampa: RAMPAS.calor, unidad: 'h' },
  energy:    { label: 'Energía por persona', lo: 4, hi: 105, rampa: RAMPAS.vida, unidad: 'GJ' },
};
