// Planeador tipo pizarra: mes arriba, semana abajo, marcadores de colores y stickers.
import * as db from '../db.js';
import * as gcal from '../gcal.js';
import { S, $, $$, esc, icon, save, toast, dialog, live, liveNotes, isoDate, parseISO, MESES, DIAS, page, refresh } from '../core.js';
import { liturgicalDay, COLORES } from '../liturgia.js';
import { evangelioPara } from '../lecturas.js';
import { eventDialog } from './agenda.js';

/* ---------- Marcadores y stickers ---------- */
export const MARKERS = [
  ['rojo', 'Rojo', '#FF6B6B', '#B42318'], ['naranja', 'Naranja', '#FFA24C', '#B54708'], ['amarillo', 'Amarillo', '#FFD94A', '#8A6A1F'],
  ['verde', 'Verde', '#7BE07F', '#3F6B2A'], ['azul', 'Azul', '#5CC8FF', '#2F5D7C'], ['blanco', 'Blanco', '#FFFFFF', '#1E1B16'],
  ['rosa', 'Rosa', '#FF7AC8', '#A3366F'], ['morado', 'Morado', '#B99BFF', '#5B4A7A'],
];
const S_ = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
export const STICKERS = {
  cruz: ['Misa / oración', S_('<path d="M12 3v18M7 8h10"/>')],
  iglesia: ['Parroquia', S_('<path d="M12 2v4M10 4h4M5 21V11l7-5 7 5v10M10 21v-5h4v5"/>')],
  libro: ['Estudio / lectura', S_('<path d="M4 5a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 2h12v-4"/>')],
  micro: ['Emisora', S_('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>')],
  gente: ['Reunión / grupo', S_('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 20c0-2.5 1-4.5 4-5"/>')],
  casa: ['Visita', S_('<path d="M3 11l9-7 9 7v10H3z"/><path d="M9 21v-6h6v6"/>')],
  cafe: ['Descanso', S_('<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 11h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3"/>')],
  corazon: ['Familia / personal', S_('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>')],
  estrella: ['Importante', S_('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>')],
  campana: ['Recordatorio', S_('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>')],
  auto: ['Viaje / vereda', S_('<path d="M5 16l1.5-5h11L19 16M4 16h16v3H4zM7 19v2M17 19v2"/>')],
  sol: ['Día libre', S_('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>')],
};

const LS_THEME = 'scr.planner.theme';
const LS_PEN = 'scr.planner.pen';
const theme = () => { try { return localStorage.getItem(LS_THEME) || 'pizarra'; } catch (e) { return 'pizarra'; } };
let pen = (() => { try { return localStorage.getItem(LS_PEN) || 'amarillo'; } catch (e) { return 'amarillo'; } })();
const penColor = (k) => { const m = MARKERS.find(x => x[0] === k) || MARKERS[2]; return theme() === 'pizarra' ? m[2] : m[3]; };

const DOW = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DOW_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const mondayOf = (d) => { const r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return r; };

const plans = () => live('plans');
const plansOn = (iso) => plans().filter(p => p.date === iso).sort((a, b) => (a.order ?? a.created ?? 0) - (b.order ?? b.created ?? 0));
const weekList = (mon) => plans().filter(p => p.week === mon).sort((a, b) => (a.order ?? a.created ?? 0) - (b.order ?? b.created ?? 0));
const notesOn = (iso) => liveNotes().filter(n => n.fecha === iso);

let events = [];
let state = { month: null, week: null };

/* ---------- Vista ---------- */
export function viewPlanner(arg = '') {
  const today = new Date();
  const m = arg.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  const focus = m ? new Date(+m[1], +m[2] - 1, +(m[3] || 1)) : today;
  state.month = new Date(focus.getFullYear(), focus.getMonth(), 1);
  state.week = mondayOf(m && m[3] ? focus : (focus.getMonth() === today.getMonth() && focus.getFullYear() === today.getFullYear() ? today : focus));
  render();
  loadEvents();
}

