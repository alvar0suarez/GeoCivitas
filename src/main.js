/**
 * GEOCIVITAS · arranque y control.
 *
 * Un único estado, un único bucle de dibujo. Todo lo que cambia el mundo pasa
 * por `set()`, que marca el lienzo como sucio y refresca el panel.
 */

import {
  cargar, D, activas, nivelMar, horizonteDe, CONTROL, TIPO_BANDA,
  global as gGlobal, buscar, regimenesEn, regional, ich,
} from './core/datos.js';
import { Atlas, ESCALAS } from './render/atlas.js';
import { Regla } from './ui/tiempo.js';
import * as Panel from './ui/panel.js';
import { pintarSim, pintarResultado, evaluar } from './ui/sim.js';
import * as Ana from './ui/analista.js';
import { aT, aAño, formatoAño, era, pasoNatural, SALTOS, AÑO_MIN, AÑO_MAX } from './core/escala.js';
import { num, compacto, porFormato, clamp, RAMPAS, rgba } from './core/series.js';

const $ = (s) => document.querySelector(s);

/** Cómo se dibuja cada trama de control en una muestra CSS de la leyenda. */
const TRAMA = {
  rayado:   (c) => `repeating-linear-gradient(0deg,${c} 0 1px,transparent 1px 4px)`,
  diagonal: (c) => `repeating-linear-gradient(45deg,${c} 0 1px,transparent 1px 4px)`,
  malla:    (c) => `repeating-linear-gradient(0deg,${c} 0 1px,transparent 1px 4px),repeating-linear-gradient(90deg,${c} 0 1px,transparent 1px 4px)`,
  punteado: (c) => `radial-gradient(${c} 0.9px,transparent 1px) 0 0/4px 4px`,
  niebla:   (c) => `radial-gradient(${c} 0.6px,transparent 1px) 0 0/5px 5px`,
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── estado ────────────────────────────────────────────────── */

const est = {
  año: 117,
  reproduciendo: false,
  velocidad: 1,
  tematica: 'ninguna',
  capas: {
    soberania: true, mando: false, prehistoria: true, densidad: true, orografia: true,
    batallas: true, rutas: false, choques: true, tecno: false,
    inventos: false, lenguas: false, eventos: true,
    pasos: false, graticula: true,
  },
  seleccion: null,
  resaltado: null,
  nivelMar: 0,
  frente: null,
  tab: 'dossier',
  eligiendoObjetivo: false,
};

const CAPAS = [
  ['soberania',   'SOBERANÍA',    '#22d3ee'],
  ['mando',       'MANDO EFECTIVO', '#f5b642'],
  ['prehistoria', 'HORIZONTES',   '#e879f9'],
  ['lenguas',     'LENGUAS',      '#38bdf8'],
  ['batallas',    'BATALLAS',     '#fb7185'],
  ['densidad',    'DENSIDAD',     '#f5b642'],
  ['orografia',   'OROGRAFÍA',    '#d9b260'],
  ['rutas',       'RUTAS',        '#38bdf8'],
  ['choques',     'CHOQUES',      '#fb7185'],
  ['inventos',    'INVENCIONES',  '#67e8f9'],
  ['tecno',       'TECNOMILITAR', '#a3e635'],
  ['eventos',     'HITOS',        '#dbe9f4'],
  ['pasos',       'PASOS',        '#f5b642'],
  ['graticula',   'RETÍCULA',     '#5a96af'],
];

const TEMATICAS = [
  ['ninguna', 'SIN CAPA TEMÁTICA'],
  ['ich', 'CONDICIÓN HUMANA'],
  ['pop', 'POBLACIÓN'],
  ['gdppc', 'RENTA'],
  ['lifeExp', 'ESPERANZA DE VIDA'],
  ['childMort', 'MORTALIDAD INFANTIL'],
  ['kcal', 'ALIMENTACIÓN'],
  ['yield', 'RENDIMIENTO AGRÍCOLA'],
  ['urban', 'URBANIZACIÓN'],
  ['literacy', 'ALFABETIZACIÓN'],
  ['violence', 'VIOLENCIA'],
  ['unfree', 'POBLACIÓN NO LIBRE'],
  ['hours', 'JORNADA LABORAL'],
  ['energy', 'ENERGÍA'],
];

let atlas, regla, sucio = true, ultimo = 0, ultimoAmbiente = 0;

/* ── arranque ──────────────────────────────────────────────── */

(async function arrancar() {
  const log = $('#bootLog');
  try {
    await cargar((p, f) => { log.textContent = `${Math.round(p * 100)} % · ${f}`; });
  } catch (e) {
    log.innerHTML = `<span style="color:#fb7185">Error al cargar el Archivo: ${esc(e.message)}<br>
      Sirve la carpeta por HTTP (por ejemplo <code>python3 -m http.server</code>); los módulos ES no funcionan desde file://</span>`;
    return;
  }

  $('#app').hidden = false;
  atlas = new Atlas($('#cv'));
  regla = new Regla($('#trackCv'));
  construirRail();
  construirSaltos();
  redimensionar();
  conectar();
  if (!aplicarEstadoDeURL()) set({ año: 117 });

  // el lienzo mide el texto al dibujarlo: si las tipografías llegan después,
  // hay que rehacer los rótulos y la regla con las métricas correctas
  if (document.fonts?.ready) document.fonts.ready.then(() => { regla.dibujar(); sucio = true; });

  setTimeout(() => { $('#boot').classList.add('is-out'); setTimeout(() => $('#boot').remove(), 600); }, 350);
  requestAnimationFrame(bucle);
})();

/* ── mutación de estado ────────────────────────────────────── */

function set(cambios) {
  Object.assign(est, cambios);
  est.año = clamp(Math.round(est.año), AÑO_MIN, AÑO_MAX);
  est.nivelMar = nivelMar(est.año);
  sucio = true;
  refrescarCabecera();
  refrescarPanel();
  refrescarLectura();
  refrescarLeyenda();
  $('#timeRange').value = String(Math.round(aT(est.año) * 10000));
  $('#timeHead').style.left = `${(aT(est.año) * 100).toFixed(3)}%`;
  actualizarHash();
}

/* ── bucle ─────────────────────────────────────────────────── */

function bucle(t) {
  const dt = Math.min(0.1, (t - ultimo) / 1000 || 0);
  ultimo = t;

  if (est.reproduciendo) {
    const paso = pasoNatural(est.año) * est.velocidad * dt * 2.2;
    let nuevo = est.año + paso;
    if (nuevo >= AÑO_MAX) { nuevo = AÑO_MAX; togglePlay(false); }
    if (Math.round(nuevo) !== est.año) set({ año: nuevo });
    else { est.año = nuevo; sucio = true; }
  }

  // Interactuar exige respuesta inmediata; los pulsos de rutas y choques son
  // ambientales y a 24 imágenes por segundo no se distinguen de 60, así que se
  // les racionan los redibujados y el hilo principal queda libre.
  const animando = est.capas.rutas || est.capas.choques || est.capas.tecno || est.frente;
  if (sucio) {
    atlas.dibujar(est);
    sucio = false;
    ultimoAmbiente = t;
  } else if (animando && t - ultimoAmbiente >= 42) {
    atlas.dibujar(est);
    ultimoAmbiente = t;
  }
  requestAnimationFrame(bucle);
}

/* ── cabecera y lecturas ───────────────────────────────────── */

function refrescarCabecera() {
  $('#yearVal').textContent = formatoAño(est.año);
  $('#yearEra').textContent = era(est.año) + (est.año > 2030 ? ' · escenario' : '');
}

function refrescarLectura() {
  const a = est.año;
  $('#roPop').textContent = `${num(gGlobal('pop', a), 1)} M`;
  $('#roLife').textContent = `${num(gGlobal('lifeExp', a), 1)} años`;
  $('#roGdp').textContent = `${num(gGlobal('gdppc', a))} $`;
  $('#roUrb').textContent = `${num(gGlobal('urban', a), 1)} %`;
  const pols = activas(a);
  if (pols.length) {
    $('#roPol').textContent = pols.slice(0, 6).map((p) => p.short || p.name).join(' · ') + (pols.length > 6 ? ` +${pols.length - 6}` : '');
  } else {
    const h = horizonteDe(a);
    $('#roPol').textContent = h ? `sin estados · ${h.titulo.toLowerCase()}` : 'sin estados registrados';
  }
}

function refrescarLeyenda() {
  const L = $('#legend');
  let html = '';

  if (est.tematica !== 'ninguna') {
    const e = ESCALAS[est.tematica];
    const paradas = [0, 0.25, 0.5, 0.75, 1].map((t) => e.rampa(e.inv ? 1 - t : t));
    html += `<div class="legend__t">${esc(e.label.toUpperCase())}</div>
      <div class="legend__ramp" style="background:linear-gradient(90deg,${paradas.join(',')})"></div>
      <div class="legend__ends"><span>${e.auto ? 'mín.' : porFormato(e.lo, '0')} ${esc(e.unidad)}</span><span>${e.auto ? 'máx.' : porFormato(e.hi, '0')} ${esc(e.unidad)}</span></div>`;
  }

  if (est.capas.soberania && activas(est.año).length) {
    const mando = est.capas.mando;
    html += `<div class="legend__t" style="margin-top:10px">GRADO DE CONTROL${mando ? ' · ÍNDICE' : ''}</div>`;
    for (const [k, c] of Object.entries(CONTROL)) {
      const base = mando ? RAMPAS.mando(c.idx / 100) : '#22d3ee';
      const fondo = TRAMA[c.patron] ? TRAMA[c.patron](base) : rgba(base, mando ? 0.85 : c.alfa + 0.15);
      html += `<div class="legend__row"><span class="legend__sw" style="background:${fondo};border:1px solid ${rgba(base, 0.5)}"></span>
        <span class="legend__lb">${esc(c.label)}</span>${mando ? `<span class="legend__nm">${c.idx}</span>` : ''}</div>`;
    }
  }

  if (est.capas.prehistoria && est.año <= -2800) {
    const h = horizonteDe(est.año);
    if (h) {
      const tipos = [...new Set(h.bands.map((b) => b.kind))];
      html += `<div class="legend__t" style="margin-top:10px">HORIZONTES</div>`;
      for (const t of tipos) {
        const i = TIPO_BANDA[t];
        if (!i) continue;
        html += `<div class="legend__row"><span class="legend__sw" style="background:${i.c};opacity:.55"></span>
          <span class="legend__lb">${esc(i.label)}</span></div>`;
      }
    }
  }

  L.innerHTML = html;
}

/* ── panel ─────────────────────────────────────────────────── */

function refrescarPanel() {
  const body = $('#panelBody');
  if (est.tab === 'dossier') body.innerHTML = Panel.expediente(est);
  else if (est.tab === 'mundo') body.innerHTML = Panel.mundo(est);
  else if (est.tab === 'fuentes') body.innerHTML = Panel.fuentes(est);
  else body.innerHTML = Panel.archivo(est);
}

/* ── raíl ──────────────────────────────────────────────────── */

function construirRail() {
  $('#layerList').innerHTML = CAPAS.map(([k, lb, c]) =>
    `<button class="lyr ${est.capas[k] ? 'is-on' : ''}" data-capa="${k}" style="color:${c}">
      <span class="lyr__dot"></span><span class="lyr__lb">${lb}</span></button>`).join('');

  $('#metricList').innerHTML = TEMATICAS.map(([k, lb]) =>
    `<button class="lyr ${est.tematica === k ? 'is-on' : ''}" data-tema="${k}" style="color:#f5b642">
      <span class="lyr__dot"></span><span class="lyr__lb">${lb}</span></button>`).join('');
}

function construirSaltos() {
  $('#jump').innerHTML = SALTOS.map(([a, lb]) =>
    `<button class="jbtn" data-salto="${a}">${esc(formatoAño(a))} · ${esc(lb)}</button>`).join('');
}

/* ── eventos ───────────────────────────────────────────────── */

function conectar() {
  window.addEventListener('resize', redimensionar);

  // El enlace a una vista es la unidad que se comparte y se cita; si el botón
  // «atrás» no la restituye, el historial del navegador miente.
  window.addEventListener('hashchange', () => {
    if (location.hash.replace(/^#/, '') === serializarEstado()) return;
    aplicarEstadoDeURL();
  });

  // capas y temáticas
  $('#rail').addEventListener('click', (e) => {
    const capa = e.target.closest('[data-capa]');
    if (capa) {
      const k = capa.dataset.capa;
      est.capas[k] = !est.capas[k];
      capa.classList.toggle('is-on', est.capas[k]);
      set({});
      return;
    }
    const tema = e.target.closest('[data-tema]');
    if (tema) {
      est.tematica = tema.dataset.tema;
      $('#metricList').querySelectorAll('.lyr').forEach((b) => b.classList.toggle('is-on', b.dataset.tema === est.tematica));
      set({});
    }
  });

  // proyección
  document.querySelectorAll('[data-proj]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-proj]').forEach((x) => x.classList.toggle('is-on', x === b));
    const zoom = atlas.vista.k / atlas.ajuste();
    atlas.vista.modo = b.dataset.proj;
    atlas.vista.k = clamp(atlas.ajuste() * zoom, 90, 6000);
    if (b.dataset.proj === 'plana') atlas.vista.centro = [atlas.vista.centro[0], 15];
    set({});
  }));

  // pestañas
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
    set({ tab: b.dataset.tab });
  }));

  // panel: navegación interna
  $('#panelBody').addEventListener('click', (e) => {
    const t = e.target.closest('[data-polity],[data-region],[data-choque],[data-tecno],[data-evento],[data-sim],[data-batalla],[data-invento],[data-inst],[data-regimen],[data-debate]');
    if (!t) return;
    const ir = (sel) => { set({ seleccion: sel, tab: 'dossier' }); marcarTab('dossier'); };
    if (t.dataset.debate) {
      const d = D.fuentes.debates.find((x) => x.id === t.dataset.debate);
      if (d) return ir({ tipo: 'debate', debate: d });
    }
    if (t.dataset.batalla) {
      const b = D.batallas.batallas.find((x) => x.id === t.dataset.batalla);
      if (b) { atlas.vista.centro = b.at; return ir({ tipo: 'batalla', batalla: b }); }
    }
    if (t.dataset.invento) {
      const i = D.inventos.inventos.find((x) => x.id === t.dataset.invento);
      if (i) { atlas.vista.centro = i.at; return ir({ tipo: 'invento', invento: i }); }
    }
    if (t.dataset.inst) {
      const i = D.politica.instituciones.find((x) => String(x.year) === t.dataset.inst);
      if (i) { atlas.vista.centro = i.at; return ir({ tipo: 'institucion', inst: i }); }
    }
    if (t.dataset.regimen) return;
    if (t.dataset.polity) set({ seleccion: { tipo: 'polity', pol: D.porId.get(t.dataset.polity) }, tab: 'dossier' }), marcarTab('dossier');
    else if (t.dataset.region) set({ seleccion: { tipo: 'region', reg: D.regiones.find((r) => r.id === t.dataset.region) }, tab: 'dossier' }), marcarTab('dossier');
    else if (t.dataset.choque) set({ seleccion: { tipo: 'choque', choque: D.choques.shocks.find((s) => s.id === t.dataset.choque) }, tab: 'dossier' }), marcarTab('dossier');
    else if (t.dataset.tecno) set({ seleccion: { tipo: 'tecno', tecno: D.tecno.tech.find((s) => s.id === t.dataset.tecno) }, tab: 'dossier' }), marcarTab('dossier');
    else if (t.dataset.evento) set({ seleccion: { tipo: 'evento', evento: D.eventos.eventos.find((s) => String(s.year) === t.dataset.evento) }, tab: 'dossier' }), marcarTab('dossier');
    else if (t.dataset.sim) abrirSim(t.dataset.sim);
  });

  // tiempo
  $('#timeRange').addEventListener('input', (e) => {
    set({ año: aAño(+e.target.value / 10000) });
  });
  $('#btnPlay').addEventListener('click', () => togglePlay());
  $('#btnBack').addEventListener('click', () => set({ año: est.año - pasoNatural(est.año) * 4 }));
  $('#btnFwd').addEventListener('click', () => set({ año: est.año + pasoNatural(est.año) * 4 }));
  $('#speed').addEventListener('change', (e) => { est.velocidad = +e.target.value; });
  $('#jump').addEventListener('click', (e) => {
    const b = e.target.closest('[data-salto]');
    if (b) set({ año: +b.dataset.salto });
  });

  // botones
  $('#btnSim').addEventListener('click', () => abrirSim());
  $('#btnRandom').addEventListener('click', saltoAleatorio);
  $('#btnHelp').addEventListener('click', () => { pintarAyuda(); $('#modalHelp').hidden = false; });
  $('#btnCapas').addEventListener('click', () => $('#rail').classList.toggle('is-open'));
  $('#cv').addEventListener('pointerdown', () => $('#rail').classList.remove('is-open'));
  $('#btnAnalista').addEventListener('click', abrirAnalista);
  $('#btnEnlace').addEventListener('click', copiarEnlace);
  $('#btnExport').addEventListener('click', exportar);
  $('#btnPanel').addEventListener('click', () => {
    $('#panel').classList.toggle('is-open');
    $('#panel').classList.toggle('is-hidden');
  });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
    b.closest('.modal').hidden = true;
  }));
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => {
    if (e.target === m) m.hidden = true;
  }));

  // buscador
  $('#btnBuscar').addEventListener('click', abrirPal);
  $('#palInput').addEventListener('input', (e) => pintarPal(buscar(e.target.value)));
  $('#palInput').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moverPal(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moverPal(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); elegirPal(palIdx); }
    else if (e.key === 'Escape') $('#pal').hidden = true;
  });
  $('#palList').addEventListener('click', (e) => {
    const f = e.target.closest('[data-n]');
    if (f) elegirPal(+f.dataset.n);
  });
  $('#pal').addEventListener('click', (e) => { if (e.target === $('#pal')) $('#pal').hidden = true; });

  conectarLienzo();
  conectarTeclado();
}

