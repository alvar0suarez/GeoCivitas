/**
 * Analista del Archivo.
 *
 * Un modelo de lenguaje respondiendo de memoria sobre historia es exactamente
 * lo que un historiador no quiere: seguro de sí mismo y sin trazabilidad. Aquí
 * el modelo no recuerda nada — recibe los registros concretos del año en curso
 * y se le exige responder sólo con ellos, señalando lo que falte. Debajo de
 * cada respuesta se enseña qué se le pasó, para poder auditarla.
 *
 * Requiere credenciales, así que sólo funciona donde se hayan configurado:
 * un proxy propio (recomendado) o una clave en el navegador (sólo para uso
 * personal, porque queda expuesta a cualquier script de la página).
 */

import {
  D, activas, instantaneaDe, perfilControl, CONTROL, VIA,
  choquesActivos, batallasEn, inventosEn,
  tecnoDisponible, eventosEn, regional, ich, regimenesEn, debatesDe,
  global as gGlobal,
} from '../core/datos.js';
import { formatoAño, era } from '../core/escala.js';
import { porFormato } from '../core/series.js';

const CLAVE_ALMACEN = 'geocivitas.analista';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const MODELOS = [
  ['claude-sonnet-5', 'Sonnet 5 · equilibrado'],
  ['claude-opus-5', 'Opus 5 · máxima capacidad'],
  ['claude-haiku-4-5-20251001', 'Haiku 4.5 · rápido y barato'],
];

export function leerConfig() {
  try { return JSON.parse(localStorage.getItem(CLAVE_ALMACEN)) || {}; }
  catch { return {}; }
}

export function guardarConfig(c) {
  localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(c));
}

export const configurado = () => {
  const c = leerConfig();
  return Boolean((c.modo === 'proxy' && c.url) || (c.modo === 'directo' && c.clave));
};

/* ── contexto ──────────────────────────────────────────────── */

/**
 * Empaqueta lo que el atlas sabe del momento seleccionado. Es deliberadamente
 * literal: son los registros, no un resumen, para que la respuesta se pueda
 * contrastar contra ellos línea a línea.
 */
export function construirContexto(est) {
  const a = est.año;
  const ctx = { año: a, era: era(a), escenario: a > 2030 };

  ctx.serieGlobal = Object.fromEntries(
    Object.entries(D.humanidad.metricas).map(([k, m]) => [m.label, `${porFormato(gGlobal(k, a), m.fmt)} ${m.unit}`]));

  ctx.entidades = activas(a).map((p) => {
    const s = instantaneaDe(p, a);
    const perfil = perfilControl(s);
    return {
      nombre: p.name, tipo: p.kind, vigencia: `${formatoAño(p.from)} — ${formatoAño(p.to)}`,
      sede: p.seat, instantanea: s ? formatoAño(s.year) : null,
      escenario: !!p.speculative, analisis: p.dossier,
      // El desglose por grado de control es lo que permite responder «¿hasta
      // dónde mandaba de verdad?» sin inventar: cada zona va con su ficha.
      indiceDeControl: perfil.indice != null ? +perfil.indice.toFixed(0) : null,
      extensionMillonesKm2: +perfil.area.toFixed(1),
      reparto: perfil.partes.map((x) => `${CONTROL[x.control].label}: ${x.pct.toFixed(0)} %`),
      zonas: perfil.partes.flatMap((x) => x.zonas.filter((z) => z.nombre).map((z) => ({
        zona: z.nombre, grado: CONTROL[x.control].label,
        adquirida: z.via ? VIA[z.via] : null, desde: z.desde != null ? formatoAño(z.desde) : null,
        guarnicion: z.guarnicion ?? null, porcentajeDelErario: z.fiscal ?? null,
        riesgoDeRevueltaAnual: z.revuelta ?? null, nota: z.nota ?? null,
      }))),
      controversias: debatesDe('polities', p.id).map((d) => d.tema),
    };
  });

  ctx.regiones = D.regiones.map((r) => ({
    nombre: r.name,
    ich: +(ich(r, a) * 100).toFixed(1),
    poblacionMillones: +porFormato(regional(r, 'pop', a), '0.0').replace(',', '.'),
    esperanzaVida: +porFormato(regional(r, 'lifeExp', a), '0.0').replace(',', '.'),
    rentaPorPersona: Math.round(regional(r, 'gdppc', a)),
    nota: r.nota,
  }));

  ctx.gobierno = regimenesEn(a).map((x) => `${x.tipo.name}: ${x.pct.toFixed(1)} %`);

  ctx.choquesEnCurso = choquesActivos(a, 0).map((s) => ({
    nombre: s.name, lugar: s.place, tipo: s.type, severidad: s.severity,
    muertesEstimadas: s.deaths ?? null, nota: s.note,
    controversias: debatesDe('choques', s.id).map((d) => d.tema),
  }));

  ctx.batallasCercanas = batallasEn(a, 60).map((b) => ({
    nombre: b.name, año: formatoAño(b.year), bandos: b.bandos,
    vencedor: b.vence === -1 ? 'sin vencedor claro' : b.bandos[b.vence],
    efecto: b.efecto,
  }));

  ctx.invencionesRecientes = inventosEn(a, 120).slice(-10).map((i) => ({
    nombre: i.name, año: formatoAño(i.year), campo: i.campo, nota: i.nota,
  }));

  ctx.umbralesMilitares = tecnoDisponible(a).slice(-6).map((t) => ({
    nombre: t.name, año: formatoAño(t.year), nota: t.note,
  }));

  ctx.hitos = eventosEn(a, 100).map((e) => ({ nombre: e.t, año: formatoAño(e.year), nota: e.d }));

  const s = est.seleccion;
  if (s) {
    const nombre = s.pol?.name || s.reg?.name || s.choque?.name || s.batalla?.name
      || s.invento?.name || s.familia?.name || s.tecno?.name || s.ciudad?.n || s.debate?.tema;
    if (nombre) ctx.seleccionActual = { tipo: s.tipo, nombre };
  }

  ctx.avisosDeProcedencia = D.fuentes.confianza.map((c) => `${c.registro}: confianza ${c.nivel}. ${c.nota}`);
  ctx.debatesAbiertos = D.fuentes.debates.map((d) => ({
    tema: d.tema, posiciones: d.posiciones.map((p) => `${p.quien}: ${p.que}`), estado: d.estado,
  }));

  return ctx;
}