function render() {
  const v = $('#view');
  const t = theme();
  const y = state.month.getFullYear(), mo = state.month.getMonth();
  const lit = liturgicalDay(state.week);
  v.innerHTML = `
    <div class="page planner-page">
      <header class="page-head">
        <div><div class="eyebrow">Ciclo ${lit.ciclo} · ${lit.anoFerial}</div><h1 class="display">Planeador</h1></div>
        <div class="head-actions">
          <div class="seg" role="group" aria-label="Estilo">
            <button type="button" data-theme="pizarra" class="${t === 'pizarra' ? 'on' : ''}">Pizarra</button>
            <button type="button" data-theme="papel" class="${t === 'papel' ? 'on' : ''}">Papel</button>
          </div>
          <button type="button" class="btn" id="plPrint">${icon('descargar', 14)}Imprimir semana</button>
        </div>
      </header>

      <div class="board-frame theme-${t}">
        <section class="pl-month" aria-label="Mes">
          <div class="pl-months" role="tablist" aria-label="Meses de ${y}">
            <button type="button" class="pl-yr" data-yr="-1" aria-label="Año anterior">${icon('izq', 14)}</button>
            ${MES_SHORT.map((n, i) => `<button type="button" class="pl-mo${i === mo ? ' on' : ''}" data-mo="${i}" role="tab" aria-selected="${i === mo}">${n}</button>`).join('')}
            <span class="pl-year">${y}</span>
            <button type="button" class="pl-yr" data-yr="1" aria-label="Año siguiente">${icon('der', 14)}</button>
          </div>
          <div class="pl-grid">
            ${DOW_SHORT.map(d => `<div class="pl-dow">${d}</div>`).join('')}
            ${monthCells(y, mo)}
          </div>
        </section>

        <div class="pens" role="radiogroup" aria-label="Color del marcador">
          <span class="pens-label">Marcador</span>
          ${MARKERS.map(([k, label, dark, light]) => `<button type="button" class="pen${k === pen ? ' on' : ''}" data-pen="${k}" role="radio" aria-checked="${k === pen}" aria-label="Marcador ${label}" title="${label}" style="--pen:${t === 'pizarra' ? dark : light}">
            <svg viewBox="0 0 20 60" aria-hidden="true"><rect x="5" y="0" width="10" height="9" rx="2" fill="var(--pen)"/><rect class="pen-body" x="3" y="9" width="14" height="44" rx="3"/><rect x="3" y="44" width="14" height="5" fill="var(--pen)"/><path d="M5 53h10l-2 6H7z" fill="var(--pen)"/></svg>
          </button>`).join('')}
        </div>

        <section class="pl-week" aria-label="Semana">
          <div class="pl-week-head">
            <button type="button" class="pl-nav" id="wkPrev" aria-label="Semana anterior">${icon('izq', 16)}</button>
            <h2 class="pl-week-title">Semana del ${state.week.getDate()} de ${MESES[state.week.getMonth()]}${state.week.getFullYear() !== addDays(state.week, 6).getFullYear() ? ' ' + state.week.getFullYear() : ''}</h2>
            <button type="button" class="pl-nav" id="wkNext" aria-label="Semana siguiente">${icon('der', 16)}</button>
            <button type="button" class="pl-today" id="wkToday">Hoy</button>
          </div>
          <div class="pl-days">
            ${[0, 1, 2, 3, 4, 5, 6].map(i => dayBox(addDays(state.week, i), i)).join('')}
            ${weekBox()}
          </div>
        </section>
      </div>
      <p class="hint center">Escribe en cualquier día con el marcador elegido. Toca lo escrito para cambiarlo, ponerle sticker o moverlo; en el computador también puedes arrastrarlo a otro día.</p>
    </div>`;
  bind();
}

function litBadge(lit, short = false) {
  const show = lit.clave || lit.etiqueta;
  return `<span class="pl-lit" style="--lc:${COLORES[lit.color]}" title="${esc(lit.etiqueta || lit.semana)}"></span>${show && !short ? `<span class="pl-fiesta">${esc(lit.etiqueta)}</span>` : ''}`;
}