function marcarTab(t) {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-on', x.dataset.tab === t));
}

function togglePlay(v) {
  est.reproduciendo = v ?? !est.reproduciendo;
  $('#btnPlay').textContent = est.reproduciendo ? '❙❙' : '▶';
  $('#btnPlay').classList.toggle('is-on', est.reproduciendo);
}

function saltoAleatorio() {
  const [a] = SALTOS[Math.floor(Math.random() * SALTOS.length)];
  const pols = activas(a);
  if (pols.length) {
    const p = pols[Math.floor(Math.random() * pols.length)];
    atlas.vista.centro = p.capital;
    set({ año: a, seleccion: { tipo: 'polity', pol: p }, tab: 'dossier' });
    marcarTab('dossier');
  } else set({ año: a });
}

/* ── lienzo ────────────────────────────────────────────────── */

function conectarLienzo() {
  const cv = $('#cv');
  const tip = $('#tip');
  let arrastrando = false, x0 = 0, y0 = 0, movido = 0, lam0 = 0, phi0 = 0;

  // Las capas caras (el halo urbano) se dibujan en versión ligera mientras la
  // cámara viaja. El temporizador devuelve la calidad completa al parar.
  let quieto = null;
  const enMovimiento = () => {
    est.moviendo = true;
    clearTimeout(quieto);
    quieto = setTimeout(() => { est.moviendo = false; sucio = true; }, 200);
  };

  cv.addEventListener('pointerdown', (e) => {
    arrastrando = true;
    movido = 0;
    x0 = e.clientX; y0 = e.clientY;
    [lam0, phi0] = atlas.vista.centro;
    cv.setPointerCapture(e.pointerId);
    cv.classList.add('is-drag');
  });

  cv.addEventListener('pointermove', (e) => {
    if (arrastrando) {
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      movido = Math.max(movido, Math.hypot(dx, dy));
      const f = 180 / (atlas.vista.k * Math.PI) * 1.6;
      atlas.vista.centro = [lam0 - dx * f, phi0 + dy * f];
      sucio = true;
      enMovimiento();
      actualizarHash();
      tip.hidden = true;
      return;
    }
    const r = cv.getBoundingClientRect();
    const g = atlas.golpeEn(e.clientX - r.left, e.clientY - r.top);
    if (!g) { tip.hidden = true; est.resaltado = null; return; }
    tip.innerHTML = textoTooltip(g);
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = `${clamp(e.clientX - r.left + 14, 4, r.width - tw - 4)}px`;
    tip.style.top = `${clamp(e.clientY - r.top - th - 10, 4, r.height - th - 4)}px`;
    if (g.tipo === 'polity' && est.resaltado !== g.pol.id) { est.resaltado = g.pol.id; sucio = true; }
  });

  const soltar = (e) => {
    if (!arrastrando) return;
    arrastrando = false;
    cv.classList.remove('is-drag');
    if (movido < 5) clicEnMapa(e);
  };
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', () => { arrastrando = false; cv.classList.remove('is-drag'); });
  cv.addEventListener('pointerleave', () => { tip.hidden = true; });

  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0012);
    atlas.vista.k = clamp(atlas.vista.k * f, atlas.ajuste() * 0.55, atlas.ajuste() * 14);
    sucio = true;
    enMovimiento();
  }, { passive: false });

  // pellizco básico
  let d0 = null, k0 = 0;
  cv.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      d0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      k0 = atlas.vista.k;
    }
  }, { passive: true });
  cv.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && d0) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      atlas.vista.k = clamp(k0 * (d / d0), atlas.ajuste() * 0.55, atlas.ajuste() * 14);
      sucio = true;
    }
  }, { passive: true });
  cv.addEventListener('touchend', () => { d0 = null; });
}

