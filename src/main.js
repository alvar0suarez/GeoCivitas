/**
 * GEOCIVITAS · arranque y control.
 *
 * Un único estado, un único bucle de dibujo. Todo lo que cambia el mundo pasa
 * por `set()`, que marca el lienzo como sucio y refresca el panel.
 */

import {
  cargar, D, activas, nivelMar, horizonteDe, CONTROL, TIPO_BANDA,
  global as gGlobal, buscar, regimenesEn,
} from './core/datos.js';
import { Atlas, ESCALAS } from './render/atlas.js';
import { Regla } from './ui/tiempo.js';
import * as Panel from './ui/panel.js';
import { pintarSim, pintarResultado, evaluar } from './ui/sim.js';
import { aT, aAño, formatoAño, era, pasoNatural, SALTOS, AÑO_MIN, AÑO_MAX } from './core/escala.js';
import { num, compacto, porFormato, clamp } from './core/series.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── estado ────────────────────────────────────────────────── */

const est = {
  año: 117,
  reproduciendo: false,
  velocidad: 1,
  tematica: 'ninguna',
  capas: {
    soberania: true, prehistoria: true, densidad: true, orografia: true,
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
  set({ año: 117 });

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
    html += `<div class="legend__t" style="margin-top:10px">GRADO DE CONTROL</div>`;
    for (const [k, c] of Object.entries(CONTROL)) {
      const fondo = k === 'tributario'
        ? 'repeating-linear-gradient(0deg,#22d3ee 0 1px,transparent 1px 4px)'
        : k === 'disputado'
          ? 'repeating-linear-gradient(45deg,#22d3ee 0 1px,transparent 1px 4px)'
          : `rgba(34,211,238,${c.alfa + 0.15})`;
      html += `<div class="legend__row"><span class="legend__sw" style="background:${fondo};border:1px solid rgba(34,211,238,.5)"></span>
        <span class="legend__lb">${esc(c.label)}</span></div>`;
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
    atlas.vista.modo = b.dataset.proj;
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
    const t = e.target.closest('[data-polity],[data-region],[data-choque],[data-tecno],[data-evento],[data-sim],[data-batalla],[data-invento],[data-inst],[data-regimen]');
    if (!t) return;
    const ir = (sel) => { set({ seleccion: sel, tab: 'dossier' }); marcarTab('dossier'); };
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
    atlas.vista.k = clamp(atlas.vista.k * f, 110, 5200);
    sucio = true;
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
      atlas.vista.k = clamp(k0 * (d / d0), 110, 5200);
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
    case 'polity':
      return `<b>${esc(g.pol.name)}</b><i>${esc(CONTROL[g.control].label)} · ${esc(g.pol.kind)}</i>`;
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
      case 'ArrowUp': atlas.vista.k = clamp(atlas.vista.k * 1.12, 110, 5200); sucio = true; break;
      case 'ArrowDown': atlas.vista.k = clamp(atlas.vista.k / 1.12, 110, 5200); sucio = true; break;
      case '/': e.preventDefault(); abrirPal(); break;
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

/* ── ayuda ─────────────────────────────────────────────────── */

function pintarAyuda() {
  $('#helpBody').innerHTML = `
  <div class="sec">
    <h2 class="ttl">Cómo leer este atlas</h2>
    <p class="txt">GEOCIVITAS recorre <b>52 200 años</b>, del 50 000 a. C. al 2200. La línea temporal no es lineal:
    reparte más píxeles a los periodos con más registro, para que un siglo reciente ocupe tanto como diez milenios profundos.</p>
  </div>

  <div class="sec">
    <div class="sec__t">EL COLOR DICE QUÉ TIPO DE DOMINIO ES</div>
    <p class="txt">Un imperio no manda igual en todas partes. Cada entidad se pinta en cuatro intensidades:</p>
    ${Object.entries(CONTROL).map(([, c]) => `<div class="kv"><div class="kv__k">${esc(c.label)}</div><div class="kv__v">${esc(c.desc)}</div></div>`).join('')}
    <p class="txt" style="font-size:11px;color:var(--ink-faint)">Trama de líneas = tributario. Trama diagonal = disputado. Borde discontinuo = escenario prospectivo, no hecho.</p>
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
  atlas.redimensionar();
  regla.redimensionar();
  regla.dibujar();
  sucio = true;
}
