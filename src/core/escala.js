/**
 * Escala temporal.
 *
 * 52.200 años en una barra de 900 px son inservibles si el reparto es lineal:
 * el 99 % del pixelaje se lo comerían el Paleolítico y el vacío. La escala es
 * por tramos, con densidad creciente hacia el presente, de modo que un siglo
 * reciente ocupa tanto como diez milenios profundos.
 */

const NODOS = [
  [-50000, 0.000], [-30000, 0.060], [-20000, 0.105], [-12000, 0.150],
  [-9000, 0.185],  [-5000, 0.225],  [-3000, 0.255],  [-2000, 0.280],
  [-1000, 0.310],  [-500, 0.340],   [0, 0.375],      [500, 0.415],
  [1000, 0.460],   [1300, 0.500],   [1500, 0.535],   [1700, 0.585],
  [1800, 0.620],   [1900, 0.680],   [1950, 0.730],   [2000, 0.790],
  [2025, 0.830],   [2050, 0.870],   [2100, 0.930],   [2200, 1.000],
];

export const AÑO_MIN = NODOS[0][0];
export const AÑO_MAX = NODOS[NODOS.length - 1][0];

/** año → posición normalizada [0,1] */
export function aT(año) {
  if (año <= AÑO_MIN) return 0;
  if (año >= AÑO_MAX) return 1;
  for (let i = 1; i < NODOS.length; i++) {
    const [y1, t1] = NODOS[i];
    if (año <= y1) {
      const [y0, t0] = NODOS[i - 1];
      return t0 + ((año - y0) / (y1 - y0)) * (t1 - t0);
    }
  }
  return 1;
}

/** posición normalizada [0,1] → año */
export function aAño(t) {
  if (t <= 0) return AÑO_MIN;
  if (t >= 1) return AÑO_MAX;
  for (let i = 1; i < NODOS.length; i++) {
    const [y1, t1] = NODOS[i];
    if (t <= t1) {
      const [y0, t0] = NODOS[i - 1];
      return Math.round(y0 + ((t - t0) / (t1 - t0)) * (y1 - y0));
    }
  }
  return AÑO_MAX;
}

/** Cuántos años vale un paso "natural" en este punto de la escala. */
export function pasoNatural(año) {
  const a = Math.abs(año);
  if (a > 20000) return 500;
  if (a > 5000) return 100;
  if (a > 1500 && año < 0) return 50;
  if (año < 1500) return 25;
  if (año < 1900) return 10;
  return 5;
}

const FMT = new Intl.NumberFormat('es-ES');

export function formatoAño(año) {
  const a = Math.round(año);
  if (a < 0) return `${FMT.format(-a)} a. C.`;
  if (a === 0) return '1 a. C.';
  return FMT.format(a);
}

const ERAS = [
  [-50000, 'Paleolítico superior'],
  [-11700, 'Epipaleolítico'],
  [-9700,  'Neolítico'],
  [-3300,  'Edad del Bronce'],
  [-1200,  'Edad del Hierro'],
  [-500,   'Antigüedad clásica'],
  [500,    'Alta Edad Media'],
  [1000,   'Plena Edad Media'],
  [1300,   'Baja Edad Media'],
  [1500,   'Edad Moderna'],
  [1800,   'Era industrial'],
  [1914,   'Era de las guerras totales'],
  [1945,   'Orden bipolar'],
  [1991,   'Globalización'],
  [2020,   'Era climática'],
  [2050,   'Prospectiva · escenario'],
];

export function era(año) {
  let e = ERAS[0][1];
  for (const [y, n] of ERAS) { if (año >= y) e = n; else break; }
  return e;
}

export const ES_ESCENARIO = (año) => año > 2030;

/** Marcas para la regla temporal. */
export const MARCAS = [
  [-50000, '50 000 a. C.'], [-20000, '20 000'], [-10000, '10 000'],
  [-5000, '5 000'], [-3000, '3 000'], [-1000, '1 000'], [0, 'año 0'],
  [500, '500'], [1000, '1 000'], [1500, '1 500'], [1800, '1 800'],
  [1900, '1 900'], [2000, '2 000'], [2100, '2 100'], [2200, '2 200'],
];

/** Saltos rápidos que ofrece la interfaz. */
export const SALTOS = [
  [-45000, 'Dispersión sapiens'],
  [-21000, 'Máximo glacial'],
  [-9000, 'Revolución neolítica'],
  [-3300, 'Primeras ciudades'],
  [-500, 'Aqueménidas y Grecia'],
  [117, 'Roma en su máximo'],
  [750, 'Califato omeya'],
  [1279, 'Imperio mongol'],
  [1347, 'Peste Negra'],
  [1521, 'Choque de mundos'],
  [1683, 'Otomanos ante Viena'],
  [1815, 'Tambora'],
  [1920, 'Cénit imperial'],
  [1945, 'Umbral nuclear'],
  [2025, 'Presente'],
  [2100, 'Escenario del Archivo'],
];
