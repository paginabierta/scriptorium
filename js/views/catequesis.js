// Catequesis: plan del mes por catequista, imprimible en una sola hoja.
import * as db from '../db.js';
import { S, $, $$, esc, icon, save, toast, live, dialog, confirmDialog, debounce, page, settings, isoDate, parseISO, fechaCorta, MESES, DIAS } from '../core.js';
import { liturgicalDay, nextCelebration } from '../liturgia.js';
import { evangelioPara } from '../lecturas.js';
import { createNote } from './notes.js';

export const ETAPAS = [
  'Precatecumenado · primer anuncio', 'Catecumenado', 'Purificación e iluminación', 'Mistagogia',
  'Primera Comunión', 'Confirmación', 'Perseverancia', 'Catequesis de adultos', 'Catequesis familiar',
];
const ESTADO = { '': 'Pendiente', hecha: 'Hecha', aplazada: 'Aplazada' };
const mesKey = (d = new Date()) => isoDate(d).slice(0, 7);
const mesNombre = (k) => { const [y, m] = k.split('-').map(Number); return `${MESES[m - 1]} ${y}`; };
const corta = (iso) => { const d = parseISO(iso); return `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plansDe = (k) => live('cateqs').filter(c => c.mes === k).sort((a, b) => (a.catequista || '').localeCompare(b.catequista || '', 'es'));
// Evangelio del domingo de esa semana (o el mismo día si es domingo o solemnidad)
const evDeLaSemana = (iso) => { const c = nextCelebration(parseISO(iso)); return c ? evangelioPara(c.fecha) : ''; };

function diasDelMes(key, dow) {
  const [y, m] = key.split('-').map(Number);
  const out = [];
  for (let d = new Date(y, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) if (d.getDay() === dow) out.push(isoDate(d));
  return out;
}

export function viewCatequesis(arg = '') {
  $('#printSheets')?.remove(); document.body.classList.remove('printing-sheets');
  const c = arg && S.cateqs.get(arg);
  if (c && !c.deleted) { viewPlan(c); return; }
  viewMes(/^\d{4}-\d{2}$/.test(arg) ? arg : mesKey());
}

/* ---------- Mes: todos los catequistas ---------- */
function viewMes(key) {
  const list = plansDe(key);
  const [y, m] = key.split('-').map(Number);
  const prev = mesKey(new Date(y, m - 2, 1)), next = mesKey(new Date(y, m, 1));
  const st = settings();
  $('#view').innerHTML = `
    <div class="page">
      <header class="page-head">
        <div><div class="eyebrow">Plan del mes por catequista</div><h1 class="display">Catequesis · ${esc(cap(mesNombre(key)))}</h1></div>
        <div class="head-actions">
          <a class="btn" href="#/catequesis/${prev}" aria-label="Mes anterior">${icon('izq', 14)}</a>
          <a class="btn" href="#/catequesis/${mesKey()}">Este mes</a>
          <a class="btn" href="#/catequesis/${next}" aria-label="Mes siguiente">${icon('der', 14)}</a>
        </div>
      </header>
      <div class="btn-row cq-tools">
        <button type="button" class="btn primary" id="cqNew">${icon('mas', 14)}Plan para un catequista</button>
        <button type="button" class="btn" id="cqCopy">${icon('repaso', 14)}Traer los catequistas de ${esc(mesNombre(prev))}</button>
        ${list.length ? `<button type="button" class="btn" id="cqPrintAll">${icon('imprimir', 14)}Imprimir todos</button>` : ''}
        <button type="button" class="btn" id="cqNote">${icon('pagina', 14)}Preparar un encuentro</button>
      </div>
      <label class="field cq-parr"><span>Parroquia (sale en la hoja impresa)</span><input id="cqParr" value="${esc(st.parroquia || '')}" placeholder="Parroquia…"></label>
      ${list.length ? `<div class="goal-grid">${list.map(c => {
        const ses = c.sesiones || [];
        const hechas = ses.filter(s => s.estado === 'hecha').length;
        const aplaz = ses.filter(s => s.estado === 'aplazada').length;
        return `<a class="card goal-card" href="#/catequesis/${c.id}">
          <div class="goal-top"><span class="chip">${esc(c.etapa || 'Sin etapa')}</span></div>
          <h3 class="goal-title">${esc(c.catequista || 'Catequista')}</h3>
          <p class="hint">${esc(c.grupo || '')}</p>
          <div class="goal-foot"><span>${hechas} de ${ses.length} encuentros${aplaz ? ` · ${aplaz} aplazado${aplaz > 1 ? 's' : ''}` : ''}</span></div>
          ${ses.filter(s => s.suplente).length ? `<p class="goal-next">Con suplente: ${ses.filter(s => s.suplente).map(s => esc(fechaCorta(parseISO(s.fecha)))).join(', ')}</p>` : ''}
        </a>`;
      }).join('')}</div>`
        : `<section class="card"><p class="empty">Aún no hay planes para ${esc(mesNombre(key))}. Crea uno por catequista: los encuentros del mes salen solos, con el Evangelio del domingo de cada semana.</p></section>`}
    </div>`;
  const parr = debounce(() => save(settings()), 600);
  $('#cqParr').addEventListener('input', (e) => { settings().parroquia = e.target.value; parr(); });
  page.flush = () => parr.flush(); page.cleanup = () => parr.flush();
  $('#cqNew').addEventListener('click', () => nuevoPlan(key));
  $('#cqCopy').addEventListener('click', () => copiarMes(prev, key));
  $('#cqPrintAll')?.addEventListener('click', () => imprimir(list));
  $('#cqNote').addEventListener('click', () => {
    const t = live('templates').find(x => x.builtin === 'ivc') || live('templates').find(x => /catequ/i.test(x.name));
    const sp = live('spaces').find(s => !s.deleted && /catequ/i.test(s.name)) || live('spaces').find(s => !s.deleted && /pastoral/i.test(s.name));
    createNote({ spaceId: sp?.id, templateId: t?.id || '', title: 'Encuentro de catequesis' });
  });
}

async function nuevoPlan(key, base = {}) {
  const v = await dialog({
    title: 'Plan del mes',
    body: `<label class="field"><span>Catequista</span><input name="c" value="${esc(base.catequista || '')}" placeholder="Nombre" autocomplete="off"></label>
      <div class="field-row">
        <label class="field"><span>Grupo</span><input name="g" value="${esc(base.grupo || '')}" placeholder="Ej.: Primera Comunión · vereda El Carmen"></label>
        <label class="field"><span>Etapa o proceso</span><input name="e" list="etapas" value="${esc(base.etapa || '')}" placeholder="Escoge o escribe"></label>
      </div>
      <datalist id="etapas">${ETAPAS.map(e => `<option value="${esc(e)}"></option>`).join('')}</datalist>
      <div class="field-row">
        <label class="field"><span>Día de los encuentros</span><select name="d">${[6, 0, 1, 2, 3, 4, 5].map(i => `<option value="${i}"${(base.dia ?? 6) === i ? ' selected' : ''}>${cap(DIAS[i])}</option>`).join('')}<option value="-1">Sin día fijo</option></select></label>
        <label class="field"><span>Teléfono (opcional)</span><input name="t" value="${esc(base.telefono || '')}" inputmode="tel"></label>
      </div>`,
    actions: [{ label: 'Cancelar', value: null }, { label: 'Crear', primary: true, value: (d) => {
      const c = d.querySelector('[name=c]').value.trim();
      if (!c) { d.querySelector('[name=c]').focus(); return false; }
      return { c, g: d.querySelector('[name=g]').value.trim(), e: d.querySelector('[name=e]').value.trim(), d: Number(d.querySelector('[name=d]').value), t: d.querySelector('[name=t]').value.trim() };
    } }],
    onOpen: (d) => d.querySelector('[name=c]').focus(),
  });
  if (!v) return;
  const rec = crear(key, { catequista: v.c, grupo: v.g, etapa: v.e, dia: v.d, telefono: v.t });
  await save(rec);
  location.hash = '#/catequesis/' + rec.id;
}

function crear(key, { catequista, grupo, etapa, dia, telefono }) {
  const fechas = dia >= 0 ? diasDelMes(key, dia) : [];
  const now = Date.now();
  return {
    id: db.uid('cq'), type: 'cateq', mes: key, catequista, grupo, etapa, dia, telefono: telefono || '', avisos: '',
    sesiones: (fechas.length ? fechas : [`${key}-01`]).map(f => ({ id: db.uid('se'), fecha: f, tema: '', objetivo: '', cita: evDeLaSemana(f), materiales: '', suplente: '', estado: '' })),
    created: now, updated: now,
  };
}

async function copiarMes(from, to) {
  const src = plansDe(from);
  if (!src.length) { toast(`No hay planes en ${mesNombre(from)}`); return; }
  const ya = new Set(plansDe(to).map(c => (c.catequista || '').toLowerCase()));
  const nuevos = src.filter(c => !ya.has((c.catequista || '').toLowerCase())).map(c => crear(to, c));
  if (!nuevos.length) { toast('Ya están todos en este mes'); return; }
  for (const r of nuevos) await save(r);
  toast(`${nuevos.length} plan${nuevos.length > 1 ? 'es' : ''} creado${nuevos.length > 1 ? 's' : ''}`);
  viewMes(to);
}

/* ---------- Un plan ---------- */
function viewPlan(c) {
  const persist = debounce(() => save(c), 500);
  page.flush = () => persist.flush();
  page.cleanup = () => persist.flush();
  c.sesiones = c.sesiones || [];
  const render = () => {
    $('#view').innerHTML = `
      <div class="page cq-page">
        <nav class="crumbs"><a href="#/catequesis/${c.mes}">Catequesis · ${esc(mesNombre(c.mes))}</a></nav>
        <header class="page-head">
          <div><div class="eyebrow">Plan de ${esc(mesNombre(c.mes))}</div><h1 class="display">${esc(c.catequista || 'Catequista')}</h1></div>
          <div class="head-actions">
            <button type="button" class="btn" id="cqPrint">${icon('imprimir', 14)}Imprimir hoja</button>
            <button type="button" class="icon-btn" id="cqDel" title="Borrar plan" aria-label="Borrar plan">${icon('papelera', 17)}</button>
          </div>
        </header>
        <div class="field-row">
          <label class="field"><span>Catequista</span><input data-f="catequista" value="${esc(c.catequista || '')}"></label>
          <label class="field"><span>Teléfono</span><input data-f="telefono" value="${esc(c.telefono || '')}" inputmode="tel"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Grupo</span><input data-f="grupo" value="${esc(c.grupo || '')}"></label>
          <label class="field"><span>Etapa o proceso</span><input data-f="etapa" list="etapas" value="${esc(c.etapa || '')}"></label>
        </div>
        <datalist id="etapas">${ETAPAS.map(e => `<option value="${esc(e)}"></option>`).join('')}</datalist>
        <section class="card">
          <div class="card-head"><h2 class="card-title">Encuentros</h2><button type="button" class="btn sm" id="cqAdd">${icon('mas', 13)}Encuentro</button></div>
          <div class="cq-list">${c.sesiones.map((s, i) => {
            const lit = liturgicalDay(parseISO(s.fecha));
            return `<div class="cq-ses ${s.estado || ''}" data-i="${i}">
            <div class="cq-ses-head">
              <input type="date" data-k="fecha" value="${esc(s.fecha)}" aria-label="Fecha">
              <span class="hint">${esc(lit.tiempo)}</span>
              <select data-k="estado" aria-label="Estado">${Object.entries(ESTADO).map(([k, t]) => `<option value="${k}"${(s.estado || '') === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
              <button type="button" class="icon-btn sm" data-a="note" title="Preparar este encuentro" aria-label="Preparar este encuentro">${icon('pagina', 14)}</button>
              <button type="button" class="icon-btn sm" data-a="del" title="Quitar" aria-label="Quitar encuentro">${icon('x', 14)}</button>
            </div>
            <div class="field-row">
              <label class="field"><span>Tema</span><input data-k="tema" value="${esc(s.tema || '')}"></label>
              <label class="field"><span>Palabra de Dios</span><input data-k="cita" value="${esc(s.cita || '')}" placeholder="Evangelio del domingo"></label>
            </div>
            <div class="field-row">
              <label class="field"><span>Objetivo</span><input data-k="objetivo" value="${esc(s.objetivo || '')}"></label>
              <label class="field"><span>Materiales</span><input data-k="materiales" value="${esc(s.materiales || '')}"></label>
              <label class="field"><span>Suplente</span><input data-k="suplente" value="${esc(s.suplente || '')}" placeholder="Si no puede ir"></label>
            </div>
          </div>`; }).join('') || '<p class="empty">Sin encuentros.</p>'}</div>
        </section>
        <label class="field"><span>Avisos para el mes (reuniones, celebraciones, recordatorios)</span><textarea data-f="avisos" rows="3">${esc(c.avisos || '')}</textarea></label>
      </div>`;
    $$('[data-f]').forEach(el => el.addEventListener('input', () => { c[el.dataset.f] = el.value; persist(); }));
    $$('.cq-ses').forEach(box => {
      const s = c.sesiones[Number(box.dataset.i)];
      box.querySelectorAll('[data-k]').forEach(el => el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => {
        s[el.dataset.k] = el.value;
        if (el.dataset.k === 'fecha') { if (!s.cita || s.citaAuto) { s.cita = evDeLaSemana(el.value); s.citaAuto = true; } c.sesiones.sort((a, b) => a.fecha.localeCompare(b.fecha)); persist.flush(); save(c); render(); return; }
        if (el.dataset.k === 'cita') s.citaAuto = false;
        if (el.dataset.k === 'estado') box.className = `cq-ses ${el.value}`;
        persist();
      }));
      box.querySelector('[data-a=del]').addEventListener('click', () => { c.sesiones.splice(Number(box.dataset.i), 1); persist.flush(); save(c); render(); });
      box.querySelector('[data-a=note]').addEventListener('click', () => {
        persist.flush();
        const t = live('templates').find(x => x.builtin === 'ivc') || live('templates').find(x => /catequ/i.test(x.name));
        const sp = live('spaces').find(x => /catequ/i.test(x.name)) || live('spaces').find(x => /pastoral/i.test(x.name));
        const blocks = t ? structuredClone(t.content?.blocks || []) : null;
        if (blocks) {
          for (const b of blocks) {
            if (b.type === 'list') b.data.items.forEach(it => {
              const map = { 'Grupo:': c.grupo, 'Etapa:': c.etapa, 'Fecha:': fechaCorta(parseISO(s.fecha)), 'Catequista:': c.catequista, 'Suplente:': s.suplente };
              for (const [k, v] of Object.entries(map)) if (it.content === k && v) it.content = `${k} ${v}`;
            });
            if (b.type === 'biblia' && !b.data.ref && s.cita) b.data.ref = s.cita;
          }
        }
        createNote({ spaceId: sp?.id, templateId: t?.id || '', blocks, title: `Encuentro · ${s.tema || c.grupo || c.catequista}`, fecha: s.fecha });
      });
    });
    $('#cqAdd').addEventListener('click', () => {
      const last = c.sesiones[c.sesiones.length - 1]?.fecha;
      const d = last ? parseISO(last) : parseISO(`${c.mes}-01`);
      if (last) d.setDate(d.getDate() + 7);
      const f = isoDate(d);
      c.sesiones.push({ id: db.uid('se'), fecha: f, tema: '', objetivo: '', cita: evDeLaSemana(f), citaAuto: true, materiales: '', suplente: '', estado: '' });
      persist.flush(); save(c); render();
    });
    $('#cqPrint').addEventListener('click', () => { persist.flush(); imprimir([c]); });
    $('#cqDel').addEventListener('click', async () => {
      if (!await confirmDialog('Borrar plan', `El plan de ${c.catequista} para ${mesNombre(c.mes)} se borrará.`, { okLabel: 'Borrar', danger: true })) return;
      persist.cancel?.(); c.deleted = true; await save(c); location.hash = '#/catequesis/' + c.mes;
    });
  };
  render();
}

/* ---------- Hoja imprimible ---------- */
function hoja(c) {
  const parr = settings().parroquia || '';
  const ses = c.sesiones || [];
  return `<section class="cq-sheet">
    <header><div class="cq-sh-top"><span>${esc(parr)}</span><span>Plan de catequesis · ${esc(cap(mesNombre(c.mes)))}</span></div>
      <h1>${esc(c.catequista || '')}</h1>
      <p>${[c.grupo, c.etapa, c.telefono ? 'Tel. ' + c.telefono : ''].filter(Boolean).map(esc).join(' · ')}</p></header>
    <table><thead><tr><th>Fecha</th><th>Tema y objetivo</th><th>Palabra de Dios</th><th>Materiales</th><th>Suplente</th><th>✓</th></tr></thead>
      <tbody>${ses.map(s => `<tr><td class="fe"><strong>${esc(corta(s.fecha))}</strong></td><td><strong>${esc(s.tema || '')}</strong>${s.objetivo ? `<br>${esc(s.objetivo)}` : ''}</td><td>${esc(s.cita || '')}</td><td>${esc(s.materiales || '')}</td><td>${esc(s.suplente || '')}</td><td class="ck">${s.estado === 'hecha' ? '✓' : s.estado === 'aplazada' ? '↷' : '☐'}</td></tr>`).join('')}</tbody></table>
    <div class="cq-sh-foot"><div><strong>Avisos</strong><p>${esc(c.avisos || '').replace(/\n/g, '<br>') || '&nbsp;'}</p></div><div><strong>Observaciones</strong><p class="lines"></p></div></div>
  </section>`;
}

function imprimir(list) {
  const old = $('#printSheets');
  old?.remove();
  const box = document.createElement('div');
  box.id = 'printSheets';
  box.innerHTML = list.map(hoja).join('');
  document.body.appendChild(box);
  document.body.classList.add('printing-sheets');
  const done = () => { document.body.classList.remove('printing-sheets'); box.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}