function monthCells(y, mo) {
  const first = new Date(y, mo, 1);
  const start = mondayOf(first);
  const todayIso = isoDate();
  const weekIsos = new Set([0, 1, 2, 3, 4, 5, 6].map(i => isoDate(addDays(state.week, i))));
  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i >= 35 && d.getMonth() !== mo) break;
    const iso = isoDate(d);
    const lit = liturgicalDay(d);
    const items = plansOn(iso);
    const evs = gcal.eventsOnDay(events, iso);
    const nts = notesOn(iso);
    const chips = [
      ...evs.map(e => `<span class="mc ev" style="--c:${esc(e.color)}">${esc(e.summary)}</span>`),
      ...items.map(p => `<span class="mc pl${p.done ? ' done' : ''}" style="--c:${penColor(p.color)}">${p.sticker && STICKERS[p.sticker] ? `<i>${STICKERS[p.sticker][1]}</i>` : ''}${esc(p.text)}</span>`),
      ...nts.map(n => `<span class="mc nt">${esc(n.title || 'Nota')}</span>`),
    ];
    out.push(`<button type="button" class="pl-cell${d.getMonth() !== mo ? ' out' : ''}${iso === todayIso ? ' today' : ''}${weekIsos.has(iso) ? ' inweek' : ''}${lit.domingo ? ' sun' : ''}" data-day="${iso}" aria-label="${d.getDate()} de ${MESES[d.getMonth()]}${lit.etiqueta ? ', ' + esc(lit.etiqueta) : ''}${chips.length ? ', ' + chips.length + ' cosas' : ''}">
      <span class="pl-num">${d.getDate()}</span>${litBadge(lit, true)}
      ${lit.clave ? `<span class="pl-fiesta sm">${esc(lit.etiqueta)}</span>` : ''}
      <span class="mc-list">${chips.slice(0, 3).join('')}${chips.length > 3 ? `<span class="mc more">+${chips.length - 3}</span>` : ''}</span>
    </button>`);
  }
  return out.join('');
}

function itemHtml(p) {
  const st = p.sticker && STICKERS[p.sticker];
  return `<li class="pl-item${p.done ? ' done' : ''}" draggable="true" data-id="${p.id}" style="--c:${penColor(p.color)}">
    <button type="button" class="pl-check" data-check="${p.id}" aria-label="${p.done ? 'Desmarcar' : 'Marcar como hecho'}: ${esc(p.text)}" aria-pressed="${!!p.done}"></button>
    <span class="pl-text" role="button" tabindex="0" data-edit="${p.id}" aria-label="Editar: ${esc(p.text)}">${st ? `<i class="pl-sticker" title="${esc(st[0])}">${st[1]}</i>` : ''}<span>${esc(p.text)}</span>${p.time ? `<small>${esc(p.time)}</small>` : ''}</span>
  </li>`;
}

function dayBox(d, i) {
  const iso = isoDate(d);
  const lit = liturgicalDay(d);
  const evs = gcal.eventsOnDay(events, iso);
  const nts = notesOn(iso);
  const items = plansOn(iso);
  return `<section class="pl-day${iso === isoDate() ? ' today' : ''}${lit.domingo ? ' sun' : ''}" data-drop="${iso}" aria-label="${DOW[i]} ${d.getDate()}">
    <header class="pl-day-head"><span class="pl-dname">${DOW[i]}</span><span class="pl-dnum">${d.getDate()}</span>${litBadge(lit)}</header>
    ${lit.clave && evangelioPara(d) ? `<a class="pl-gospel" href="#/lectio/nueva/${iso}" title="Lectio Divina con este Evangelio">${esc(evangelioPara(d))}</a>` : ''}
    <ul class="pl-items">
      ${evs.map((e, k) => `<li class="pl-ev" style="--c:${esc(e.color)}"><button type="button" data-ev="${iso}|${k}"><b>${e.allDay ? 'Todo el día' : gcal.hhmm(e.start)}</b> ${esc(e.summary)}</button></li>`).join('')}
      ${nts.map(n => `<li class="pl-note"><a href="#/nota/${n.id}">${icon('pagina', 13)}${esc(n.title || 'Nota')}</a></li>`).join('')}
      ${items.map(itemHtml).join('')}
    </ul>
    <form class="pl-add" data-add="${iso}"><label class="sr" for="add-${iso}">Escribir en ${DOW[i]}</label><input id="add-${iso}" placeholder="+ escribir" autocomplete="off" enterkeyhint="done"></form>
  </section>`;
}

