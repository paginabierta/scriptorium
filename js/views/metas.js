// Metas personales y pastorales: pasos con fecha y una revisión corta cada mes.
import * as db from '../db.js';
import { S, $, $$, esc, icon, save, toast, live, dialog, confirmDialog, debounce, page, isoDate, parseISO, fechaCorta, MESES } from '../core.js';

export const AMBITOS = { personal: 'Personal', pastoral: 'Pastoral' };
const ESTADOS = { activa: 'En camino', pausada: 'En pausa', lograda: 'Lograda' };
const mesKey = (d = new Date()) => isoDate(d).slice(0, 7);
const mesNombre = (k) => { const [y, m] = k.split('-').map(Number); return `${MESES[m - 1]} ${y}`; };

export const goals = () => live('goals').sort((a, b) => (a.order ?? a.created ?? 0) - (b.order ?? b.created ?? 0));
export const activas = () => goals().filter(g => (g.estado || 'activa') === 'activa');
export function progreso(g) {
  const st = g.steps || [];
  return st.length ? Math.round(st.filter(s => s.done).length / st.length * 100) : (g.estado === 'lograda' ? 100 : 0);
}
export function proximoPaso(g) {
  return (g.steps || []).filter(s => !s.done).sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999'))[0];
}
// ¿Toca la revisión del mes? Desde el día 25, o en los primeros 5 días del mes siguiente si quedó pendiente.
export function revisionPendiente(now = new Date()) {
  const act = activas();
  if (!act.length) return null;
  let key = null;
  if (now.getDate() >= 25) key = mesKey(now);
  else if (now.getDate() <= 5) key = mesKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  if (!key) return null;
  const faltan = act.filter(g => !(g.revisiones || {})[key] && (g.created || 0) < new Date(+key.slice(0, 4), +key.slice(5) , 1).getTime());
  return faltan.length ? { key, faltan } : null;
}

export function viewMetas(arg = '') {
  if (arg.startsWith('revision')) { viewRevision(arg.split('/')[1] || mesKey()); return; }
  const g = arg && S.goals.get(arg);
  if (g && !g.deleted) { viewMeta(g); return; }
  viewLista();
}

let filtro = 'todas';
function barra(p) { return `<div class="bar"><div style="width:${p}%"></div></div>`; }

function tarjeta(g) {
  const p = progreso(g);
  const nx = proximoPaso(g);
  const st = g.estado || 'activa';
  return `<a class="card goal-card${st !== 'activa' ? ' ' + st : ''}" href="#/metas/${g.id}">
    <div class="goal-top"><span class="chip">${AMBITOS[g.ambito] || 'Personal'}</span>${st !== 'activa' ? `<span class="chip">${ESTADOS[st]}</span>` : ''}${g.fechaMeta ? `<span class="hint">para ${esc(fechaCorta(parseISO(g.fechaMeta)))}</span>` : ''}</div>
    <h3 class="goal-title">${esc(g.title || 'Meta sin nombre')}</h3>
    ${barra(p)}
    <div class="goal-foot"><span>${(g.steps || []).filter(s => s.done).length} de ${(g.steps || []).length} pasos</span><strong>${p} %</strong></div>
    ${nx ? `<p class="goal-next">${icon('der', 12)} ${esc(nx.text || 'Paso sin nombre')}${nx.fecha ? ` · <span class="muted">${esc(fechaCorta(parseISO(nx.fecha)))}</span>` : ''}</p>` : ''}
  </a>`;
}