function clicEnMapa(e) {
  const cv = $('#cv');
  const r = cv.getBoundingClientRect();
  const px = e.clientX - r.left;
  const py = e.clientY - r.top;

  if (est.eligiendoObjetivo) {
    const ll = atlas.vista.invertir(px, py);
    if (ll) {
      est.eligiendoObjetivo = false;
      objetivoLibre = { name: 'Punto elegido', at: ll, esEstado: false };
      $('#modalSim').hidden = false;
      recalcularSim();
    }
    return;
  }

  const g = atlas.golpeEn(px, py);
  if (!g) { set({ seleccion: null }); return; }
  const sel = { tipo: g.tipo, ...g };
  set({ seleccion: sel, tab: 'dossier' });
  marcarTab('dossier');
}

function textoTooltip(g) {
  switch (g.tipo) {
    case 'polity': {
      const c = CONTROL[g.control];
      const z = g.zona || {};
      const linea = [`${c.label} · índice ${c.idx}`];
      if (z.guarnicion != null) linea.push(`${num(z.guarnicion)} efectivos`);
      if (z.revuelta != null) linea.push(`revuelta ${z.revuelta} %`);
      return `<b>${esc(g.pol.name)}</b><i>${z.nombre ? esc(z.nombre) + ' · ' : ''}${esc(linea.join(' · '))}</i>`;
    }
    case 'region':
      return `<b>${esc(g.reg.name)}</b><i>${esc(ESCALAS[est.tematica]?.label ?? '')}: ${porFormato(g.valor, est.tematica === 'ich' ? '0.00' : '0.0')}</i>`;
    case 'choque':
      return `<b>${esc(g.choque.name)}</b><i>${esc(g.choque.place)}${g.choque.deaths ? ' · ' + compacto(g.choque.deaths) + ' muertes est.' : ''}</i>`;
    case 'tecno':
      return `<b>${esc(g.tecno.name)}</b><i>${esc(formatoAño(g.tecno.year))} · ${esc(g.tecno.class)}</i>`;
    case 'evento':
      return `<b>${esc(g.evento.t)}</b><i>${esc(formatoAño(g.evento.year))}</i>`;
    case 'paso':
      return `<b>${esc(g.paso.name)}</b><i>paso ${esc(g.paso.tipo)}</i>`;
    case 'ruta':
      return `<b>${esc(g.ruta.name)}</b><i>${esc(formatoAño(g.ruta.from))} — ${esc(formatoAño(g.ruta.to))}</i>`;
    case 'banda':
      return `<b>${esc(g.banda.name)}</b><i>${esc(g.horizonte.titulo)}</i>`;
    default: return '';
  }
}