function weekBox() {
  const mon = isoDate(state.week);
  return `<section class="pl-day pl-list" data-drop="w:${mon}" aria-label="Para esta semana">
    <header class="pl-day-head"><span class="pl-dname">Para esta semana</span></header>
    <ul class="pl-items">${weekList(mon).map(itemHtml).join('')}</ul>
    <form class="pl-add" data-add="w:${mon}"><label class="sr" for="add-w">Agregar a la lista de la semana</label><input id="add-w" placeholder="+ agregar" autocomplete="off" enterkeyhint="done"></form>
  </section>`;
}

/* ---------- Acciones ---------- */
async function addItem(target, text) {
  const now = Date.now();
  const rec = { id: db.uid('p'), type: 'plan', text, color: pen, done: false, created: now, order: now };
  if (target.startsWith('w:')) rec.week = target.slice(2); else rec.date = target;
  await save(rec, { touch: false });
}

async function editItem(id) {
  const p = S.plans.get(id);
  if (!p) return;
  const r = await dialog({
    title: 'Editar',
    body: `<label class="field"><span>Texto</span><input name="text" value="${esc(p.text)}" autocomplete="off"></label>
      <div class="field-row">
        <label class="field"><span>Día</span><input type="date" name="date" value="${esc(p.date || '')}"></label>
        <label class="field"><span>Hora (opcional)</span><input type="time" name="time" value="${esc(p.time || '')}"></label>
      </div>
      <div class="field"><span>Color</span><div class="dlg-pens">${MARKERS.map(([k, label, dark, light]) => `<label class="dlg-pen" title="${label}"><input type="radio" name="color" value="${k}" ${p.color === k ? 'checked' : ''}><span style="--pen:${theme() === 'pizarra' ? dark : light}" aria-label="${label}"></span></label>`).join('')}</div></div>
      <div class="field"><span>Sticker</span><div class="dlg-stickers">
        <label class="dlg-st" title="Sin sticker"><input type="radio" name="sticker" value="" ${!p.sticker ? 'checked' : ''}><span>—</span></label>
        ${Object.entries(STICKERS).map(([k, [label, svg]]) => `<label class="dlg-st" title="${label}"><input type="radio" name="sticker" value="${k}" ${p.sticker === k ? 'checked' : ''}><span aria-label="${label}">${svg}</span></label>`).join('')}
      </div></div>
      ${p.week ? '<p class="hint">Está en «Para esta semana». Ponle un día para pasarlo al calendario.</p>' : ''}`,
    actions: [
      { label: 'Borrar', danger: true, value: 'del' },
      ...(gcal.isReady() && (p.date) ? [{ label: 'Pasar a Google Calendar', value: 'gcal' }] : []),
      { label: 'Cancelar', value: null },
      { label: 'Guardar', primary: true, value: (d) => ({
        text: d.querySelector('[name=text]').value.trim(), date: d.querySelector('[name=date]').value, time: d.querySelector('[name=time]').value,
        color: d.querySelector('[name=color]:checked')?.value || p.color, sticker: d.querySelector('[name=sticker]:checked')?.value || '',
      }) },
    ],
  });
  if (!r) return;
  if (r === 'del') { p.deleted = true; await save(p); toast('Borrado'); return rerender(); }
  if (r === 'gcal') {
    const ev = await eventDialog({ date: p.date, title: p.text, startTime: p.time || '09:00', endTime: p.time ? `${String((+p.time.slice(0, 2) + 1) % 24).padStart(2, '0')}:${p.time.slice(3)}` : '10:00' });
    if (ev?.action === 'saved') { p.deleted = true; await save(p); await loadEvents(true); }
    return;
  }
  if (!r.text) { toast('Escribe algo'); return; }
  Object.assign(p, { text: r.text, time: r.time, color: r.color, sticker: r.sticker });
  if (r.date) { p.date = r.date; delete p.week; }
  await save(p);
  rerender();
}

async function moveItem(id, target) {
  const p = S.plans.get(id);
  if (!p) return;
  if (target.startsWith('w:')) { delete p.date; p.week = target.slice(2); } else { p.date = target; delete p.week; }
  p.order = Date.now();
  await save(p);
  rerender();
}

function rerender() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