function viewLista() {
  const all = goals();
  const list = all.filter(g => filtro === 'todas' || (filtro === 'logradas' ? g.estado === 'lograda' : (g.ambito || 'personal') === filtro && g.estado !== 'lograda'));
  const rev = revisionPendiente();
  const mk = mesKey();
  $('#view').innerHTML = `
    <div class="page">
      <header class="page-head">
        <div><div class="eyebrow">Lo que quiero lograr, paso a paso</div><h1 class="display">Metas</h1></div>
        <div class="head-actions">
          <a class="btn" href="#/metas/revision/${rev ? rev.key : mk}">${icon('repaso', 14)}Revisión del mes</a>
          <button type="button" class="btn primary" id="newGoal">${icon('mas', 14)}Nueva meta</button>
        </div>
      </header>
      ${rev ? `<section class="card rev-nudge"><div><strong>Es tiempo de revisar ${esc(mesNombre(rev.key))}.</strong>
        <span class="hint">Tres preguntas por meta: qué avancé, qué me frenó, qué ajusto. Faltan ${rev.faltan.length}.</span></div>
        <a class="btn primary" href="#/metas/revision/${rev.key}">Hacer la revisión</a></section>` : ''}
      <div class="seg goal-filter" role="group" aria-label="Filtrar metas">
        ${[['todas', 'Todas'], ['personal', 'Personales'], ['pastoral', 'Pastorales'], ['logradas', 'Logradas']].map(([k, t]) => `<button type="button" data-f="${k}" class="${filtro === k ? 'on' : ''}">${t}</button>`).join('')}
      </div>
      ${list.length ? `<div class="goal-grid">${list.map(tarjeta).join('')}</div>`
        : `<section class="card"><p class="empty">${all.length ? 'Nada en este filtro.' : 'Escribe una meta, pártela en pasos pequeños con fecha y revísala una vez al mes. Por ejemplo: «Terminar la carrera en la UDI» o «Formar dos catequistas nuevos».'}</p></section>`}
    </div>`;
  $$('.goal-filter [data-f]').forEach(b => b.addEventListener('click', () => { filtro = b.dataset.f; viewLista(); }));
  $('#newGoal').addEventListener('click', nuevaMeta);
}

export async function nuevaMeta() {
  const v = await dialog({
    title: 'Nueva meta',
    body: `<label class="field"><span>¿Qué quieres lograr?</span><input name="t" placeholder="Ej.: Visitar a los enfermos de las veredas una vez al mes" autocomplete="off"></label>
      <div class="field-row">
        <label class="field"><span>Ámbito</span><select name="a"><option value="personal">Personal</option><option value="pastoral">Pastoral</option></select></label>
        <label class="field"><span>Para cuándo (opcional)</span><input type="date" name="f"></label>
      </div>
      <label class="field"><span>¿Por qué es importante para ti? (opcional)</span><textarea name="p" rows="2"></textarea></label>`,
    actions: [{ label: 'Cancelar', value: null }, { label: 'Crear', primary: true, value: (d) => {
      const t = d.querySelector('[name=t]').value.trim();
      if (!t) { d.querySelector('[name=t]').focus(); return false; }
      return { t, a: d.querySelector('[name=a]').value, f: d.querySelector('[name=f]').value, p: d.querySelector('[name=p]').value.trim() };
    } }],
    onOpen: (d) => d.querySelector('[name=t]').focus(),
  });
  if (!v) return;
  const now = Date.now();
  const g = { id: db.uid('g'), type: 'goal', title: v.t, ambito: v.a, fechaMeta: v.f, porque: v.p, estado: 'activa', steps: [], revisiones: {}, created: now, updated: now, order: now };
  await save(g);
  location.hash = '#/metas/' + g.id;
}