/* ── teclado ───────────────────────────────────────────────── */

function conectarTeclado() {
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input,select,textarea')) return;
    const p = pasoNatural(est.año);
    switch (e.key) {
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft': set({ año: est.año - p * (e.shiftKey ? 20 : 4) }); break;
      case 'ArrowRight': set({ año: est.año + p * (e.shiftKey ? 20 : 4) }); break;
      case 'ArrowUp': atlas.vista.k = clamp(atlas.vista.k * 1.12, atlas.ajuste() * 0.55, atlas.ajuste() * 14); sucio = true; break;
      case 'ArrowDown': atlas.vista.k = clamp(atlas.vista.k / 1.12, atlas.ajuste() * 0.55, atlas.ajuste() * 14); sucio = true; break;
      case '/': e.preventDefault(); abrirPal(); break;
      case 'l': case 'L': copiarEnlace(); break;
      case 'e': case 'E': exportar(); break;
      case 'p': case 'P': $('#btnPanel').click(); break;
      case 's': case 'S': abrirSim(); break;
      case 'r': case 'R': saltoAleatorio(); break;
      case '?': case 'h': case 'H': $('#btnHelp').click(); break;
      case 'Escape':
        document.querySelectorAll('.modal').forEach((m) => (m.hidden = true));
        est.eligiendoObjetivo = false;
        set({ seleccion: null, frente: null });
        break;
    }
  });
}