async function loadEvents(force = false) {
  if (!gcal.isReady()) return;
  const start = mondayOf(new Date(state.month.getFullYear(), state.month.getMonth(), 1));
  const wkEnd = addDays(state.week, 7);
  let end = addDays(start, 42);
  if (wkEnd > end) end = wkEnd;
  const from = state.week < start ? state.week : start;
  try {
    events = await gcal.listEvents(from, end, { force });
    if ($('.planner-page')) rerender();
  } catch (e) { /* sin conexión: el planeador funciona igual */ }
}

function bind() {
  $$('[data-theme]').forEach(b => b.addEventListener('click', () => { try { localStorage.setItem(LS_THEME, b.dataset.theme); } catch (e) {} rerender(); }));
  $$('[data-pen]').forEach(b => b.addEventListener('click', () => {
    pen = b.dataset.pen; try { localStorage.setItem(LS_PEN, pen); } catch (e) {}
    $$('[data-pen]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
  }));
  $$('[data-mo]').forEach(b => b.addEventListener('click', () => {
    state.month = new Date(state.month.getFullYear(), +b.dataset.mo, 1);
    const today = new Date();
    state.week = mondayOf(state.month.getMonth() === today.getMonth() && state.month.getFullYear() === today.getFullYear() ? today : state.month);
    rerender(); loadEvents();
  }));
  $$('[data-yr]').forEach(b => b.addEventListener('click', () => {
    state.month = new Date(state.month.getFullYear() + +b.dataset.yr, state.month.getMonth(), 1);
    state.week = mondayOf(state.month); rerender(); loadEvents();
  }));
  $$('.pl-cell').forEach(c => c.addEventListener('click', () => {
    state.week = mondayOf(parseISO(c.dataset.day));
    rerender();
    const box = $(`.pl-day[data-drop="${c.dataset.day}"]`);
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => box?.querySelector('input')?.focus({ preventScroll: true }), 350);
  }));
  const goWeek = (n) => {
    state.week = addDays(state.week, n * 7);
    const mid = addDays(state.week, 3);
    if (mid.getMonth() !== state.month.getMonth() || mid.getFullYear() !== state.month.getFullYear()) { state.month = new Date(mid.getFullYear(), mid.getMonth(), 1); loadEvents(); }
    rerender();
  };
  $('#wkPrev').addEventListener('click', () => goWeek(-1));
  $('#wkNext').addEventListener('click', () => goWeek(1));
  $('#wkToday').addEventListener('click', () => { const t = new Date(); state.week = mondayOf(t); state.month = new Date(t.getFullYear(), t.getMonth(), 1); rerender(); loadEvents(); });
  $('#plPrint').addEventListener('click', () => window.print());

  $$('.pl-add').forEach(f => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = f.querySelector('input');
    const text = input.value.trim();
    if (!text) return;
    await addItem(f.dataset.add, text);
    rerender();
    const again = $(`.pl-add[data-add="${f.dataset.add}"] input`);
    again?.focus({ preventScroll: true });
  }));
  $$('[data-check]').forEach(b => b.addEventListener('click', async () => {
    const p = S.plans.get(b.dataset.check); p.done = !p.done; await save(p); rerender();
  }));
  $$('[data-edit]').forEach(b => {
    b.addEventListener('click', () => editItem(b.dataset.edit));
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editItem(b.dataset.edit); } });
  });
  $$('[data-ev]').forEach(b => b.addEventListener('click', async () => {
    const [iso, k] = b.dataset.ev.split('|');
    const ev = gcal.eventsOnDay(events, iso)[+k];
    if (!ev?.canWrite) { if (ev?.htmlLink) window.open(ev.htmlLink, '_blank', 'noopener'); return; }
    const r = await eventDialog({ existing: ev });
    if (r) loadEvents(true);
  }));

  // Arrastrar entre días (computador)
  $$('.pl-item').forEach(li => {
    li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', li.dataset.id); li.classList.add('dragging'); });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
  });
  $$('[data-drop]').forEach(box => {
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('over'); });
    box.addEventListener('dragleave', () => box.classList.remove('over'));
    box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (id && S.plans.has(id)) moveItem(id, box.dataset.drop); });
  });
  page.cleanup = async () => {};
}

/* ---------- Para «Hoy» ---------- */
export function todayPlans() { return plansOn(isoDate()); }
export { refresh };
