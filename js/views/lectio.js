// Lectio Divina guiada sobre el Evangelio del domingo, guardada como diario de oración semanal.
import * as db from '../db.js';
import { S, $, $$, esc, icon, save, toast, live, debounce, page, confirmDialog, dialog, isoDate, parseISO, fechaCorta, fechaLarga } from '../core.js';
import { liturgicalDay, nextCelebration, COLORES } from '../liturgia.js';
import { lecturasPara, evangelioPara, vaticanUrl, lecturasHtml } from '../lecturas.js';
import { prepararHomilia } from './calendar.js';

export const PASOS = [
  { k: 'texto', n: 'Preparar', t: 'Ponte en presencia de Dios',
    g: 'Busca un lugar tranquilo. Respira, haz la señal de la cruz e invoca al Espíritu Santo. Si quieres, pega aquí el texto del Evangelio para tenerlo a mano.',
    q: [], ph: 'Pega aquí el texto del Evangelio (opcional)…' },
  { k: 'lectio', n: 'Lectio', t: '¿Qué dice el texto?',
    g: 'Lee despacio, dos o tres veces. Fíjate en los personajes, los lugares, los verbos, lo que se repite. No busques todavía qué te dice a ti: deja que el texto hable.',
    q: ['¿Quiénes aparecen y qué hacen?', '¿Qué palabra o frase te llamó la atención?'], ph: 'La palabra o frase que me tocó…' },
  { k: 'meditatio', n: 'Meditatio', t: '¿Qué me dice el texto?',
    g: 'Rumia esa frase como María, que guardaba todo en su corazón. Déjala tocar tu vida, tu ministerio y tu comunidad.',
    q: ['¿Qué ilumina de mi vida en esta semana?', '¿Qué le dice a la gente que me ha sido confiada?'], ph: 'Lo que el Señor me dice…' },
  { k: 'oratio', n: 'Oratio', t: '¿Qué le digo a Dios?',
    g: 'Respóndele con sencillez: alabanza, gratitud, súplica, perdón. Puedes escribir tu oración tal como te sale.',
    q: [], ph: 'Señor…' },
  { k: 'contemplatio', n: 'Contemplatio', t: 'Quédate con Él',
    g: 'Ya no hacen falta muchas palabras. Permanece en silencio ante el Señor. Si quieres, usa el reloj de silencio. Después anota la mirada, la imagen o la paz que te quedó.',
    q: [], ph: 'Lo que me quedó del silencio…', timer: true },
  { k: 'actio', n: 'Actio', t: '¿Qué me pide hacer?',
    g: 'La Palabra se hace vida. Escoge un compromiso pequeño y concreto para esta semana.',
    q: [], ph: 'Esta semana voy a…', actio: true },
];

const lectios = () => live('lectios').sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
const sundayFor = (from = new Date()) => nextCelebration(from);

export function lectioFor(iso) { return lectios().find(l => l.fecha === iso); }

export async function nuevaLectio(iso) {
  const ex = lectioFor(iso);
  if (ex) { location.hash = '#/lectio/' + ex.id; return ex; }
  const d = parseISO(iso);
  const lit = liturgicalDay(d);
  const now = Date.now();
  const r = {
    id: db.uid('lx'), type: 'lectio', fecha: iso, clave: lit.clave || '', ciclo: lit.ciclo, etiqueta: lit.etiqueta || lit.semana,
    ev: evangelioPara(d), texto: '', lectio: '', meditatio: '', oratio: '', contemplatio: '', actio: '', paso: 0, created: now, updated: now,
  };
  await save(r);
  location.hash = '#/lectio/' + r.id;
  return r;
}

export function viewLectio(arg = '') {
  const m = arg.match(/^nueva\/(\d{4}-\d{2}-\d{2})$/);
  if (m) { nuevaLectio(m[1]); return; }
  if (arg && S.lectios.get(arg) && !S.lectios.get(arg).deleted) { viewSesion(arg); return; }
  viewDiario();
}

