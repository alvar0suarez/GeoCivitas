/**
 * Empaqueta la aplicación en un único archivo HTML autocontenido.
 *
 * El Archivo se incrusta como `window.__GEO_DATA` (datos.js lo detecta y se
 * salta el fetch), el CSS va en línea y los módulos ES se agrupan con esbuild.
 * El resultado se puede abrir desde el disco o publicar donde no haya servidor.
 *
 * Uso: node tools/build-artifact.mjs [ruta-de-salida]
 *      (esbuild debe estar disponible; se pasa por --esbuild o NODE_PATH)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const salida = resolve(process.argv[2] || join(raiz, 'dist', 'geocivitas.html'));

const { build } = await import(process.env.ESBUILD || 'esbuild');

const DATOS = [
  ['mundo', 'world.json'], ['polities', 'polities.json'], ['prehistoria', 'prehistory.json'],
  ['choques', 'shocks.json'], ['tecno', 'weapons.json'], ['humanidad', 'humanidad.json'],
  ['geo', 'geografia.json'], ['ciudades', 'ciudades.json'], ['eventos', 'eventos.json'],
  ['batallas', 'batallas.json'], ['inventos', 'inventos.json'], ['lenguas', 'lenguas.json'],
  ['politica', 'politica.json'],
];

const archivo = {};
for (const [clave, f] of DATOS) archivo[clave] = JSON.parse(readFileSync(join(raiz, 'data', f), 'utf8'));

const res = await build({
  entryPoints: [join(raiz, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2021'],
  write: false,
  legalComments: 'none',
});
const js = res.outputFiles[0].text;
const css = readFileSync(join(raiz, 'styles', 'fonts.css'), 'utf8')
  + '\n' + readFileSync(join(raiz, 'styles', 'app.css'), 'utf8');

// El cuerpo de index.html, sin la etiqueta de módulo ni el enlace al CSS.
const html = readFileSync(join(raiz, 'index.html'), 'utf8')
  .replace(/^[\s\S]*?<body>/i, '')
  .replace(/<\/body>[\s\S]*$/i, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<link[^>]*>/gi, '')
  .trim();

// `</script>` dentro de una cadena cerraría la etiqueta antes de tiempo.
const json = JSON.stringify(archivo).replace(/</g, '\\u003c');

const doc = `<title>GEOCIVITAS · Atlas de la Humanidad</title>
<style>
${css}
</style>

${html}

<script>window.__GEO_DATA=${json};</script>
<script>
${js}
</script>
`;

mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, doc);
console.log(`${salida}  ·  ${(Buffer.byteLength(doc) / 1024).toFixed(0)} KB` +
  `  (datos ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB · código ${(Buffer.byteLength(js) / 1024).toFixed(0)} KB)`);