/* ---------- Una meta ---------- */
function viewMeta(g) {
  const persist = debounce(() => save(g), 500);
  page.flush = () => persist.flush();
  page.cleanup = () => persist.flush();
  g.steps = g.steps || [];
  g.revisiones = g.revisiones || {};

  const render = () => {
    const p = progreso(g);
    const revs = Object.entries(g.revisiones).sort((a, b) => b[0].localeCompare(a[0]));
    $('#view').innerHTML = `
      <div class="page goal-page">
        <nav class="crumbs"><a href="#/metas">Metas</a> <span>/</span> <span>${AMBITOS[g.ambito] || 'Personal'}</span></nav>
        <label class="sr" for="gTitle">Nombre de la meta</label>
        <textarea id="gTitle" class="goal-name" rows="1" placeholder="Nombre de la meta">${esc(g.title || '')}</textarea>
        <div class="goal-meta">
          <label class="meta-field"><span>Ámbito</span><select id="gAmb">${Object.entries(AMBITOS).map(([k, t]) => `<option value="${k}"${(g.ambito || 'personal') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="meta-field"><span>Estado</span><select id="gEst">${Object.entries(ESTADOS).map(([k, t]) => `<option value="${k}"${(g.estado || 'activa') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="meta-field"><span>Para</span><input type="date" id="gFecha" value="${esc(g.fechaMeta || '')}"></label>
          <button type="button" class="icon-btn" id="gDel" title="Borrar meta" aria-label="Borrar meta">${icon('papelera', 17)}</button>
        </div>
        <div class="goal-prog">${barra(p)}<strong>${p} %</strong></div>
        <label class="field"><span>Por qué es importante</span><textarea id="gPorque" rows="2" placeholder="Lo que me mueve…">${esc(g.porque || '')}</textarea></label>

        <section class="card">
          <div class="card-head"><h2 class="card-title">Pasos</h2><span class="hint">Pequeños y con fecha</span></div>
          <ul class="steps" id="steps">${g.steps.map((s, i) => `<li class="step${s.done ? ' done' : ''}" data-i="${i}">
            <input type="checkbox" ${s.done ? 'checked' : ''} aria-label="Hecho" data-k="done">
            <input class="step-t" value="${esc(s.text || '')}" placeholder="Describe el paso" data-k="text" aria-label="Paso">
            <input type="date" value="${esc(s.fecha || '')}" data-k="fecha" aria-label="Fecha del paso">
            <span class="step-act">
              <button type="button" class="icon-btn sm" data-a="up" aria-label="Subir" title="Subir" ${i === 0 ? 'disabled' : ''}>${icon('arriba', 14)}</button>
              <button type="button" class="icon-btn sm" data-a="plan" aria-label="Pasar al planeador" title="Pasar al planeador">${icon('tablero', 14)}</button>
              <button type="button" class="icon-btn sm" data-a="del" aria-label="Quitar paso" title="Quitar">${icon('x', 14)}</button>
            </span>
          </li>`).join('')}</ul>
          <form class="inline-form" id="addStep"><input id="newStep" placeholder="Nuevo paso…" autocomplete="off" aria-label="Nuevo paso"><button class="btn sm" type="submit">${icon('mas', 13)}Añadir</button></form>
        </section>

        <section class="card">
          <div class="card-head"><h2 class="card-title">Revisiones mensuales</h2><button type="button" class="btn sm" id="revNow">${icon('repaso', 13)}Revisar ${esc(mesNombre(mesKey()))}</button></div>
          ${revs.length ? revs.map(([k, r]) => `<div class="rev-item"><div class="mini">${esc(mesNombre(k))}</div>
            ${r.avance ? `<p><strong>Avancé:</strong> ${esc(r.avance)}</p>` : ''}${r.freno ? `<p><strong>Me frenó:</strong> ${esc(r.freno)}</p>` : ''}${r.ajuste ? `<p><strong>Ajusto:</strong> ${esc(r.ajuste)}</p>` : ''}</div>`).join('')
            : '<p class="empty">Cada mes, tres preguntas: qué avancé, qué me frenó, qué ajusto.</p>'}
        </section>
      </div>`;
    const title = $('#gTitle');
    const grow = () => { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; };
    grow();
    title.addEventListener('input', () => { g.title = title.value.replace(/\n/g, ' '); grow(); persist(); });
    $('#gPorque').addEventListener('input', (e) => { g.porque = e.target.value; persist(); });
    $('#gAmb').addEventListener('change', (e) => { g.ambito = e.target.value; persist(); });
    $('#gEst').addEventListener('change', (e) => { g.estado = e.target.value; persist.flush(); save(g); if (g.estado === 'lograda') toast('¡Bendito sea Dios! Meta lograda.'); render(); });
    $('#gFecha').addEventListener('change', (e) => { g.fechaMeta = e.target.value; persist(); });
    $('#gDel').addEventListener('click', async () => {
      if (!await confirmDialog('Borrar meta', `«${g.title}» y sus revisiones se borrarán.`, { okLabel: 'Borrar', danger: true })) return;
      persist.cancel?.(); g.deleted = true; await save(g); location.hash = '#/metas';
    });
    $$('#steps .step').forEach(li => {
      const s = g.steps[Number(li.dataset.i)];
      li.querySelector('[data-k=done]').addEventListener('change', (e) => { s.done = e.target.checked; s.doneAt = s.done ? Date.now() : null; persist.flush(); save(g); render(); });
      li.querySelector('[data-k=text]').addEventListener('input', (e) => { s.text = e.target.value; persist(); });
      li.querySelector('[data-k=fecha]').addEventListener('change', (e) => { s.fecha = e.target.value; persist(); });
      li.querySelector('[data-a=del]').addEventListener('click', () => { g.steps.splice(Number(li.dataset.i), 1); persist.flush(); save(g); render(); });
      li.querySelector('[data-a=up]').addEventListener('click', () => { const i = Number(li.dataset.i); if (!i) return; [g.steps[i - 1], g.steps[i]] = [g.steps[i], g.steps[i - 1]]; persist.flush(); save(g); render(); });
      li.querySelector('[data-a=plan]').addEventListener('click', async () => {
        if (!s.text) { toast('Escribe primero el paso'); return; }
        const now = Date.now();
        const rec = { id: db.uid('p'), type: 'plan', text: s.text, color: g.ambito === 'pastoral' ? 'azul' : 'verde', sticker: 'estrella', done: false, created: now, order: now };
        if (s.fecha) rec.date = s.fecha;
        else { const m = new Date(); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); rec.week = isoDate(m); }
        await save(rec);
        toast(s.fecha ? `En el planeador, el ${fechaCorta(parseISO(s.fecha))}` : 'En el planeador, «Para esta semana»');
      });
    });
    $('#addStep').addEventListener('submit', (e) => {
      e.preventDefault();
      const t = $('#newStep').value.trim();
      if (!t) return;
      g.steps.push({ id: db.uid('st'), text: t, fecha: '', done: false });
      persist.flush(); save(g); render(); $('#newStep').focus();
    });
    $('#revNow').addEventListener('click', async () => { if (await revisarUna(g, mesKey())) render(); });
  };
  render();
}

function revCampos(r = {}, pre = '') {
  return `<label class="field"><span>¿Qué avancé?</span><textarea name="${pre}avance" rows="2">${esc(r.avance || '')}</textarea></label>
    <label class="field"><span>¿Qué me frenó?</span><textarea name="${pre}freno" rows="2">${esc(r.freno || '')}</textarea></label>
    <label class="field"><span>¿Qué ajusto?</span><textarea name="${pre}ajuste" rows="2">${esc(r.ajuste || '')}</textarea></label>`;
}

async function revisarUna(g, key) {
  const r = (g.revisiones || {})[key] || {};
  const v = await dialog({
    title: `Revisión de ${mesNombre(key)}`,
    body: `<p class="hint">${esc(g.title)}</p>${revCampos(r)}`,
    actions: [{ label: 'Cancelar', value: null }, { label: 'Guardar', primary: true, value: (d) => ({ avance: d.querySelector('[name=avance]').value.trim(), freno: d.querySelector('[name=freno]').value.trim(), ajuste: d.querySelector('[name=ajuste]').value.trim() }) }],
  });
  if (!v) return false;
  g.revisiones = { ...(g.revisiones || {}), [key]: { ...v, fecha: Date.now() } };
  await save(g);
  toast('Revisión guardada');
  return true;
}

/* ---------- Revisión del mes (todas las metas activas) ---------- */
function viewRevision(key) {
  const list = activas();
  const [y, m] = key.split('-').map(Number);
  const prev = mesKey(new Date(y, m - 2, 1)), next = mesKey(new Date(y, m, 1));
  $('#view').innerHTML = `
    <div class="page">
      <nav class="crumbs"><a href="#/metas">Metas</a> <span>/</span> <span>Revisión</span></nav>
      <header class="page-head">
        <div><div class="eyebrow">Revisión del mes</div><h1 class="display">${esc(mesNombre(key).replace(/^./, c => c.toUpperCase()))}</h1></div>
        <div class="head-actions">
          <a class="btn" href="#/metas/revision/${prev}" aria-label="Mes anterior">${icon('izq', 14)}</a>
          <a class="btn" href="#/metas/revision/${next}" aria-label="Mes siguiente">${icon('der', 14)}</a>
        </div>
      </header>
      <p class="hint">Unos minutos, con calma. No es un examen: es mirar el camino con Dios y ajustar lo que haga falta.</p>
      ${list.length ? `<form id="revForm">${list.map(g => {
        const done = (g.steps || []).filter(s => s.done && s.doneAt && mesKey(new Date(s.doneAt)) === key);
        return `<section class="card rev-card" data-id="${g.id}">
          <div class="goal-top"><span class="chip">${AMBITOS[g.ambito] || 'Personal'}</span><span class="hint">${progreso(g)} %</span></div>
          <h2 class="card-title">${esc(g.title)}</h2>
          ${done.length ? `<p class="hint">Pasos cumplidos este mes: ${done.map(s => esc(s.text)).join(' · ')}</p>` : ''}
          ${revCampos((g.revisiones || {})[key], g.id + '-')}
        </section>`;
      }).join('')}
      <div class="btn-row"><button type="submit" class="btn primary">Guardar la revisión</button></div></form>`
        : '<section class="card"><p class="empty">No tienes metas en camino. Crea una para empezar a revisarlas cada mes.</p></section>'}
    </div>`;
  $('#revForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    let n = 0;
    for (const sec of $$('.rev-card')) {
      const g = S.goals.get(sec.dataset.id);
      const val = (k) => sec.querySelector(`[name="${g.id}-${k}"]`).value.trim();
      const v = { avance: val('avance'), freno: val('freno'), ajuste: val('ajuste') };
      if (!v.avance && !v.freno && !v.ajuste) continue;
      g.revisiones = { ...(g.revisiones || {}), [key]: { ...v, fecha: Date.now() } };
      await save(g); n++;
    }
    toast(n ? `Revisión guardada (${n} meta${n > 1 ? 's' : ''})` : 'No escribiste nada todavía');
    if (n) location.hash = '#/metas';
  });
}

/* ---------- Tarjeta para «Hoy» ---------- */
export function metasCard() {
  const act = activas();
  const rev = revisionPendiente();
  if (!act.length && !goals().length) return '';
  return `<section class="card">
    <div class="card-head"><h2 class="card-title">Metas</h2><a class="btn sm" href="#/metas">${icon('meta', 13)}Ver</a></div>
    ${rev ? `<a class="rev-mini" href="#/metas/revision/${rev.key}">${icon('repaso', 14)} Toca la revisión de ${esc(mesNombre(rev.key))}</a>` : ''}
    ${act.length ? `<div class="goal-mini">${act.slice(0, 4).map(g => { const p = progreso(g); const nx = proximoPaso(g); return `<a href="#/metas/${g.id}">
      <span class="goal-mini-t"><span>${esc(g.title)}</span><small>${p} %</small></span>${barra(p)}
      ${nx ? `<span class="hint">${icon('der', 11)} ${esc(nx.text)}${nx.fecha ? ' · ' + esc(fechaCorta(parseISO(nx.fecha))) : ''}</span>` : ''}</a>`; }).join('')}</div>`
      : '<p class="empty">No hay metas en camino.</p>'}
  </section>`;
}
