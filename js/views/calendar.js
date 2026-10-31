// Calendario: el año litúrgico día por día y las notas con fecha.
import { S, $, $$, esc, icon, isoDate, parseISO, fechaCorta, MESES, liveNotes, findSpaceByName, live } from '../core.js';
import { liturgicalDay, COLORES } from '../liturgia.js';
import { createNote } from './notes.js';
import * as gcal from '../gcal.js';
import { permissionHtml, bindPermission, eventRows, bindEventRows, eventDialog } from './agenda.js';

let monthEvents = [];
let currentArg = '';

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function homiliaTemplateId() {
  const t = live('templates').find(x => /homil/i.test(x.name));
  return t?.id || '';
}

export async function prepararHomilia(dateIso) {
  const dt = parseISO(dateIso);
  const lit = liturgicalDay(dt);
  const name = lit.etiqueta || lit.semana;
  const title = `Homilía · ${name}${lit.domingo || lit.clave ? ` · Ciclo ${lit.ciclo}` : ''}`;
  const sp = findSpaceByName('pastoral', 'homil');
  return createNote({ spaceId: sp?.id, templateId: homiliaTemplateId(), title, fecha: dateIso });
}

export function viewCalendar(arg = '') {
  currentArg = arg;
  monthEvents = [];
  const now = new Date();
  let [y, m] = (arg.match(/^(\d{4})-(\d{2})$/) || []).slice(1).map(Number);
  if (!y) { y = now.getFullYear(); m = now.getMonth() + 1; }
  const first = new Date(y, m - 1, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const prev = isoDate(new Date(y, m - 2, 1)).slice(0, 7);
  const next = isoDate(new Date(y, m, 1)).slice(0, 7);
  const byDate = new Map();
  liveNotes().filter(n => n.fecha).forEach(n => { if (!byDate.has(n.fecha)) byDate.set(n.fecha, []); byDate.get(n.fecha).push(n); });
  const todayIso = isoDate(now);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== m - 1) break;
    const iso = isoDate(d);
    const lit = liturgicalDay(d);
    const notes = byDate.get(iso) || [];
    const fiesta = lit.etiqueta && (lit.clave || lit.domingo);
    cells.push(`<button type="button" class="cal-day${d.getMonth() !== m - 1 ? ' out' : ''}${iso === todayIso ? ' today' : ''}${lit.domingo ? ' sun' : ''}" data-d="${iso}" aria-label="${esc(fechaCorta(d))}${lit.etiqueta ? ', ' + esc(lit.etiqueta) : ''}">
      <span class="cal-num"><span class="lit-dot sm" style="background:${COLORES[lit.color]};${lit.color === 'blanco' ? 'border:1px solid #B9AC96;' : ''}"></span>${d.getDate()}</span>
      ${fiesta ? `<span class="cal-fiesta">${esc(lit.etiqueta)}</span>` : ''}
      ${notes.slice(0, 3).map(n => `<span class="cal-note">${esc(n.title || 'Sin título')}</span>`).join('')}
      ${notes.length > 3 ? `<span class="cal-more">+${notes.length - 3}</span>` : ''}
    </button>`);
  }
  const lit = liturgicalDay(first);
  $('#view').innerHTML = `
    <div class="page">
      <header class="page-head">
        <div><div class="eyebrow">Ciclo ${lit.ciclo} · ${lit.anoFerial}</div><h1 class="display">${MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1)} ${y}</h1></div>
        <div class="head-actions">
          <a class="btn" href="#/calendario/${prev}" aria-label="Mes anterior">${icon('izq', 14)}</a>
          <a class="btn" href="#/calendario/${isoDate(now).slice(0, 7)}">Hoy</a>
          <a class="btn" href="#/calendario/${next}" aria-label="Mes siguiente">${icon('der', 14)}</a>
        </div>
      </header>
      <div class="cal">
        ${DOW.map(d => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells.join('')}
      </div>
      <div id="dayPanel"></div>
    </div>`;
  $$('.cal-day').forEach(b => b.addEventListener('click', () => {
    $$('.cal-day.sel').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    showDay(b.dataset.d, byDate.get(b.dataset.d) || []);
  }));
  const pre = (todayIso.slice(0, 7) === `${y}-${String(m).padStart(2, '0')}`) ? todayIso : null;
  if (pre) { $(`.cal-day[data-d="${pre}"]`)?.classList.add('sel'); showDay(pre, byDate.get(pre) || []); }
  loadMonthEvents(start, cells.length, byDate);
}

