/** Regla temporal: 52 200 años dibujados con densidad creciente hacia hoy. */

import { D, global as gGlobal, ich } from '../core/datos.js';
import { aT, aAño, MARCAS, AÑO_MIN, AÑO_MAX } from '../core/escala.js';
import { clamp } from '../core/series.js';

const COLOR_CHOQUE = {
  peste: '#e879f9', sequia: '#f5b642', hambruna: '#fb923c',
  erupcion: '#fb7185', clima: '#67e8f9', sismo: '#a78bfa', antropico: '#a3e635',
};

export class Regla {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cache = null;
  }

  redimensionar() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.round(r.width * dpr);
    this.cv.height = Math.round(r.height * dpr);
    this.w = r.width;
    this.h = r.height;
    this.dpr = dpr;
    this.cache = null;
  }

  dibujar() {
    if (!this.w) this.redimensionar();
    const { ctx, w, h } = this;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(8, 16, 26, 0.75)';
    ctx.fillRect(0, 0, w, h);

    const X = (a) => aT(a) * w;

    // franjas de era
    const cortes = [-50000, -9700, -3300, -500, 500, 1500, 1800, 1945, 2030, AÑO_MAX];
    for (let i = 0; i < cortes.length - 1; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(34,211,238,0.035)' : 'rgba(34,211,238,0.012)';
      ctx.fillRect(X(cortes[i]), 0, X(cortes[i + 1]) - X(cortes[i]), h);
    }
    // zona de escenario
    ctx.fillStyle = 'rgba(232,121,249,0.07)';
    ctx.fillRect(X(2030), 0, w - X(2030), h);

    // curva de población (log)
    const muestras = 240;
    const pts = [];
    for (let i = 0; i <= muestras; i++) {
      const a = aAño(i / muestras);
      const p = gGlobal('pop', a);
      pts.push([(i / muestras) * w, Math.log10(Math.max(0.5, p))]);
    }
    const lo = 0, hi = Math.log10(11000);
    const Y = (v) => h - 12 - ((v - lo) / (hi - lo)) * (h - 24);

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (const [x, v] of pts) ctx.lineTo(x, Y(v));
    ctx.lineTo(w, h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(34,211,238,0.30)');
    g.addColorStop(1, 'rgba(34,211,238,0.02)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    pts.forEach(([x, v], i) => (i ? ctx.lineTo(x, Y(v)) : ctx.moveTo(x, Y(v))));
    ctx.strokeStyle = 'rgba(103,232,249,0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // condición humana media
    ctx.beginPath();
    for (let i = 0; i <= muestras; i++) {
      const a = aAño(i / muestras);
      let s = 0;
      for (const r of D.regiones) s += ich(r, a);
      const v = s / D.regiones.length;
      const y = h - 12 - v * (h - 24);
      i ? ctx.lineTo((i / muestras) * w, y) : ctx.moveTo(0, y);
    }
    ctx.strokeStyle = 'rgba(245,182,66,0.75)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // choques
    for (const s of D.choques.shocks) {
      const x = X(s.year);
      const x2 = X(s.endYear ?? s.year);
      const c = COLOR_CHOQUE[s.type] || '#fb7185';
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.25 + (s.severity / 5) * 0.4;
      ctx.fillRect(x, h - 7, Math.max(1.5, x2 - x), 5);
      ctx.globalAlpha = 1;
      ctx.fillRect(x, h - 7 - s.severity, 1.2, s.severity);
    }

    // umbrales tecnomilitares
    ctx.fillStyle = 'rgba(163,230,53,0.75)';
    for (const t of D.tecno.tech) {
      const x = X(t.year);
      ctx.fillRect(x, 2, 1, 5);
    }

    // marcas
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(120,150,170,0.75)';
    ctx.textAlign = 'center';
    for (const [a, lb] of MARCAS) {
      const x = clamp(X(a), 12, w - 12);
      ctx.fillStyle = 'rgba(90,150,175,0.28)';
      ctx.fillRect(X(a), 0, 0.6, h);
      ctx.fillStyle = 'rgba(123,147,168,0.85)';
      ctx.fillText(lb, x, h - 1.5);
    }

    ctx.restore();
  }

  xDe(año) { return aT(año) * this.w; }
  añoDe(x) { return aAño(clamp(x / this.w, 0, 1)); }
}

export { AÑO_MIN, AÑO_MAX };