/* ---------- Diario ---------- */
function viewDiario() {
  const nx = sundayFor();
  const nxIso = nx ? isoDate(nx.fecha) : '';
  const ya = nx ? lectioFor(nxIso) : null;
  const lec = nx ? lecturasPara(nx.fecha) : null;
  const list = lectios();
  const borde = (c) => c === 'blanco' ? 'border:1.5px solid #B9AC96;' : '';
  $('#view').innerHTML = `
    <div class="page">
      <header class="page-head">
        <div><div class="eyebrow">Diario de oración</div><h1 class="display">Lectio Divina</h1></div>
      </header>
      ${nx ? `<section class="card feature">
        <div class="feature-main">
          <div class="eyebrow accent"><span class="lit-dot" style="background:${COLORES[nx.color]};${borde(nx.color)}"></span>${esc(fechaCorta(nx.fecha))} · Ciclo ${nx.ciclo}</div>
          <h2 class="feature-title">${esc(nx.etiqueta)}</h2>
          ${lec ? `<p class="lx-ev">${icon('libro', 15)} Evangelio: <strong>${esc(lec.ev)}</strong></p>` : ''}
          <div class="btn-row">
            <a class="btn primary" href="#/lectio/${ya ? ya.id : 'nueva/' + nxIso}">${icon('vela', 14)}${ya ? 'Seguir mi Lectio' : 'Empezar la Lectio'}</a>
            <a class="btn" href="${vaticanUrl(nx.fecha)}" target="_blank" rel="noopener">Leer el Evangelio ↗</a>
          </div>
        </div>
        <aside class="feature-side">
          <div class="mini-label">Los cinco pasos</div>
          <ol class="lx-steps-mini">${PASOS.slice(1).map(p => `<li><strong>${p.n}</strong> · ${esc(p.t)}</li>`).join('')}</ol>
        </aside>
      </section>` : ''}
      <section class="card">
        <div class="card-head"><h2 class="card-title">Mi diario</h2>
          <button type="button" class="btn sm" id="otraFecha">${icon('calendario', 13)}Otra fecha</button></div>
        ${list.length ? `<div class="rows">${list.map(l => {
          const hechos = PASOS.slice(1).filter(p => (l[p.k] || '').trim()).length;
          const frase = (l.lectio || '').trim().split('\n')[0];
          return `<a class="row" href="#/lectio/${l.id}">
            <span class="row-main"><span class="row-title">${esc(l.etiqueta || 'Lectio')}${l.ev ? ` · <span class="muted">${esc(l.ev)}</span>` : ''}</span>
              ${frase ? `<span class="row-snip">«${esc(frase.slice(0, 140))}»</span>` : ''}
              ${(l.actio || '').trim() ? `<span class="row-snip">${icon('der', 12)} ${esc(l.actio.trim().split('\n')[0].slice(0, 120))}</span>` : ''}</span>
            <span class="row-meta">${esc(fechaCorta(parseISO(l.fecha)))} · ${hechos}/5</span>
          </a>`;
        }).join('')}</div>` : '<p class="empty">Aquí quedarán tus Lectio de cada semana: la frase que te tocó, tu oración y tu compromiso.</p>'}
      </section>
    </div>`;
  $('#otraFecha').addEventListener('click', async () => {
    const iso = await dialog({
      title: 'Lectio para otra fecha',
      body: `<label class="field"><span>Domingo o solemnidad</span><input type="date" name="d" value="${nxIso}"></label><p class="hint">Si eliges un día entre semana, se toma el domingo siguiente.</p>`,
      actions: [{ label: 'Cancelar', value: null }, { label: 'Abrir', primary: true, value: (d) => d.querySelector('[name=d]').value || false }],
    });
    if (!iso) return;
    const c = sundayFor(parseISO(iso));
    nuevaLectio(c ? isoDate(c.fecha) : iso);
  });
}