const INSTRUCCIONES = `Eres el analista del Archivo de GEOCIVITAS, un atlas histórico. Respondes en español, a un lector con formación histórica.

Reglas que no puedes saltarte:

1. Responde a partir de los REGISTROS que se te entregan. Son la única fuente autorizada de esta conversación.
2. Si la pregunta requiere algo que no está en los registros, dilo explícitamente: «el Archivo no contiene esto». Puedes añadir contexto general que consideres bien establecido, pero márcalo claramente como «fuera del Archivo» para que el lector sepa distinguirlo.
3. Cuando un dato aparezca en la lista de controversias o de avisos de procedencia, menciónalo. Un número discutido presentado como firme es un error, no una simplificación.
4. Las extensiones territoriales del atlas son estilizadas y sirven a escala continental. Nunca las uses para afirmar dónde estaba exactamente una frontera.
5. Todo lo posterior a 2030 es escenario prospectivo, no predicción. Trátalo como tal siempre.
6. Sé concreto y breve: entre 120 y 250 palabras salvo que te pidan más. Cifras con su unidad. Sin listas de tópicos ni relleno.
7. No halagues la pregunta ni te disculpes. Empieza por la respuesta.`;

/* ── llamada ───────────────────────────────────────────────── */

export async function preguntar(pregunta, est, señal) {
  const cfg = leerConfig();
  const contexto = construirContexto(est);
  const cuerpo = {
    model: cfg.modelo || MODELOS[0][0],
    max_tokens: 1200,
    system: INSTRUCCIONES,
    messages: [{
      role: 'user',
      content: `REGISTROS DEL ARCHIVO para el año ${formatoAño(est.año)}:\n\n`
        + '```json\n' + JSON.stringify(contexto, null, 1) + '\n```\n\n'
        + `PREGUNTA: ${pregunta}`,
    }],
  };

  let respuesta;
  if (cfg.modo === 'proxy') {
    respuesta = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: señal,
    });
  } else {
    respuesta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.clave,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(cuerpo),
      signal: señal,
    });
  }

  if (!respuesta.ok) {
    const t = await respuesta.text().catch(() => '');
    throw new Error(`El servicio respondió ${respuesta.status}. ${t.slice(0, 240)}`);
  }
  const j = await respuesta.json();
  const texto = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (!texto) throw new Error('La respuesta llegó vacía.');
  return { texto, contexto, uso: j.usage || null };
}

/* ── interfaz ──────────────────────────────────────────────── */

export const SUGERENCIAS = [
  '¿Qué tenían en común los estados activos este año?',
  '¿Qué explica mejor la diferencia de condición humana entre regiones ahora?',
  '¿Qué habría sorprendido a un viajero que llegara de un siglo antes?',
  '¿Qué dato de esta vista es el menos fiable y por qué?',
  'Contrasta las dos regiones con mayor y menor renta por persona.',
];

