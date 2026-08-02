/** Construcción del panel lateral: expediente, mundo y archivo. */

import {
  D, CONTROL, VIA, perfilDe, indiceControl, areaZona,
  activas, instantaneaDe, choquesActivos, tecnoDisponible,
  difusion, eventosEn, regional, ich, COMPONENTES_ICH, global as gGlobal,
  horizonteDe, TIPO_BANDA, ciudadesActivas, batallasEn, inventosEn,
  regimenesEn, institucionesEn, poblacionCiudad, debatesDe, NIVEL_CONFIANZA,
} from '../core/datos.js';
import { porFormato, num, compacto, clamp, RAMPAS, rgba } from '../core/series.js';
import { formatoAño, era } from '../core/escala.js';
import { ESCALAS } from '../render/atlas.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── minigráficos ──────────────────────────────────────────── */

export function chispa(años, vals, añoActual, color = '#22d3ee') {
  const n = vals.length;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const rg = hi - lo || 1;
  const X = (i) => (i / (n - 1)) * 100;
  const Y = (v) => 20 - ((v - lo) / rg) * 18 - 1;
  let d = '';
  for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(vals[i]).toFixed(1)}`;
  // posición del año actual
  let ix = 0;
  for (let i = 0; i < n; i++) if (años[i] <= añoActual) ix = i;
  const px = X(ix);
  return `<svg class="stat__spark" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.1" vector-effect="non-scaling-stroke"/>
    <line x1="${px.toFixed(1)}" y1="0" x2="${px.toFixed(1)}" y2="20" stroke="#f5b642" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".85"/>
  </svg>`;
}

function tarjeta(clave, etiqueta, valor, unidad, spark) {
  return `<div class="stat__c"><div class="stat__k">${esc(etiqueta)}</div>
    <div class="stat__v">${valor}<span class="stat__u">${esc(unidad)}</span></div>${spark || ''}</div>`;
}

/** Marca visible cuando un registro está en discusión historiográfica. */
function avisoDebate(familia, id) {
  const ds = debatesDe(familia, id);
  if (!ds.length) return '';
  return ds.map((d) => `
    <button class="disputa" data-debate="${esc(d.id)}">
      <span class="disputa__t">EN DISCUSIÓN · ${esc(d.tema)}</span>
      <span class="disputa__d">${esc(d.estado)}</span>
    </button>`).join('');
}

/* ── expediente ────────────────────────────────────────────── */

export function expediente(est) {
  const s = est.seleccion;
  if (!s) return vacio(est);
  switch (s.tipo) {
    case 'polity': return fichaPolity(s.pol, est);
    case 'region': return fichaRegion(s.reg, est);
    case 'choque': return fichaChoque(s.choque);
    case 'tecno':  return fichaTecno(s.tecno, est);
    case 'evento': return fichaEvento(s.evento);
    case 'paso':   return fichaPaso(s.paso);
    case 'ruta':   return fichaRuta(s.ruta);
    case 'banda':  return fichaBanda(s.banda, s.horizonte);
    case 'batalla': return fichaBatalla(s.batalla);
    case 'invento': return fichaInvento(s.invento, est);
    case 'lengua': return fichaLengua(s.familia, est);
    case 'teoria': return fichaTeoria(s.teoria);
    case 'institucion': return fichaInstitucion(s.inst);
    case 'ciudad': return fichaCiudad(s.ciudad, est);
    case 'debate': return fichaDebate(s.debate);
    default: return vacio(est);
  }
}

function vacio(est) {
  const h = est.año <= -2800 ? horizonteDe(est.año) : null;
  return `<div class="sec">
    <div class="sub">${esc(era(est.año))}</div>
    <h2 class="ttl">${esc(formatoAño(est.año))}</h2>
    ${h ? `<p class="txt"><b>${esc(h.titulo)}.</b> ${esc(h.resumen)}</p>` : ''}
    ${notaDelAño(est.año)}
  </div>
  <div class="empty">Pincha cualquier mancha, ciudad o marca del mapa<br>para abrir su expediente.<br><br>
  Arrastra para girar el globo · rueda para acercar</div>`;
}

function notaDelAño(año) {
  const notas = D.humanidad.notasGlobales;
  let mejor = null;
  for (const n of notas) if (Math.abs(n.year - año) < Math.abs((mejor?.year ?? -1e9) - año)) mejor = n;
  if (!mejor || Math.abs(mejor.year - año) > 900) return '';
  return `<p class="txt" style="border-left:2px solid var(--cy-d);padding-left:10px">${esc(mejor.texto)}</p>`;
}

function fichaPolity(pol, est) {
  const snap = instantaneaDe(pol, est.año);
  const perfil = perfilDe(pol, est.año);
  const clases = perfil.partes.map((p) => p.control);
  const dur = pol.to - pol.from;
  const trans = clamp((est.año - pol.from) / Math.max(1, dur), 0, 1);

  return `
  <div class="sec">
    <div class="sub" style="color:${pol.color}">${esc(pol.kind)}${pol.speculative ? ' · escenario' : ''}</div>
    <h2 class="ttl">${esc(pol.name)}</h2>
    <div>${clases.map((z) => `<span class="chip chip--on" title="${esc(CONTROL[z].desc)}">${esc(CONTROL[z].label)}</span>`).join('')}
      ${pol.speculative ? '<span class="chip chip--spec">PROSPECTIVO</span>' : ''}</div>
  </div>

  ${bloqueMando(pol, perfil, est)}

  <div class="sec">
    <div class="sec__t">TRAYECTORIA</div>
    <div class="kv"><div class="kv__k">Vigencia</div><div class="kv__v">${esc(formatoAño(pol.from))} — ${esc(formatoAño(pol.to))} · ${num(dur)} años</div></div>
    <div class="kv"><div class="kv__k">Sede</div><div class="kv__v">${esc(pol.seat)}</div></div>
    <div class="kv"><div class="kv__k">Instantánea</div><div class="kv__v">${snap ? esc(formatoAño(snap.year)) : '—'}</div></div>
    ${serieMando(pol, est)}
    <div class="bar"><i style="width:${(trans * 100).toFixed(1)}%;background:${pol.color}"></i></div>
    <div class="sub" style="margin:4px 0 0">${(trans * 100).toFixed(0)} % de su vida transcurrida</div>
  </div>

  <div class="sec">
    <div class="sec__t">ANÁLISIS</div>
    <div class="kv"><div class="kv__k">Base</div><div class="kv__v">${esc(pol.dossier.base)}</div></div>
    <div class="kv"><div class="kv__k">Estado</div><div class="kv__v">${esc(pol.dossier.estado)}</div></div>
    <div class="kv"><div class="kv__k">Límite</div><div class="kv__v">${esc(pol.dossier.limite)}</div></div>
    <div class="kv"><div class="kv__k">Colapso</div><div class="kv__v">${esc(pol.dossier.colapso)}</div></div>
  </div>

  ${avisoDebate('polities', pol.id)}
  <button class="railbtn" data-sim="${esc(pol.id)}">SIMULAR CAMPAÑA DESDE AQUÍ</button>`;
}

/**
 * Perfil de mando: cómo se reparte la extensión por grado de control.
 *
 * Es la cifra que separa dos imperios que en un mapa plano ocupan lo mismo.
 * Un 80 % de superficie en tributarios y un 80 % en provincias son dos
 * animales distintos: el primero se evapora en una generación.
 */
function bloqueMando(pol, perfil, est) {
  if (!perfil.partes.length) return '';
  const idx = perfil.indice;
  const col = RAMPAS.mando(idx / 100);

  const barra = perfil.partes.map((p) => {
    const c = CONTROL[p.control];
    return `<i style="width:${p.pct.toFixed(2)}%;background:${RAMPAS.mando(c.idx / 100)}"
      title="${esc(c.label)}: ${p.pct.toFixed(1)} % de la extensión"></i>`;
  }).join('');

  const filas = perfil.partes.map((p) => {
    const c = CONTROL[p.control];
    return `<div class="kv">
      <div class="kv__k"><span class="dotc" style="background:${RAMPAS.mando(c.idx / 100)}"></span>${esc(c.label)}</div>
      <div class="kv__v"><b style="font-family:var(--mono)">${p.pct.toFixed(0)} %</b>
        <span style="color:var(--ink-faint);font-size:10px"> · ${num(p.area, 1)} M km² · índice ${c.idx}</span>
        ${detalleZonas(p.zonas)}</div></div>`;
  }).join('');

  return `<div class="sec">
    <div class="sec__t">MANDO EFECTIVO</div>
    <div class="mando__cab">
      <b class="mando__num" style="color:${col}">${idx.toFixed(0)}</b>
      <span class="mando__leg">índice de control sobre 100 · ${num(perfil.area, 1)} M km² gobernados nominalmente</span>
    </div>
    <div class="stack">${barra}</div>
    ${filas}
    <p class="txt" style="font-size:10px;color:var(--ink-faint)">El índice pondera cada grado por la superficie que ocupa. No mide poder: mide cuánto de lo que el centro ordena llega a ejecutarse.</p>
  </div>`;
}

function detalleZonas(zonas) {
  // Una zona a medio absorber llega partida en trozos —lo que ya estaba, lo que
  // entra, lo que se va—; en el desglose es una sola línea, con su transición.
  const porNombre = new Map();
  for (const z of zonas) {
    if (!(z.nombre || z.nota || z.via || z.guarnicion != null || z.fiscal != null || z.revuelta != null)) continue;
    const clave = z.nombre || JSON.stringify(z.box || z.members);
    const ya = porNombre.get(clave);
    if (!ya) porNombre.set(clave, { ...z, mueve: z.transitoria || null });
    else {
      ya.mueve = ya.mueve || z.transitoria || null;
      if ((z.peso ?? 1) > (ya.peso ?? 1)) Object.assign(ya, { peso: z.peso });
    }
  }
  if (!porNombre.size) return '';

  return `<div class="zonas">${[...porNombre.values()].map((z) => {
    const marcas = [];
    if (z.via && VIA[z.via]) marcas.push(esc(VIA[z.via]));
    if (z.desde != null) marcas.push(`desde ${esc(formatoAño(z.desde))}`);
    if (z.hasta != null) marcas.push(`hasta ${esc(formatoAño(z.hasta))}`);
    if (z.guarnicion != null) marcas.push(`guarnición ${num(z.guarnicion)}`);
    if (z.fiscal != null) marcas.push(`rinde ${z.fiscal} % del erario`);
    if (z.revuelta != null) marcas.push(`revuelta ${z.revuelta} %/año`);
    const mov = z.mueve === 'entra' ? 'incorporándose'
      : z.mueve === 'sale' ? 'perdiéndose'
        : (z.peso ?? 1) < 0.97 ? 'en transición' : null;
    return `<div class="zona">
      ${z.nombre ? `<b class="zona__n">${esc(z.nombre)}${mov ? `<span class="zona__t">${mov}</span>` : ''}</b>` : ''}
      ${marcas.length ? `<span class="zona__m">${marcas.join(' · ')}</span>` : ''}
      ${z.nota ? `<span class="zona__d">${esc(z.nota)}</span>` : ''}</div>`;
  }).join('')}</div>`;
}

/** Evolución del índice de mando a lo largo de la vida de la entidad. */
function serieMando(pol, est) {
  if (pol.snapshots.length < 2) return '';
  const años = pol.snapshots.map((s) => s.year);
  const vals = años.map((y) => indiceControl(pol, clamp(y, pol.from, pol.to)) ?? 0);
  if (vals.every((v) => Math.abs(v - vals[0]) < 0.5)) return '';
  return `<div class="kv"><div class="kv__k">Mando</div>
    <div class="kv__v">${chispa(años, vals, est.año, '#f5b642')}
    <span style="color:var(--ink-faint);font-size:10px">${vals.map((v) => v.toFixed(0)).join(' → ')}</span></div></div>`;
}

function fichaRegion(reg, est) {
  const año = est.año;
  const i = ich(reg, año);
  const g = D.gl;
  const serieICH = g.years.map((y) => ich(reg, y));

  const filas = Object.entries(D.humanidad.metricas).map(([k, m]) => {
    const v = regional(reg, k, año);
    const mundo = gGlobal(k, año);
    const rel = mundo ? v / mundo : 1;
    const bueno = m.dir > 0 ? rel > 1.05 : rel < 0.95;
    const malo = m.dir > 0 ? rel < 0.95 : rel > 1.05;
    const col = bueno ? '#a3e635' : malo ? '#fb7185' : 'var(--ink-dim)';
    return `<div class="kv"><div class="kv__k">${esc(m.label)}</div>
      <div class="kv__v"><b style="font-family:var(--mono)">${porFormato(v, m.fmt)}</b>
      <span style="color:var(--ink-faint);font-size:10px"> ${esc(m.unit)}</span>
      <span style="color:${col};font-family:var(--mono);font-size:10px;margin-left:6px">${rel >= 1 ? '+' : ''}${((rel - 1) * 100).toFixed(0)} % vs mundo</span></div></div>`;
  }).join('');

  return `
  <div class="sec">
    <div class="sub">Macrorregión · ${esc(formatoAño(año))}</div>
    <h2 class="ttl">${esc(reg.name)}</h2>
    <p class="txt">${esc(reg.nota)}</p>
  </div>

  <div class="sec">
    <div class="sec__t">ÍNDICE DE CONDICIÓN HUMANA</div>
    <div class="stat" style="grid-template-columns:1fr">
      ${tarjeta('ich', 'ICH', (i * 100).toFixed(1), '/100', chispa(g.years, serieICH, año))}
    </div>
    <div style="margin-top:8px">
      ${COMPONENTES_ICH.map(([k, lb]) => {
        const m = D.humanidad.metricas[k];
        const v = regional(reg, k, año);
        const e = ESCALAS[k];
        let t = clamp((v - e.lo) / (e.hi - e.lo), 0, 1);
        if (e.inv) t = 1 - t;
        return `<div class="fac"><div class="fac__k">${esc(lb)}</div>
          <div class="fac__bar"><i style="left:0;width:${(t * 100).toFixed(0)}%"></i></div>
          <div class="fac__v">${porFormato(v, m.fmt)}</div></div>`;
      }).join('')}
    </div>
  </div>

  <div class="sec">
    <div class="sec__t">INDICADORES</div>
    ${filas}
  </div>`;
}

function fichaChoque(s) {
  const fin = s.endYear ?? s.year;
  return `
  <div class="sec">
    <div class="sub" style="color:#fb7185">Choque · ${esc(D.choques.meta.tipos[s.type] || s.type)}</div>
    <h2 class="ttl">${esc(s.name)}</h2>
    <div class="sub">${esc(s.place)} · ${esc(formatoAño(s.year))}${fin !== s.year ? ' — ' + esc(formatoAño(fin)) : ''}</div>
    ${s.speculative ? '<span class="chip chip--spec">ESCENARIO</span>' : ''}
    <p class="txt">${esc(s.note)}</p>
  </div>
  <div class="sec">
    <div class="sec__t">MAGNITUD</div>
    <div class="stat">
      ${tarjeta('', 'SEVERIDAD', s.severity, '/5')}
      ${tarjeta('', 'MUERTES EST.', s.deaths ? compacto(s.deaths) : '—', '')}
      ${tarjeta('', 'DURACIÓN', fin - s.year || '<1', 'años')}
      ${tarjeta('', 'HUELLA', num(s.radius), 'km')}
    </div>
    ${avisoDebate('choques', s.id)}
  </div>`;
}

function fichaTecno(t, est) {
  const d = difusion(t, est.año);
  const ef = Object.entries(t.effects || {});
  return `
  <div class="sec">
    <div class="sub" style="color:#a3e635">Umbral tecnomilitar · ${esc(t.class)}</div>
    <h2 class="ttl">${esc(t.name)}</h2>
    <div class="sub">${esc(formatoAño(t.year))} · difusión ${num(t.spread)} años</div>
    ${t.speculative ? '<span class="chip chip--spec">ESCENARIO</span>' : ''}
    <p class="txt">${esc(t.note)}</p>
    <div class="bar"><i style="width:${(d * 100).toFixed(0)}%;background:#a3e635"></i></div>
    <div class="sub" style="margin:4px 0 0">${(d * 100).toFixed(0)} % difundida en ${esc(formatoAño(est.año))}</div>
  </div>
  <div class="sec">
    <div class="sec__t">EFECTOS SOBRE EL MOTOR</div>
    ${ef.map(([k, v]) => `<div class="fac"><div class="fac__k">${esc(k)}</div>
      <div class="fac__bar"><i class="${v < 0 ? 'neg' : ''}" style="${v < 0 ? `right:50%;width:${(-v * 50).toFixed(0)}%;left:auto` : `left:50%;width:${(v * 50).toFixed(0)}%`}"></i></div>
      <div class="fac__v">${v > 0 ? '+' : ''}${v.toFixed(2)}</div></div>`).join('')}
    ${avisoDebate('tecno', t.id)}
  </div>`;
}

function fichaEvento(e) {
  return `<div class="sec">
    <div class="sub">Hito · ${esc(D.eventos.meta.tipos[e.type] || e.type)}</div>
    <h2 class="ttl">${esc(e.t)}</h2>
    <div class="sub">${esc(formatoAño(e.year))}</div>
    ${e.speculative ? '<span class="chip chip--spec">ESCENARIO</span>' : ''}
    <p class="txt">${esc(e.d)}</p>
  </div>`;
}

function fichaPaso(p) {
  return `<div class="sec">
    <div class="sub">Paso obligado · ${esc(p.tipo)}</div>
    <h2 class="ttl">${esc(p.name)}</h2>
    <p class="txt">${esc(p.nota)}</p>
    <p class="txt" style="color:var(--ink-faint);font-size:11px">Los cuellos de botella no producen riqueza: la gravan. Quien los controla cobra sin fabricar nada.</p>
  </div>`;
}

function fichaRuta(r) {
  return `<div class="sec">
    <div class="sub">Ruta · ${esc(r.tipo)}</div>
    <h2 class="ttl">${esc(r.name)}</h2>
    <div class="sub">${esc(formatoAño(r.from))} — ${esc(formatoAño(r.to))}</div>
    ${r.speculative ? '<span class="chip chip--spec">ESCENARIO</span>' : ''}
    <p class="txt">${esc(r.nota)}</p>
  </div>`;
}

function fichaBanda(b, h) {
  const info = TIPO_BANDA[b.kind] || TIPO_BANDA.sapiens;
  return `<div class="sec">
    <div class="sub" style="color:${info.c}">${esc(info.label)}</div>
    <h2 class="ttl">${esc(b.name)}</h2>
    <div class="sub">${esc(h.titulo)} · ${esc(formatoAño(h.year))}</div>
    <p class="txt">${esc(h.resumen)}</p>
    <div class="kv"><div class="kv__k">Población mundial</div><div class="kv__v">${num(h.poblacionMundial, 1)} millones</div></div>
    <p class="txt" style="color:var(--ink-faint);font-size:11px">${esc(D.prehistoria.meta.nota)}</p>
  </div>`;
}

function fichaBatalla(b) {
  const emp = b.vence === -1;
  return `<div class="sec">
    <div class="sub" style="color:#fb7185">Encuentro decisivo · ${esc(b.tipo)}</div>
    <h2 class="ttl">${esc(b.name)}</h2>
    <div class="sub">${esc(formatoAño(b.year))}</div>
    <div class="bar"><i style="width:${b.peso * 20}%;background:#fb7185"></i></div>
    <div class="sub" style="margin:4px 0 12px">peso histórico ${b.peso}/5</div>
  </div>
  <div class="sec">
    <div class="sec__t">CONTENDIENTES</div>
    ${b.bandos.map((n, i) => `
      <div class="kv"><div class="kv__k" style="color:${emp ? 'var(--ink-dim)' : i === b.vence ? '#a3e635' : '#fb7185'}">
        ${emp ? 'Bando ' + (i + 1) : i === b.vence ? 'Vence' : 'Pierde'}</div>
      <div class="kv__v">${esc(n)}<br><span style="font-family:var(--mono);font-size:10px;color:var(--ink-faint)">≈ ${num(b.fuerzas[i])} efectivos</span></div></div>`).join('')}
    ${emp ? '<p class="txt" style="font-size:11px;color:var(--ink-faint)">Sin vencedor claro sobre el terreno.</p>' : ''}
  </div>
  <div class="sec">
    <div class="sec__t">POR QUÉ IMPORTA</div>
    <p class="txt">${esc(b.efecto)}</p>
  </div>`;
}

function fichaInvento(inv, est) {
  const d = clamp((est.año - inv.year) / Math.max(1, inv.difusion), 0, 1);
  const campo = D.inventos.meta.campos[inv.campo] || inv.campo;
  return `<div class="sec">
    <div class="sub" style="color:#67e8f9">Invención · ${esc(campo)}</div>
    <h2 class="ttl">${esc(inv.name)}</h2>
    <div class="sub">${esc(formatoAño(inv.year))}</div>
    ${inv.speculative ? '<span class="chip chip--spec">ESCENARIO</span>' : ''}
    <p class="txt">${esc(inv.nota)}</p>
  </div>
  <div class="sec">
    <div class="sec__t">ALCANCE</div>
    <div class="kv"><div class="kv__k">Impacto</div><div class="kv__v">${'▮'.repeat(inv.impacto)}${'▯'.repeat(5 - inv.impacto)} ${inv.impacto}/5</div></div>
    <div class="kv"><div class="kv__k">Difusión plena</div><div class="kv__v">${num(inv.difusion)} años</div></div>
    <div class="bar"><i style="width:${(d * 100).toFixed(0)}%;background:#67e8f9"></i></div>
    <div class="sub" style="margin:4px 0 0">${(d * 100).toFixed(0)} % difundida en ${esc(formatoAño(est.año))}</div>
  </div>`;
}

function fichaLengua(f, est) {
  return `<div class="sec">
    <div class="sub" style="color:${f.color}">Familia lingüística</div>
    <h2 class="ttl">${esc(f.name)}</h2>
    <div class="sub">Patria reconstruida · ${esc(formatoAño(f.fecha))}</div>
    <p class="txt">${esc(f.nota)}</p>
  </div>
  <div class="sec">
    <div class="sec__t">DATOS</div>
    <div class="kv"><div class="kv__k">Hablantes hoy</div><div class="kv__v">${f.hablantes >= 1 ? num(f.hablantes) + ' millones' : num(f.hablantes * 1000) + ' mil'}</div></div>
    <div class="kv"><div class="kv__k">Etapas trazadas</div><div class="kv__v">${f.expansion.map((e) => esc(formatoAño(e.year))).join(' · ')}</div></div>
    <p class="txt" style="font-size:11px;color:var(--ink-faint);margin-top:8px">${esc(D.lenguas.meta.aviso)}</p>
    ${avisoDebate('lenguas', f.id)}
  </div>`;
}

function fichaTeoria(t) {
  return `<div class="sec">
    <div class="sub" style="color:#e879f9">Origen del lenguaje · hipótesis</div>
    <h2 class="ttl">${esc(t.name)}</h2>
    <div class="sub">${esc(t.defensa)} · ventana ${esc(formatoAño(t.rango[0]))} — ${esc(formatoAño(t.rango[1]))}</div>
    <p class="txt">${esc(t.resumen)}</p>
    <p class="txt" style="font-size:11px;color:var(--ink-faint)">El lenguaje no fosiliza. Ninguna de estas hipótesis puede confirmarse con evidencia directa, y por eso conviven.</p>
  </div>`;
}

function fichaInstitucion(i) {
  return `<div class="sec">
    <div class="sub" style="color:#38bdf8">Arquitectura institucional</div>
    <h2 class="ttl">${esc(i.name)}</h2>
    <div class="sub">${esc(formatoAño(i.year))}</div>
    ${i.speculative ? '<span class="chip chip--spec">ESCENARIO</span>' : ''}
    <p class="txt">${esc(i.nota)}</p>
  </div>`;
}

function fichaCiudad(c, est) {
  const v = poblacionCiudad(c, est.año);
  const años = c.p.map((x) => x[0]);
  const vals = c.p.map((x) => x[1]);
  return `<div class="sec">
    <div class="sub" style="color:#f5b642">Centro urbano</div>
    <h2 class="ttl">${esc(c.n)}</h2>
    <div class="stat" style="grid-template-columns:1fr">
      ${tarjeta('', 'POBLACIÓN EN ' + formatoAño(est.año).toUpperCase(), v > 0 ? num(v) : '—', 'mil hab.', chispa(años, vals, est.año, '#f5b642'))}
    </div>
    <div class="kv" style="margin-top:10px"><div class="kv__k">Máximo</div>
      <div class="kv__v">${num(Math.max(...vals))} mil hab. en ${esc(formatoAño(años[vals.indexOf(Math.max(...vals))]))}</div></div>
    <div class="kv"><div class="kv__k">Primer registro</div><div class="kv__v">${esc(formatoAño(años[0]))}</div></div>
  </div>`;
}

function fichaDebate(d) {
  return `<div class="sec">
    <div class="sub" style="color:#f5b642">Controversia historiográfica</div>
    <h2 class="ttl">${esc(d.tema)}</h2>
    <p class="txt">${esc(d.resumen)}</p>
  </div>
  <div class="sec">
    <div class="sec__t">POSICIONES</div>
    ${d.posiciones.map((p) => `<div class="kv">
      <div class="kv__k" style="color:var(--cy)">${esc(p.quien)}</div>
      <div class="kv__v">${esc(p.que)}</div></div>`).join('')}
  </div>
  <div class="sec">
    <div class="sec__t">ESTADO DE LA CUESTIÓN</div>
    <p class="txt">${esc(d.estado)}</p>
  </div>`;
}

/* ── mundo ─────────────────────────────────────────────────── */

export function mundo(est) {
  const año = est.año;
  const g = D.gl;
  const M = D.humanidad.metricas;
  const orden = ['pop', 'lifeExp', 'gdppc', 'kcal', 'childMort', 'literacy', 'urban', 'violence', 'unfree', 'hours', 'yield', 'energy'];

  const tarjetas = orden.map((k) => {
    const m = M[k];
    const v = gGlobal(k, año);
    return tarjeta(k, m.label, porFormato(v, m.fmt), m.unit, chispa(g.years, g[k], año, k === 'violence' || k === 'childMort' || k === 'unfree' || k === 'hours' ? '#fb7185' : '#22d3ee'));
  }).join('');

  const pols = activas(año);
  const ranking = D.regiones
    .map((r) => ({ r, i: ich(r, año), p: regional(r, 'pop', año) }))
    .sort((a, b) => b.i - a.i);

  return `
  <div class="sec">
    <div class="sub">${esc(era(año))}</div>
    <h2 class="ttl">Estado del mundo · ${esc(formatoAño(año))}</h2>
    ${notaDelAño(año)}
  </div>

  <div class="sec">
    <div class="sec__t">SERIE GLOBAL</div>
    <div class="stat">${tarjetas}</div>
    <p class="txt" style="font-size:10.5px;color:var(--ink-faint);margin-top:8px">${esc(D.humanidad.meta.nota)}</p>
  </div>

  <div class="sec">
    <div class="sec__t">CÓMO SE GOBIERNA LA HUMANIDAD</div>
    <div class="pila">${regimenesEn(año).map((r) =>
      `<i style="width:${r.pct}%;background:${r.tipo.color}" title="${esc(r.tipo.name)} · ${r.pct.toFixed(1)} %"></i>`).join('')}</div>
    ${regimenesEn(año).map((r) => `
      <button class="item" data-regimen="${esc(r.tipo.id)}" style="border-left-color:${r.tipo.color}">
        <div class="item__t">${esc(r.tipo.name)} <span style="font-family:var(--mono);color:${r.tipo.color}">${r.pct.toFixed(1)} %</span></div>
        <div class="item__d">${esc(r.tipo.desc)}</div>
      </button>`).join('')}
    <p class="txt" style="font-size:10.5px;color:var(--ink-faint);margin-top:8px">${esc(D.politica.meta.aviso)}</p>
  </div>

  <div class="sec">
    <div class="sec__t">REGIONES POR CONDICIÓN HUMANA</div>
    ${ranking.map(({ r, i, p }) => `
      <button class="item" data-region="${esc(r.id)}">
        <div class="item__t">${esc(r.name)}</div>
        <div class="bar"><i style="width:${(i * 100).toFixed(0)}%"></i></div>
        <div class="item__d">ICH ${(i * 100).toFixed(0)} · ${num(p, 1)} M habitantes</div>
      </button>`).join('')}
  </div>

  <div class="sec">
    <div class="sec__t">ENTIDADES ACTIVAS · ${pols.length}</div>
    ${pols.length ? pols.map((p) => `
      <button class="item" data-polity="${esc(p.id)}" style="border-left-color:${p.color}">
        <div class="item__t">${esc(p.name)}</div>
        <div class="item__d">${esc(p.kind)} · ${esc(formatoAño(p.from))} — ${esc(formatoAño(p.to))}</div>
      </button>`).join('')
      : '<div class="empty">Ningún estado registrado.<br>El mundo se organiza en bandas, no en fronteras.</div>'}
  </div>`;
}

/* ── archivo ───────────────────────────────────────────────── */

export function archivo(est) {
  const año = est.año;
  const items = [];

  for (const s of choquesActivos(año, 120)) {
    items.push({ y: s.year, tipo: 'CHOQUE', t: s.name, d: s.note, c: '#fb7185', data: `data-choque="${esc(s.id)}"` });
  }
  for (const t of D.tecno.tech) {
    if (Math.abs(t.year - año) <= Math.max(150, t.spread)) {
      items.push({ y: t.year, tipo: 'TÉCNICA', t: t.name, d: t.note, c: '#a3e635', data: `data-tecno="${esc(t.id)}"` });
    }
  }
  for (const e of eventosEn(año, 150)) {
    items.push({ y: e.year, tipo: 'HITO', t: e.t, d: e.d, c: '#dbe9f4', data: `data-evento="${esc(e.year)}"` });
  }
  for (const b of batallasEn(año, 120)) {
    items.push({ y: b.year, tipo: 'BATALLA', t: b.name, d: b.efecto, c: '#fb7185', data: `data-batalla="${esc(b.id)}"` });
  }
  for (const i of D.inventos.inventos) {
    if (Math.abs(i.year - año) <= 150) {
      items.push({ y: i.year, tipo: 'INVENCIÓN', t: i.name, d: i.nota, c: '#67e8f9', data: `data-invento="${esc(i.id)}"` });
    }
  }
  for (const i of institucionesEn(año, 150)) {
    items.push({ y: i.year, tipo: 'INSTITUCIÓN', t: i.name, d: i.nota, c: '#38bdf8', data: `data-inst="${esc(i.year)}"` });
  }

  items.sort((a, b) => a.y - b.y);
  const ciudades = ciudadesActivas(año, 30).slice(0, 12);

  return `
  <div class="sec">
    <div class="sub">Ventana de ±150 años</div>
    <h2 class="ttl">Archivo · ${esc(formatoAño(año))}</h2>
  </div>

  <div class="sec">
    <div class="sec__t">REGISTRO CRONOLÓGICO</div>
    ${items.length ? items.map((i) => `
      <button class="item" ${i.data} style="border-left-color:${i.c}">
        <div class="item__y" style="color:${i.c}">${esc(formatoAño(i.y))} · ${i.tipo}</div>
        <div class="item__t">${esc(i.t)}</div>
        <div class="item__d">${esc(i.d)}</div>
      </button>`).join('') : '<div class="empty">Sin registros en esta ventana.</div>'}
  </div>

  <div class="sec">
    <div class="sec__t">MAYORES CONCENTRACIONES URBANAS</div>
    ${ciudades.length ? ciudades.map(({ c, v }, n) => `
      <div class="kv"><div class="kv__k">${n + 1}. ${esc(c.n)}</div>
      <div class="kv__v" style="font-family:var(--mono)">${num(v)} mil hab.</div></div>`).join('')
      : '<div class="empty">Ninguna aglomeración supera los 30.000 habitantes.</div>'}
  </div>

  <div class="sec">
    <div class="sec__t">VOLUMEN DEL ARCHIVO</div>
    <p class="txt" style="font-size:11px;color:var(--ink-dim)">${esc(D.polities.length)} entidades políticas, ${esc(D.batallas.batallas.length)} batallas, ${esc(D.inventos.inventos.length)} invenciones, ${esc(D.tecno.tech.length)} umbrales tecnomilitares, ${esc(D.choques.shocks.length)} choques, ${esc(D.eventos.eventos.length)} hitos y ${esc(D.ciudades.ciudades.length)} centros urbanos.</p>
  </div>`;
}

/* ── procedencia ───────────────────────────────────────────── */

export function fuentes() {
  const F = D.fuentes;
  return `
  <div class="sec">
    <div class="sub">Aparato crítico</div>
    <h2 class="ttl">Procedencia y controversia</h2>
    <p class="txt">${esc(F.meta.nota)}</p>
    <p class="txt" style="border-left:2px solid var(--am);padding-left:10px;color:var(--ink)">${esc(F.meta.principio)}</p>
  </div>

  <div class="sec">
    <div class="sec__t">CUÁNTO FIARSE DE CADA REGISTRO</div>
    ${F.confianza.map((c) => {
      const n = NIVEL_CONFIANZA[c.nivel];
      return `<div class="kv">
        <div class="kv__k">${esc(c.registro)}</div>
        <div class="kv__v">
          <span class="chip" style="border-color:${n.color};color:${n.color}">${esc(n.label)}</span><br>
          ${esc(c.nota)}
        </div></div>`;
    }).join('')}
  </div>

  <div class="sec">
    <div class="sec__t">DONDE LA DISCIPLINA NO SE PONE DE ACUERDO · ${F.debates.length}</div>
    <p class="txt" style="font-size:11px;color:var(--ink-faint)">Que un dato esté discutido no es un defecto del atlas: es información sobre el dato.</p>
    ${F.debates.map((d) => `
      <button class="item" data-debate="${esc(d.id)}" style="border-left-color:#f5b642">
        <div class="item__t">${esc(d.tema)}</div>
        <div class="item__d">${esc(d.posiciones.length)} posiciones · ${esc(d.estado)}</div>
      </button>`).join('')}
  </div>

  <div class="sec">
    <div class="sec__t">BIBLIOGRAFÍA · ${F.obras.length} OBRAS</div>
    ${F.obras.map((o) => `
      <div class="obra">
        <div class="obra__c">${esc(o.cita)}</div>
        <div class="obra__u">${esc(o.uso)}</div>
      </div>`).join('')}
  </div>

  <div class="sec">
    <div class="sec__t">CARTOGRAFÍA BASE</div>
    <p class="txt" style="font-size:11px;color:var(--ink-dim)">${esc(D.mundo.meta.source)} · precisión ${esc(D.mundo.meta.precision)}. Dominio público.</p>
    <p class="txt" style="font-size:11px;color:var(--ink-faint)">Las extensiones son estilizadas: se componen uniendo geometría moderna y recortándola. Sirven para comparar a escala continental, no para arbitrar fronteras.</p>
  </div>`;
}