async function loadMonthEvents(start, count, byDate) {
  if (!gcal.isReady()) return;
  const end = new Date(start); end.setDate(end.getDate() + count);
  try {
    const evs = await gcal.listEvents(start, end);
    if (!$('.cal')) return;
    monthEvents = evs;
    $$('.cal-day').forEach(cell => {
      const day = gcal.eventsOnDay(evs, cell.dataset.d);
      if (!day.length) return;
      cell.querySelectorAll('.cal-ev').forEach(x => x.remove());
      const html = day.slice(0, 3).map(e => `<span class="cal-ev" style="--c:${esc(e.color)}">${e.allDay ? '' : `<b>${gcal.hhmm(e.start)}</b> `}${esc(e.summary)}</span>`).join('') + (day.length > 3 ? `<span class="cal-more">+${day.length - 3}</span>` : '');
      const num = cell.querySelector('.cal-fiesta') || cell.querySelector('.cal-num');
      num.insertAdjacentHTML('afterend', html);
    });
    const sel = $('.cal-day.sel');
    if (sel) showDay(sel.dataset.d, byDate.get(sel.dataset.d) || []);
  } catch (e) { /* sin conexión o sin permiso: el calendario litúrgico sigue funcionando */ }
}

function showDay(iso, notes) {
  const d = parseISO(iso);
  const lit = liturgicalDay(d);
  const previas = lit.clave ? liveNotes().filter(n => n.litKey === lit.clave && n.fecha !== iso).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')) : [];
  $('#dayPanel').innerHTML = `<section class="card day-panel">
    <div class="eyebrow">${esc(fechaCorta(d))}</div>
    <h2 class="card-title"><span class="lit-dot" style="background:${COLORES[lit.color]};${lit.color === 'blanco' ? 'border:1.5px solid #B9AC96;' : ''}"></span> ${esc(lit.etiqueta || lit.semana)}</h2>
    <p class="hint">${esc(lit.tiempo)}${lit.semana && lit.etiqueta ? ' · ' + esc(lit.semana) : ''} · color ${lit.color} · Ciclo ${lit.ciclo} · ${lit.anoFerial}</p>
    ${notes.length ? `<div class="rows">${notes.map(n => `<a class="row" href="#/nota/${n.id}"><span class="row-main"><span class="row-title">${esc(n.title || 'Sin título')}</span></span><span class="row-meta">${esc(S.spaces.get(n.spaceId)?.name || '')}</span></a>`).join('')}</div>` : ''}
    ${previas.length ? `<h3 class="mini">Este mismo día en otros años</h3><div class="rows">${previas.map(n => `<a class="row" href="#/nota/${n.id}"><span class="row-main"><span class="row-title">${esc(n.title || 'Sin título')}</span></span><span class="row-meta">${n.fecha?.slice(0, 4)} · ciclo ${liturgicalDay(parseISO(n.fecha)).ciclo}</span></a>`).join('')}</div>` : ''}
    ${gcal.isReady() ? (() => { const evs = gcal.eventsOnDay(monthEvents, iso); return `<h3 class="mini">Agenda</h3>${evs.length ? `<div class="ev-list" id="dayEvents">${eventRows(evs)}</div>` : '<p class="hint">Nada en tu Google Calendar este día.</p>'}`; })()
      : gcal.needsPermission() ? `<h3 class="mini">Agenda</h3><div id="dayPerm">${permissionHtml()}</div>` : ''}
    <div class="btn-row">
      ${lit.clave ? `<button type="button" class="btn primary" id="hom">${icon('pluma', 14)}Preparar homilía</button>` : ''}
      <button type="button" class="btn" id="dayNote">${icon('mas', 14)}Nota para este día</button>
      ${gcal.isReady() ? `<button type="button" class="btn" id="dayEvent">${icon('calendario', 14)}Nuevo evento</button>` : ''}
    </div>
  </section>`;
  if ($('#dayEvents')) bindEventRows($('#dayEvents'), gcal.eventsOnDay(monthEvents, iso), { onChange: () => viewCalendar(currentArg), createNote });
  if ($('#dayPerm')) bindPermission($('#dayPerm'), () => viewCalendar(currentArg));
  $('#dayEvent')?.addEventListener('click', async () => { const r = await eventDialog({ date: iso }); if (r) viewCalendar(currentArg); });
  $('#hom')?.addEventListener('click', () => prepararHomilia(iso));
  $('#dayNote').addEventListener('click', () => createNote({ fecha: iso, ask: true }));
}