export function pintarAnalista(cont, est) {
  const cfg = leerConfig();
  const listo = configurado();
  const ctx = construirContexto(est);
  const n = (x) => (Array.isArray(x) ? x.length : 0);

  cont.innerHTML = `
    <div class="ana">
      <div class="ana__ctx">
        <div class="sim__lb">SE LE ENTREGARÁ AL MODELO</div>
        <div>
          <span class="chip">año ${esc(formatoAño(est.año))}</span>
          <span class="chip">${n(ctx.entidades)} entidades</span>
          <span class="chip">${n(ctx.regiones)} regiones</span>
          <span class="chip">${n(ctx.choquesEnCurso)} choques</span>
          <span class="chip">${n(ctx.batallasCercanas)} batallas</span>
          <span class="chip">${n(ctx.invencionesRecientes)} invenciones</span>
          <span class="chip">${n(ctx.hitos)} hitos</span>
          <span class="chip">${n(ctx.debatesAbiertos)} debates</span>
        </div>
        <p class="txt" style="font-size:10.5px;color:var(--ink-faint);margin-top:8px">
          El modelo no responde de memoria: recibe estos registros y se le exige ceñirse a ellos,
          marcar lo que quede fuera y señalar lo que esté en discusión.</p>
      </div>

      <details class="ana__cfg" ${listo ? '' : 'open'}>
        <summary>${listo ? `Conexión configurada · ${esc(cfg.modo === 'proxy' ? 'proxy propio' : 'clave en el navegador')}` : 'Configurar conexión'}</summary>

        <div class="aviso" style="margin-top:12px">
          <b>Antes de elegir.</b> Un <b>proxy propio</b> —una función sin servidor que guarda la clave y reenvía la petición—
          es la única forma segura de compartir esto con otra persona.
          Una <b>clave en el navegador</b> queda expuesta a cualquier script de la página y no se puede limitar:
          úsala sólo en tu equipo y con una clave que puedas revocar.
        </div>

        <div class="sim__lb" style="margin-top:12px">MODO</div>
        <select class="sim__sel" id="anaModo">
          <option value="proxy"${cfg.modo !== 'directo' ? ' selected' : ''}>Proxy propio (recomendado)</option>
          <option value="directo"${cfg.modo === 'directo' ? ' selected' : ''}>Clave en el navegador (sólo uso personal)</option>
        </select>

        <div id="anaProxy" ${cfg.modo === 'directo' ? 'hidden' : ''}>
          <div class="sim__lb">URL DEL PROXY</div>
          <input class="sim__sel" id="anaUrl" type="url" placeholder="https://mi-proxy.workers.dev/mensajes" value="${esc(cfg.url || '')}" />
          <p class="txt" style="font-size:10.5px;color:var(--ink-faint)">
            Debe aceptar un POST con el cuerpo de la API de mensajes de Anthropic y devolver su respuesta tal cual.
            En el repositorio hay un ejemplo de treinta líneas para Cloudflare Workers.</p>
        </div>

        <div id="anaDirecto" ${cfg.modo === 'directo' ? '' : 'hidden'}>
          <div class="sim__lb">CLAVE DE API</div>
          <input class="sim__sel" id="anaClave" type="password" placeholder="sk-ant-…" value="${esc(cfg.clave || '')}" autocomplete="off" />
          <p class="txt" style="font-size:10.5px;color:var(--ink-faint)">Se guarda sólo en este navegador y no se envía a ningún sitio salvo a la API.</p>
        </div>

        <div class="sim__lb">MODELO</div>
        <select class="sim__sel" id="anaModelo">
          ${MODELOS.map(([id, lb]) => `<option value="${id}"${cfg.modelo === id ? ' selected' : ''}>${esc(lb)}</option>`).join('')}
        </select>

        <button class="railbtn" id="anaGuardar">GUARDAR CONEXIÓN</button>
      </details>

      <div class="sim__lb" style="margin-top:16px">PREGUNTAS SUGERIDAS</div>
      <div>${SUGERENCIAS.map((s) => `<button class="chip chip--btn" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div>

      <div class="ana__caja">
        <textarea id="anaPregunta" rows="2" placeholder="Pregunta sobre este año, esta región o esta entidad…"></textarea>
        <button class="railbtn" id="anaEnviar" ${listo ? '' : 'disabled'}>PREGUNTAR AL ARCHIVO</button>
      </div>

      <div id="anaSalida"></div>
    </div>`;

  return {
    modo: cont.querySelector('#anaModo'),
    url: cont.querySelector('#anaUrl'),
    clave: cont.querySelector('#anaClave'),
    modelo: cont.querySelector('#anaModelo'),
    guardar: cont.querySelector('#anaGuardar'),
    pregunta: cont.querySelector('#anaPregunta'),
    enviar: cont.querySelector('#anaEnviar'),
    salida: cont.querySelector('#anaSalida'),
  };
}

/** Markdown mínimo: negrita, cursiva, listas y párrafos. Nada de HTML crudo. */
export function formatearRespuesta(md) {
  return esc(md)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .split(/\n{2,}/)
    .map((p) => (/^\s*[-–•]\s/m.test(p)
      ? `<ul>${p.split('\n').filter(Boolean).map((l) => `<li>${l.replace(/^\s*[-–•]\s*/, '')}</li>`).join('')}</ul>`
      : `<p>${p.replace(/\n/g, '<br>')}</p>`))
    .join('');
}
