/**
 * Genera styles/fonts.css con las tipografías incrustadas como data URI.
 *
 * No se enlazan desde un CDN a propósito: la versión empaquetada se publica
 * bajo una política de contenido que bloquea cualquier host externo, y una
 * fuente que falla en silencio deja la página con la tipografía de sistema
 * que precisamente queremos evitar.
 *
 * Uso: node tools/build-fonts.mjs <dir-con-node_modules>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const mods = join(process.argv[2] || raiz, 'node_modules', '@fontsource');

const FUENTES = [
  ['IBM Plex Mono', 'ibm-plex-mono', 400],
  ['IBM Plex Mono', 'ibm-plex-mono', 600],
  ['Archivo', 'archivo', 400],
  ['Archivo', 'archivo', 600],
];

let css = `/* Generado por tools/build-fonts.mjs — no editar a mano.
   IBM Plex Mono (IBM, OFL 1.1) · Archivo (Omnibus-Type, OFL 1.1)
   Subconjunto latino, incrustado para que no dependa de la red. */\n\n`;

let bytes = 0;
for (const [familia, paquete, peso] of FUENTES) {
  const f = join(mods, paquete, 'files', `${paquete}-latin-${peso}-normal.woff2`);
  const b64 = readFileSync(f).toString('base64');
  bytes += b64.length;
  css += `@font-face{font-family:'${familia}';font-style:normal;font-weight:${peso};font-display:block;`
    + `src:url(data:font/woff2;base64,${b64}) format('woff2');`
    + `unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}\n`;
}

writeFileSync(join(raiz, 'styles', 'fonts.css'), css);
console.log(`styles/fonts.css · ${FUENTES.length} cortes · ${(bytes / 1024).toFixed(0)} KB en base64`);