/* ── simulador ─────────────────────────────────────────────── */

let simSel = { a: null, b: null };
let objetivoLibre = null;
let simRefs = null;

function abrirSim(idAtacante) {
  const pols = activas(est.año);
  if (idAtacante) simSel.a = idAtacante;
  if (!simSel.a || !pols.some((p) => p.id === simSel.a)) simSel.a = pols[0]?.id;
  if (!simSel.b || !pols.some((p) => p.id === simSel.b) || simSel.b === simSel.a) {
    simSel.b = pols.find((p) => p.id !== simSel.a)?.id ?? simSel.a;
  }
  simRefs = pintarSim($('#simBody'), est, { ...simSel, objetivo: objetivoLibre ? { libre: true } : null });
  $('#modalSim').hidden = false;
  if (!simRefs) return;

  simRefs.selA.addEventListener('change', () => { simSel.a = simRefs.selA.value; recalcularSim(); });
  simRefs.selB.addEventListener('change', () => {
    if (simRefs.selB.value === '__libre') {
      if (!objetivoLibre) {
        est.eligiendoObjetivo = true;
        $('#modalSim').hidden = true;
        return;
      }
    } else {
      simSel.b = simRefs.selB.value;
      objetivoLibre = null;
    }
    recalcularSim();
  });
  recalcularSim();
}

function recalcularSim() {
  if (!simRefs) return;
  const A = D.porId.get(simSel.a);
  if (!A) return;
  const atacante = { name: A.name, at: A.capital, color: A.color };
  let defensor;
  if (objetivoLibre) {
    defensor = { ...objetivoLibre, esEstado: false };
  } else {
    const B = D.porId.get(simSel.b);
    if (!B) return;
    defensor = { name: B.name, at: B.capital, color: B.color, esEstado: true };
  }
  const r = evaluar(atacante, defensor, est.año);
  r.año = est.año;
  pintarResultado(simRefs.out, r, atacante, defensor);
  set({ frente: { desde: atacante.at, hasta: defensor.at, prob: r.prob } });
}

/* ── enlace permanente ─────────────────────────────────────── */

/**
 * Una vista de este atlas es un argumento: año, encuadre, capas y selección.
 * Sin poder enlazarla, no se puede citar ni discutir — así que va toda en el
 * fragmento de la URL, que no se envía al servidor y sobrevive al recargado.
 */
function serializarEstado() {
  const v = atlas.vista;
  const capas = Object.entries(est.capas).filter(([, on]) => on).map(([k]) => k).join('.');
  const p = [
    `y=${est.año}`,
    `v=${v.modo}`,
    `c=${v.centro[0].toFixed(2)},${v.centro[1].toFixed(2)},${Math.round(v.k)}`,
    `l=${capas}`,
  ];
  if (est.tematica !== 'ninguna') p.push(`t=${est.tematica}`);
  const s = est.seleccion;
  const idDe = {
    polity: () => s.pol?.id, region: () => s.reg?.id, choque: () => s.choque?.id,
    tecno: () => s.tecno?.id, batalla: () => s.batalla?.id, invento: () => s.invento?.id,
    lengua: () => s.familia?.id, debate: () => s.debate?.id, ciudad: () => s.ciudad?.n,
  };
  if (s && idDe[s.tipo]) {
    const id = idDe[s.tipo]();
    if (id) p.push(`s=${s.tipo}.${encodeURIComponent(id)}`);
  }
  return p.join('&');
}

