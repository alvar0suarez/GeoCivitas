/** Interpolación de series, rampas de color y formateo. */

/** Interpola en pares [[año, valor], …] con extremos planos. */
export function enPares(pares, año) {
  if (!pares || !pares.length) return null;
  if (año <= pares[0][0]) return pares[0][1];
  const ult = pares[pares.length - 1];
  if (año >= ult[0]) return ult[1];
  for (let i = 1; i < pares.length; i++) {
    if (año <= pares[i][0]) {
      const [y0, v0] = pares[i - 1];
      const [y1, v1] = pares[i];
      return v0 + ((año - y0) / (y1 - y0)) * (v1 - v0);
    }
  }
  return ult[1];
}

/** Interpola en arrays paralelos años[] / valores[]. */
export function enArrays(años, valores, año) {
  if (año <= años[0]) return valores[0];
  const n = años.length;
  if (año >= años[n - 1]) return valores[n - 1];
  for (let i = 1; i < n; i++) {
    if (año <= años[i]) {
      const t = (año - años[i - 1]) / (años[i] - años[i - 1]);
      return valores[i - 1] + t * (valores[i] - valores[i - 1]);
    }
  }
  return valores[n - 1];
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const suave = (t) => t * t * (3 - 2 * t);

/* ── color ─────────────────────────────────────────────────── */

export function hexRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, a) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function mezclar(hexA, hexB, t) {
  const a = hexRgb(hexA);
  const b = hexRgb(hexB);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}

/** Rampa multiparada. paradas = [[pos, hex], …] con pos en [0,1]. */
export function rampa(paradas) {
  return (t) => {
    t = clamp(t, 0, 1);
    for (let i = 1; i < paradas.length; i++) {
      if (t <= paradas[i][0]) {
        const [p0, c0] = paradas[i - 1];
        const [p1, c1] = paradas[i];
        return mezclar(c0, c1, (t - p0) / (p1 - p0 || 1));
      }
    }
    return paradas[paradas.length - 1][1];
  };
}

export const RAMPAS = {
  frio:   rampa([[0, '#123c52'], [0.35, '#0e7490'], [0.7, '#22d3ee'], [1, '#cffafe']]),
  calor:  rampa([[0, '#3a2408'], [0.35, '#92400e'], [0.7, '#f5b642'], [1, '#fef3c7']]),
  vida:   rampa([[0, '#331240'], [0.35, '#7e22ce'], [0.7, '#e879f9'], [1, '#fae8ff']]),
  campo:  rampa([[0, '#22380f'], [0.35, '#3f6212'], [0.7, '#a3e635'], [1, '#ecfccb']]),
  riesgo: rampa([[0, '#3a0e1c'], [0.4, '#9f1239'], [0.75, '#fb7185'], [1, '#ffe4e6']]),
  // Solidez del mando: de la orden que nadie obedece a la que se ejecuta sola.
  mando:  rampa([[0, '#7f1d1d'], [0.3, '#c2410c'], [0.55, '#f5b642'], [0.8, '#65a30d'], [1, '#bbf7d0']]),
};

/* ── formato ───────────────────────────────────────────────── */

const NF = (d) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

export function num(v, dec = 0) {
  if (v == null || !isFinite(v)) return '—';
  return NF(dec).format(v);
}

export function porFormato(v, fmt) {
  if (v == null || !isFinite(v)) return '—';
  const dec = fmt && fmt.includes('.') ? fmt.split('.')[1].length : 0;
  return NF(dec).format(v);
}

export function compacto(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return num(v / 1e9, 2) + ' mil M';
  if (a >= 1e6) return num(v / 1e6, 2) + ' M';
  if (a >= 1e3) return num(v / 1e3, 1) + ' mil';
  return num(v, 0);
}