/* ---------- Sesión guiada ---------- */
let timer = null;
function viewSesion(id) {
  const l = S.lectios.get(id);
  const d = parseISO(l.fecha);
  const lec = lecturasPara(d);
  let paso = Math.min(Math.max(l.paso || 0, 0), PASOS.length - 1);

  const persist = debounce(async () => { await save(l); }, 600);
  page.flush = () => persist.flush();
  page.cleanup = async () => { clearInterval(timer); timer = null; persist.flush(); };

  const render = () => {
    const p = PASOS[paso];
    $('#view').innerHTML = `
      <div class="page lx-page">
        <nav class="crumbs"><a href="#/lectio">Lectio Divina</a> <span>/</span> <span>${esc(fechaCorta(d))}</span></nav>
        <header class="page-head">
          <div><div class="eyebrow">${esc(fechaLarga(d))} · Ciclo ${l.ciclo}</div><h1 class="display lx-title">${esc(l.etiqueta || 'Lectio Divina')}</h1></div>
          <div class="head-actions"><button type="button" class="icon-btn" id="lxDel" title="Borrar" aria-label="Borrar esta Lectio">${icon('papelera', 17)}</button></div>
        </header>
        <div class="lx-ref">
          <label class="field lx-evf"><span>Evangelio</span><input id="lxEv" value="${esc(l.ev || '')}" placeholder="Mt 5, 1-12a"></label>
          <a class="btn sm" href="${vaticanUrl(d)}" target="_blank" rel="noopener">Leer el texto ↗</a>
          ${lec ? `<details class="lit-lec"><summary>Todas las lecturas</summary>${lecturasHtml(lec, esc)}</details>` : ''}
        </div>
        <ol class="lx-tabs" role="tablist">${PASOS.map((x, i) => `<li><button type="button" role="tab" aria-selected="${i === paso}" class="${i === paso ? 'on' : ''}${(l[x.k] || '').trim() ? ' done' : ''}" data-p="${i}"><span class="lx-n">${i || '·'}</span>${x.n}</button></li>`).join('')}</ol>
        <section class="card lx-card">
          <div class="eyebrow accent">${paso ? `Paso ${paso} de 5 · ${p.n}` : 'Antes de empezar'}</div>
          <h2 class="lx-h">${esc(p.t)}</h2>
          <p class="lx-g">${esc(p.g)}</p>
          ${p.q.length ? `<ul class="lx-q">${p.q.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
          ${paso > 1 && (l.lectio || '').trim() ? `<blockquote class="lx-frase">«${esc((l.lectio || '').trim().split('\n')[0])}»</blockquote>` : ''}
          ${p.timer ? `<div class="lx-timer"><button type="button" class="btn sm" data-min="3">3 min</button><button type="button" class="btn sm" data-min="5">5 min</button><button type="button" class="btn sm" data-min="10">10 min</button><span id="lxClock" class="lx-clock" aria-live="polite"></span></div>` : ''}
          <label class="sr" for="lxText">${esc(p.t)}</label>
          <textarea id="lxText" class="lx-text${p.k === 'texto' ? ' serif' : ''}" rows="${p.k === 'texto' ? 10 : 7}" placeholder="${esc(p.ph)}">${esc(l[p.k] || '')}</textarea>
          ${p.actio ? `<div class="btn-row"><button type="button" class="btn" id="lxPlan">${icon('tablero', 14)}Pasar al planeador de la semana</button>
            <button type="button" class="btn" id="lxHom">${icon('pluma', 14)}Preparar la homilía</button></div>` : ''}
          <div class="lx-nav">
            <button type="button" class="btn" id="lxPrev" ${paso === 0 ? 'disabled' : ''}>${icon('izq', 14)}Anterior</button>
            ${paso < PASOS.length - 1 ? `<button type="button" class="btn primary" id="lxNext">Siguiente${icon('der', 14)}</button>` : `<a class="btn primary" href="#/lectio">${icon('vela', 14)}Terminar</a>`}
          </div>
        </section>
      </div>`;
    const ta = $('#lxText');
    ta.addEventListener('input', () => { l[p.k] = ta.value; persist(); });
    $('#lxEv').addEventListener('input', (e) => { l.ev = e.target.value; persist(); });
    const go = (i) => { persist.flush(); paso = i; l.paso = i; persist(); render(); window.scrollTo(0, 0); };
    $$('.lx-tabs [data-p]').forEach(b => b.addEventListener('click', () => go(Number(b.dataset.p))));
    $('#lxPrev').addEventListener('click', () => go(paso - 1));
    $('#lxNext')?.addEventListener('click', () => go(paso + 1));
    $('#lxDel').addEventListener('click', async () => {
      if (!await confirmDialog('Borrar esta Lectio', 'Se borrará del diario en todos tus aparatos.', { okLabel: 'Borrar', danger: true })) return;
      persist.cancel?.(); l.deleted = true; await save(l); location.hash = '#/lectio';
    });
    $$('.lx-timer [data-min]').forEach(b => b.addEventListener('click', () => startTimer(Number(b.dataset.min))));
    $('#lxPlan')?.addEventListener('click', async () => {
      const text = (l.actio || '').trim().split('\n')[0];
      if (!text) { toast('Escribe primero tu compromiso'); ta.focus(); return; }
      const mon = new Date(d); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
      // El domingo cierra la semana del planeador: el compromiso va a la semana que empieza al día siguiente
      if (d.getDay() === 0) mon.setDate(mon.getDate() + 7);
      const now = Date.now();
      await save({ id: db.uid('p'), type: 'plan', text, color: 'morado', sticker: 'cruz', done: false, week: isoDate(mon), created: now, order: now });
      toast('Listo: está en «Para esta semana» del planeador');
    });
    $('#lxHom')?.addEventListener('click', () => { persist.flush(); prepararHomilia(l.fecha); });
  };

  const startTimer = (min) => {
    clearInterval(timer);
    let left = min * 60;
    const clock = () => { const el = $('#lxClock'); if (el) el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; };
    clock();
    timer = setInterval(() => {
      left--; clock();
      if (left <= 0) {
        clearInterval(timer); timer = null;
        const el = $('#lxClock'); if (el) el.textContent = 'Amén';
        try { navigator.vibrate?.([200, 100, 200]); } catch (e) {}
      }
    }, 1000);
  };
  render();
}