function aplicarEstadoDeURL() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return false;
  const q = Object.fromEntries(h.split('&').map((x) => {
    const i = x.indexOf('=');
    return i < 0 ? [x, ''] : [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
  }));

  if (q.v === 'plana' || q.v === 'orto') {
    atlas.vista.modo = q.v;
    document.querySelectorAll('[data-proj]').forEach((b) => b.classList.toggle('is-on', b.dataset.proj === q.v));
  }
  if (q.c) {
    const [lon, lat, k] = q.c.split(',').map(Number);
    if (isFinite(lon) && isFinite(lat)) atlas.vista.centro = [lon, lat];
    if (isFinite(k)) atlas.vista.k = clamp(k, atlas.ajuste() * 0.55, atlas.ajuste() * 14);
  }
  if (q.l != null) {
    const activas_ = new Set(q.l ? q.l.split('.') : []);
    for (const k of Object.keys(est.capas)) est.capas[k] = activas_.has(k);
    construirRail();
  }
  if (q.t && ESCALAS[q.t]) est.tematica = q.t;

  let seleccion = null;
  if (q.s) {
    const [tipo, id] = q.s.split('.');
    const buscarEn = {
      polity: () => ({ tipo: 'polity', pol: D.porId.get(id) }),
      region: () => ({ tipo: 'region', reg: D.regiones.find((r) => r.id === id) }),
      choque: () => ({ tipo: 'choque', choque: D.choques.shocks.find((x) => x.id === id) }),
      tecno: () => ({ tipo: 'tecno', tecno: D.tecno.tech.find((x) => x.id === id) }),
      batalla: () => ({ tipo: 'batalla', batalla: D.batallas.batallas.find((x) => x.id === id) }),
      invento: () => ({ tipo: 'invento', invento: D.inventos.inventos.find((x) => x.id === id) }),
      lengua: () => ({ tipo: 'lengua', familia: D.lenguas.familias.find((x) => x.id === id) }),
      debate: () => ({ tipo: 'debate', debate: D.fuentes.debates.find((x) => x.id === id) }),
      ciudad: () => ({ tipo: 'ciudad', ciudad: D.ciudades.ciudades.find((x) => x.n === id) }),
    };
    const s = buscarEn[tipo]?.();
    if (s && Object.values(s).every((v) => v != null)) seleccion = s;
  }

  const año = Number(q.y);
  set({ año: isFinite(año) ? año : est.año, seleccion });
  return true;
}

let pendienteHash = 0;
function actualizarHash() {
  clearTimeout(pendienteHash);
  pendienteHash = setTimeout(() => {
    history.replaceState(null, '', `#${serializarEstado()}`);
  }, 400);
}

async function copiarEnlace() {
  const url = `${location.origin}${location.pathname}#${serializarEstado()}`;
  try {
    await navigator.clipboard.writeText(url);
    aviso('Enlace a esta vista copiado al portapapeles');
  } catch {
    history.replaceState(null, '', `#${serializarEstado()}`);
    aviso('Enlace en la barra de direcciones: cópialo desde ahí');
  }
}

/* ── exportación ───────────────────────────────────────────── */

/** Todo lo que el atlas sabe del año en curso, en un archivo citable. */
function dossierDelAño() {
  const a = est.año;
  const pols = activas(a);
  const M = D.humanidad.metricas;
  const l = [];
  l.push(`# GEOCIVITAS · ${formatoAño(a)}`, '', `**${era(a)}**`, '');
  if (a > 2030) l.push('> Escenario prospectivo. No es una predicción.', '');

  l.push('## Serie global', '');
  for (const [k, m] of Object.entries(M)) {
    l.push(`- **${m.label}**: ${porFormato(gGlobal(k, a), m.fmt)} ${m.unit}`);
  }

  l.push('', '## Entidades políticas activas', '');
  if (!pols.length) l.push('_Ninguna: el mundo no está organizado en estados._');
  for (const p of pols) {
    l.push(`### ${p.name} (${formatoAño(p.from)} — ${formatoAño(p.to)})`);
    l.push(`*${p.kind}. Sede: ${p.seat}.*`, '');
    l.push(`- **Base**: ${p.dossier.base}`);
    l.push(`- **Estado**: ${p.dossier.estado}`);
    l.push(`- **Límite**: ${p.dossier.limite}`);
    if (p.dossier.colapso !== '—') l.push(`- **Colapso**: ${p.dossier.colapso}`);
    l.push('');
  }

  const ch = D.choques.shocks.filter((s) => a >= s.year && a <= (s.endYear ?? s.year));
  if (ch.length) {
    l.push('## Choques en curso', '');
    for (const s of ch) l.push(`- **${s.name}** (${s.place}): ${s.note}`);
    l.push('');
  }

  const reg = D.regiones.map((r) => ({ r, i: ich(r, a) })).sort((x, y) => y.i - x.i);
  l.push('## Condición humana por región', '', '| Región | ICH | Población (M) | Vida (años) | Renta |', '|---|---|---|---|---|');
  for (const { r, i } of reg) {
    l.push(`| ${r.name} | ${(i * 100).toFixed(0)} | ${porFormato(regional(r, 'pop', a), '0.0')} | ${porFormato(regional(r, 'lifeExp', a), '0.0')} | ${porFormato(regional(r, 'gdppc', a), '0')} |`);
  }

  l.push('', '---', '', '## Procedencia', '');
  l.push(D.fuentes.meta.nota, '');
  for (const c of D.fuentes.confianza) l.push(`- **${c.registro}** — confianza ${c.nivel}. ${c.nota}`);
  l.push('', '### Bibliografía', '');
  for (const o of D.fuentes.obras) l.push(`- ${o.cita}`);
  l.push('', `_Generado por GEOCIVITAS. Enlace a esta vista: #${serializarEstado()}_`);
  return l.join('\n');
}

