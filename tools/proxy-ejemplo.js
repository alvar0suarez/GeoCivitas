/**
 * Proxy mínimo para el Analista del Archivo · Cloudflare Workers.
 *
 * Guarda la clave en el servidor en vez de en el navegador, que es la única
 * forma de compartir el atlas con otra persona sin regalarle tu cuenta.
 *
 * Despliegue:
 *   1. npm create cloudflare@latest geocivitas-proxy -- --type=hello-world
 *   2. sustituye src/index.js por este archivo
 *   3. npx wrangler secret put ANTHROPIC_API_KEY
 *   4. ajusta ORIGENES a tu dominio de Pages y despliega con npx wrangler deploy
 *   5. pega la URL resultante en el Analista, modo «proxy propio»
 *
 * El mismo código funciona casi tal cual como función de Vercel, Netlify o Deno
 * Deploy: lo único específico de Workers es la firma `export default { fetch }`.
 */

// Pon aquí tu dominio. Con '*' cualquiera puede gastar tu cuota.
const ORIGENES = [
  'https://TU-USUARIO.github.io',
  'http://localhost:8000',
];

// Techo de gasto por petición: el cliente no debería poder pedir más.
const MAX_TOKENS = 1500;
const MODELOS_PERMITIDOS = new Set([
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-haiku-4-5-20251001',
]);

export default {
  async fetch(peticion, entorno) {
    const origen = peticion.headers.get('Origin') || '';
    const permitido = ORIGENES.includes(origen);
    const cors = {
      'Access-Control-Allow-Origin': permitido ? origen : ORIGENES[0],
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    };

    if (peticion.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (peticion.method !== 'POST') {
      return json({ error: 'Sólo se admite POST.' }, 405, cors);
    }
    if (!permitido) {
      return json({ error: 'Origen no autorizado.' }, 403, cors);
    }

    let cuerpo;
    try {
      cuerpo = await peticion.json();
    } catch {
      return json({ error: 'El cuerpo no es JSON válido.' }, 400, cors);
    }

    if (!MODELOS_PERMITIDOS.has(cuerpo.model)) {
      return json({ error: `Modelo no permitido: ${cuerpo.model}` }, 400, cors);
    }
    // Se reescriben los límites en vez de confiar en lo que llega del navegador.
    cuerpo.max_tokens = Math.min(Number(cuerpo.max_tokens) || 1000, MAX_TOKENS);

    const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': entorno.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(cuerpo),
    });

    return new Response(respuesta.body, {
      status: respuesta.status,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  },
};

function json(datos, estado, cors) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}
