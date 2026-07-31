/** Interfaz del motor de conquista. */

import { D, activas, CONTROL } from '../core/datos.js';
import { evaluar, veredicto, distanciaKm } from '../sim/conquista.js';
import { formatoAño } from '../core/escala.js';
import { num } from '../core/series.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function pintarSim(cont, est, sel) {
  const pols = activas(est.año);
  if (pols.length < 1) {
    cont.innerHTML = `<div class="empty">En ${esc(formatoAño(est.año))} no hay entidades estatales registradas.<br>
      El motor necesita al menos un actor con centro de poder.<br><br>Mueve la línea temporal a un año con estados.</div>`;
    return null;
  }

  const opciones = (activo) => pols.map((p) =>
    `<option value="${esc(p.id)}"${p.id === activo ? ' selected' : ''}>${esc(p.name)}</option>`).join('');

  const objetivoLibre = sel.objetivo && sel.objetivo.libre;

  cont.innerHTML = `
    <div class="sim">
      <div class="sim__side">
        <div class="sim__lb">ATACANTE · CENTRO DE PODER</div>
        <select class="sim__sel" id="simA">${opciones(sel.a)}</select>
      </div>
      <div class="sim__side">
        <div class="sim__lb">OBJETIVO</div>
        <select class="sim__sel" id="simB">
          ${opciones(sel.b)}
          <option value="__libre"${objetivoLibre ? ' selected' : ''}>— punto elegido en el mapa —</option>
        </select>
      </div>
      <div class="sim__out" id="simOut"></div>
    </div>`;

  return {
    selA: cont.querySelector('#simA'),
    selB: cont.querySelector('#simB'),
    out: cont.querySelector('#simOut'),
  };
}

export function pintarResultado(out, r, atacante, defensor) {
  const c = CONTROL[r.control];
  const pct = Math.round(r.prob * 100);
  const col = r.prob > 0.6 ? '#a3e635' : r.prob > 0.35 ? '#f5b642' : '#fb7185';

  out.innerHTML = `
    <div class="sim__lb">PROBABILIDAD DE CAMPAÑA EXITOSA</div>
    <div class="gauge"><i style="width:${pct}%;background:linear-gradient(90deg,rgba(0,0,0,.3),${col})"></i><b>${pct} %</b></div>

    <div class="stat" style="margin:14px 0">
      <div class="stat__c"><div class="stat__k">CONTROL SOSTENIBLE</div><div class="stat__v" style="font-size:13px;color:${col}">${esc(c.label)}</div></div>
      <div class="stat__c"><div class="stat__k">VIDA MEDIA DEL DOMINIO</div><div class="stat__v">${num(r.vidaMedia)}<span class="stat__u">años</span></div></div>
      <div class="stat__c"><div class="stat__k">DISTANCIA REAL</div><div class="stat__v">${num(r.dist)}<span class="stat__u">km</span></div></div>
      <div class="stat__c"><div class="stat__k">DISTANCIA EFECTIVA</div><div class="stat__v">${num(r.distFinal)}<span class="stat__u">km</span></div></div>
      <div class="stat__c"><div class="stat__k">ALCANCE ÚTIL</div><div class="stat__v">${num(r.alcance)}<span class="stat__u">km</span></div></div>
      <div class="stat__c"><div class="stat__k">FUERZA QUE LLEGA</div><div class="stat__v">${Math.round(r.decaimiento * 100)}<span class="stat__u">%</span></div></div>
      <div class="stat__c"><div class="stat__k">DURACIÓN ESTIMADA</div><div class="stat__v">${num(r.años)}<span class="stat__u">años</span></div></div>
      <div class="stat__c"><div class="stat__k">COSTE DE OCUPACIÓN</div><div class="stat__v">${(r.costeAnual * 100).toFixed(0)}<span class="stat__u">% renta/año</span></div></div>
    </div>

    <div class="sim__lb">DESCOMPOSICIÓN DE FACTORES</div>
    ${r.factores.map(([k, v]) => `
      <div class="fac">
        <div class="fac__k">${esc(k)}</div>
        <div class="fac__bar"><i class="${v < 0 ? 'neg' : ''}" style="${v < 0
          ? `right:50%;left:auto;width:${Math.min(50, -v * 50).toFixed(0)}%`
          : `left:50%;width:${Math.min(50, v * 50).toFixed(0)}%`}"></i></div>
        <div class="fac__v">${v > 0 ? '+' : ''}${v.toFixed(2)}</div>
      </div>`).join('')}

    <div class="sim__lb" style="margin-top:16px">LECTURA DEL ARCHIVO</div>
    <p class="txt">${esc(veredicto(r, atacante.name, defensor.name))}</p>

    <div class="sim__lb" style="margin-top:14px">TECNOLOGÍA DECISIVA EN ${esc(formatoAño(r.año ?? 0))}</div>
    <div>${r.tA.adoptadas.slice(0, 6).map((a) =>
      `<span class="chip" title="${esc(a.t.note)}">${esc(a.t.name)} · ${Math.round(a.adopcion * 100)} %</span>`).join('') || '<span class="chip">sin umbrales relevantes</span>'}</div>

    <p class="txt" style="font-size:10.5px;color:var(--ink-faint);margin-top:14px">
      El motor no reconstruye batallas: estima si la geografía, la demografía y la técnica de ese año hacían la empresa sostenible.
      Un resultado alto no significa que ocurriera; significa que, de haberse intentado, el terreno no era el problema.</p>`;
}

export { evaluar, distanciaKm };