async function exportar() {
  const nombre = `geocivitas-${est.año < 0 ? Math.abs(est.año) + 'ac' : est.año}.md`;
  const texto = dossierDelAño();
  // En la página publicada el guardado lo confirma quien mira; en un servidor
  // normal no existe esa vía y se recurre al enlace de descarga de siempre.
  const api = globalThis.claude?.downloads;
  if (api) {
    try {
      await api.save({ filename: nombre, data: texto });
      aviso('Expediente guardado');
    } catch (e) {
      if (e?.code !== 'declined') aviso(`No se pudo guardar: ${e?.message ?? 'error desconocido'}`);
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  aviso('Expediente descargado');
}

let avisoT = 0;
function aviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(avisoT);
  avisoT = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ── buscador ──────────────────────────────────────────────── */

let palRes = [];
let palIdx = 0;

function abrirPal() {
  $('#pal').hidden = false;
  const i = $('#palInput');
  i.value = '';
  pintarPal([]);
  i.focus();
}

function pintarPal(res) {
  palRes = res;
  palIdx = 0;
  const L = $('#palList');
  if (!res.length) {
    L.innerHTML = `<div class="pal__hint">
      ${D.polities.length} entidades · ${D.batallas.batallas.length} batallas · ${D.inventos.inventos.length} invenciones · ${D.tecno.tech.length} umbrales militares<br>
      ${D.choques.shocks.length} catástrofes · ${D.eventos.eventos.length} hitos · ${D.politica.instituciones.length} instituciones · ${D.lenguas.familias.length} familias lingüísticas · ${D.ciudades.ciudades.length} ciudades<br><br>
      Escribe al menos dos letras · ↑↓ para moverte · ↵ para abrir
    </div>`;
    return;
  }
  L.innerHTML = res.map((r, n) => `
    <button class="pal__row ${n === 0 ? 'is-sel' : ''}" data-n="${n}">
      <span class="pal__cls">${esc(r.clase)}</span>
      <span class="pal__t">${esc(r.texto)}<span class="pal__sub">${esc(r.etiqueta)}</span></span>
      <span class="pal__y">${r.año == null ? '—' : esc(formatoAño(r.año))}</span>
    </button>`).join('');
}

function moverPal(d) {
  if (!palRes.length) return;
  palIdx = (palIdx + d + palRes.length) % palRes.length;
  const filas = $('#palList').querySelectorAll('.pal__row');
  filas.forEach((f, n) => f.classList.toggle('is-sel', n === palIdx));
  filas[palIdx]?.scrollIntoView({ block: 'nearest' });
}

function elegirPal(n) {
  const r = palRes[n];
  if (!r) return;
  $('#pal').hidden = true;
  if (r.at) atlas.vista.centro = r.at;
  const cambios = { seleccion: r.sel, tab: 'dossier' };
  if (r.año != null) cambios.año = r.año;
  set(cambios);
  marcarTab('dossier');
}

/* ── analista ──────────────────────────────────────────────── */

let anaRefs = null;
let anaAbort = null;

function abrirAnalista() {
  anaRefs = Ana.pintarAnalista($('#anaBody'), est);
  $('#modalAna').hidden = false;

  const sincronizarModo = () => {
    const proxy = anaRefs.modo.value === 'proxy';
    $('#anaProxy').hidden = !proxy;
    $('#anaDirecto').hidden = proxy;
  };
  anaRefs.modo.addEventListener('change', sincronizarModo);

  anaRefs.guardar.addEventListener('click', () => {
    Ana.guardarConfig({
      modo: anaRefs.modo.value,
      url: anaRefs.url?.value.trim() || '',
      clave: anaRefs.clave?.value.trim() || '',
      modelo: anaRefs.modelo.value,
    });
    aviso(Ana.configurado() ? 'Conexión guardada' : 'Falta la URL o la clave');
    abrirAnalista();
  });

  $('#anaBody').addEventListener('click', (e) => {
    const s = e.target.closest('[data-sug]');
    if (s) { anaRefs.pregunta.value = s.dataset.sug; anaRefs.pregunta.focus(); }
  });

  anaRefs.enviar.addEventListener('click', enviarPregunta);
  anaRefs.pregunta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviarPregunta();
  });
}

async function enviarPregunta() {
  const q = anaRefs.pregunta.value.trim();
  if (!q) return;
  if (!Ana.configurado()) { aviso('Configura primero la conexión'); return; }

  anaAbort?.abort();
  anaAbort = new AbortController();
  anaRefs.enviar.disabled = true;
  anaRefs.salida.innerHTML = `<div class="ana__resp"><div class="ana__sello">CONSULTANDO…</div>
    <div class="bar"><i style="width:100%;background:var(--mg);animation:sweep 1.1s ease-in-out infinite"></i></div></div>`;

  try {
    const { texto, contexto, uso } = await Ana.preguntar(q, est, anaAbort.signal);
    const registros = Object.entries(contexto)
      .filter(([, v]) => Array.isArray(v) && v.length)
      .map(([k, v]) => `${k} (${v.length})`).join(' · ');
    anaRefs.salida.innerHTML = `
      <div class="ana__resp">
        <div class="ana__sello">RESPUESTA GENERADA · ${esc(Ana.leerConfig().modelo || 'modelo por defecto')}</div>
        ${Ana.formatearRespuesta(texto)}
        <div class="ana__pie">
          Anclada en: ${esc(registros)}.
          ${uso ? `· ${uso.input_tokens} tokens de entrada, ${uso.output_tokens} de salida.` : ''}<br>
          Texto generado por un modelo de lenguaje a partir de los registros del atlas. Verifícalo antes de citarlo.
        </div>
      </div>`;
  } catch (e) {
    if (e.name === 'AbortError') return;
    anaRefs.salida.innerHTML = `<div class="aviso" style="margin-top:16px">
      <b>No se pudo consultar.</b> ${esc(e.message)}<br><br>
      Si usas clave directa, comprueba que sea válida y que tu navegador no bloquee la petición.
      Si usas proxy, comprueba que responda con CORS abierto a este origen.</div>`;
  } finally {
    anaRefs.enviar.disabled = false;
  }
}

/* ── ayuda ─────────────────────────────────────────────────── */

function pintarAyuda() {
  $('#helpBody').innerHTML = `
  <div class="sec">
    <h2 class="ttl">Cómo leer este atlas</h2>
    <p class="txt">GEOCIVITAS recorre <b>52 200 años</b>, del 50 000 a. C. al 2200. La línea temporal no es lineal:
    reparte más píxeles a los periodos con más registro, para que un siglo reciente ocupe tanto como diez milenios profundos.</p>
  </div>

  <div class="sec">
    <div class="sec__t">EL COLOR DICE HASTA DÓNDE MANDA DE VERDAD</div>
    <p class="txt">Un imperio no manda igual en todas partes, y las entidades grandes están descompuestas en
    <b>zonas nombradas</b> —provincias, marcas, reinos clientes— cada una con su grado de control, su guarnición estimada,
    su parte del erario y su riesgo de revuelta. Pasa el cursor por encima para verlo; pincha para abrir el desglose completo.</p>
    ${Object.entries(CONTROL).map(([, c]) => `<div class="kv"><div class="kv__k">${esc(c.label)} · ${c.idx}</div><div class="kv__v">${esc(c.desc)}</div></div>`).join('')}
    <p class="txt" style="font-size:11px;color:var(--ink-faint)">La cifra es el <b>índice de control</b>: cuánto de lo que el centro ordena llega a ejecutarse.
    Trama de puntos = marca. Retícula = cliente. Líneas = tributario. Diagonales = disputado. Borde discontinuo = escenario prospectivo, no hecho.</p>
  </div>

  <div class="sec">
    <div class="sec__t">MANDO EFECTIVO</div>
    <p class="txt">La capa <b>Mando efectivo</b> deja de colorear por identidad y colorea por solidez: la misma rampa para todos,
    del rojo (una orden que nadie obedece) al verde (una que se ejecuta sola). Sirve para comparar dos imperios sin memorizar colores,
    y para ver de un vistazo que dos manchas del mismo tamaño pueden ser dos animales completamente distintos.</p>
    <p class="txt">En el expediente de cada entidad, la barra apilada reparte su extensión por grado y la resume en un número.
    Roma en 117 sale en 65; el imperio mongol de 1279, con más del doble de superficie, sale en 51 porque más de la mitad
    son kanatos que ya no obedecen a nadie.</p>
  </div>

  <div class="sec">
    <div class="sec__t">ANTES DEL ESTADO</div>
    <p class="txt">Antes del 3000 a. C. no hay fronteras que dibujar. La capa <b>Horizontes</b> muestra áreas de presencia con borde difuso:
    especies humanas, casquetes glaciares, refugios y focos de domesticación. En los máximos glaciales aparece además la
    <b>plataforma continental emergida</b>: Beringia, Sondalandia, Sahul y Doggerland, tierra firme cuando el mar estaba 125 m más abajo.</p>
  </div>

  <div class="sec">
    <div class="sec__t">CONTROLES</div>
    <div class="kv"><div class="kv__k">Arrastrar</div><div class="kv__v">Girar el globo o desplazar el mapa</div></div>
    <div class="kv"><div class="kv__k">Rueda · ↑↓</div><div class="kv__v">Acercar y alejar</div></div>
    <div class="kv"><div class="kv__k">Clic</div><div class="kv__v">Abrir el expediente de lo que haya bajo el cursor</div></div>
    <div class="kv"><div class="kv__k">Espacio</div><div class="kv__v">Reproducir la línea del tiempo</div></div>
    <div class="kv"><div class="kv__k">← →</div><div class="kv__v">Avanzar por pasos (con Mayús, saltos largos)</div></div>
    <div class="kv"><div class="kv__k">S · R · P</div><div class="kv__v">Simulador · salto aleatorio · panel</div></div>
  </div>

  <div class="sec">
    <div class="sec__t">HONESTIDAD DE LOS DATOS</div>
    <p class="txt" style="font-size:11.5px">Las extensiones son <b>estilizadas</b>: se componen uniendo geometría moderna y recortándola,
    de modo que sirven para comparar a escala continental, no para arbitrar fronteras. Las series preindustriales son
    órdenes de magnitud reconstruidos, no mediciones. Todo lo posterior a 2030 es <b style="color:var(--mg)">escenario</b> y va marcado como tal.
    El Índice de Condición Humana es una lente compuesta por esta aplicación, no una estadística oficial.</p>
  </div>`;
}

/* ── redimensionado ────────────────────────────────────────── */

function redimensionar() {
  // El zoom se guarda como múltiplo del ajuste al viewport, no en píxeles:
  // así girar el móvil o abrir el teclado no descoloca el encuadre.
  const antes = atlas.vista.w ? atlas.vista.k / atlas.ajuste() : null;
  atlas.redimensionar();
  atlas.vista.k = clamp(atlas.ajuste() * (antes ?? 1), 90, 6000);
  regla.redimensionar();
  regla.dibujar();
  sucio = true;
}
