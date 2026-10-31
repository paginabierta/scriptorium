// Núcleo compartido: estado en memoria, guardado, utilidades de interfaz.
import * as db from './db.js';
import * as sync from './sync.js';

export const S = {
  spaces: new Map(), notes: new Map(), templates: new Map(), books: new Map(),
  projects: new Map(), chapters: new Map(), cards: new Map(), secrets: new Map(),
  settings: null,
};

const BUCKET = { space: 'spaces', note: 'notes', template: 'templates', book: 'books', project: 'projects', chapter: 'chapters', card: 'cards', secret: 'secrets' };

export const PALETA = ['#7A2E2A', '#8A6A1F', '#2F5D7C', '#4F6B3A', '#9A4E2B', '#5B4A7A', '#6B6257', '#2F6B6B', '#8A3B5C', '#3E4C8A'];

/* ---------- Utilidades ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const stripTags = (s = '') => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
export const debounce = (fn, ms) => {
  let t, args;
  const f = (...a) => { args = a; clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); };
  f.flush = () => { if (t) { clearTimeout(t); t = null; return fn(...(args || [])); } };
  f.cancel = () => { clearTimeout(t); t = null; };
  return f;
};
export const wordCount = (s = '') => (String(s).match(/[\p{L}\p{N}'’-]+/gu) || []).length;

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2800);
}

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export function fechaLarga(d = new Date()) { return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; }
export function fechaCorta(d) { return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; }
export function isoDate(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function parseISO(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
export function hace(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  const d = new Date(ts);
  if (s < 7 * 86400) return DIAS[d.getDay()].toLowerCase();
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
}

const ICON = {
  hoy: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  lapiz: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  libro: '<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M8 7h7"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  abierto: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  papelera: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  nube: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z"/>',
  arriba: '<path d="M6 15l6-6 6 6"/>',
  abajo: '<path d="M6 9l6 6 6-6"/>',
  izq: '<path d="M15 6l-6 6 6 6"/>',
  der: '<path d="M9 6l6 6-6 6"/>',
  pagina: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  repaso: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
  plantilla: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  pluma: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  tablero: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  descargar: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  enlace: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  indice: '<path d="M4 6h16M4 12h10M4 18h13"/>',
  texto: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
  marca: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  expandir: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
export const icon = (name, size = 16) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ''}</svg>`;

/* ---------- Datos ---------- */
export async function loadAll() {
  const all = await db.getAll();
  Object.values(BUCKET).forEach(b => S[b].clear());
  S.settings = null;
  for (const r of all) {
    if (r.type === 'settings') S.settings = r;
    else if (BUCKET[r.type]) S[BUCKET[r.type]].set(r.id, r);
  }
}

export async function save(rec, { touch = true } = {}) {
  if (touch) rec.updated = Date.now();
  await db.put(rec);
  if (rec.type === 'settings') S.settings = rec;
  else if (BUCKET[rec.type]) S[BUCKET[rec.type]].set(rec.id, rec);
  sync.schedule();
  return rec;
}

export function settings() {
  if (!S.settings) S.settings = { id: 'settings', type: 'settings', userName: '', apaConnector: 'y', updated: 0 };
  return S.settings;
}

export const live = (bucket) => [...S[bucket].values()].filter(r => !r.deleted);
export const spacesOrdered = (includeArchived = false) =>
  live('spaces').filter(s => includeArchived || !s.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const liveNotes = () => live('notes');
export const notesIn = (spaceId) => liveNotes().filter(n => n.spaceId === spaceId);
export const childrenOf = (noteId) => liveNotes().filter(n => n.parentId === noteId).sort((a, b) => (a.created || 0) - (b.created || 0));
export function findSpaceByName(...names) {
  const sp = spacesOrdered();
  for (const n of names) { const f = sp.find(s => s.name.toLowerCase().includes(n)); if (f) return f; }
  return sp[0];
}

/* ---------- Diálogos ---------- */
// dialog({ title, body (html), actions: [{label, value, primary, danger}], onOpen(el) }) → Promise<value|null>
export function dialog({ title, body = '', actions = [{ label: 'Cerrar', value: null }], onOpen, wide = false }) {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.className = 'modal' + (wide ? ' wide' : '');
    d.innerHTML = `<form method="dialog" class="modal-inner">
      <header class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn sm" data-close aria-label="Cerrar">${icon('x', 16)}</button></header>
      <div class="modal-body">${body}</div>
      <footer class="modal-foot">${actions.map((a, i) => `<button type="${a.primary ? 'submit' : 'button'}" class="btn${a.primary ? ' primary' : ''}${a.danger ? ' danger' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</footer>
    </form>`;
    document.body.appendChild(d);
    let done = false;
    const finish = (v) => { if (done) return; done = true; d.close(); d.remove(); resolve(v); };
    d.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      const a = actions[Number(b.dataset.i)];
      const v = typeof a.value === 'function' ? a.value(d) : a.value;
      if (typeof a.value === 'function' && v === false) return;   // validación fallida: no cerrar
      finish(v);
    }));
    d.querySelector('[data-close]').addEventListener('click', () => finish(null));
    d.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const i = actions.findIndex(a => a.primary);
      if (i >= 0) d.querySelector(`[data-i="${i}"]`).click();
    });
    d.showModal();
    onOpen?.(d);
  });
}

export async function askText(title, { label = '', value = '', placeholder = '', okLabel = 'Aceptar' } = {}) {
  return dialog({
    title,
    body: `<label class="field"><span>${esc(label)}</span><input name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></label>`,
    actions: [{ label: 'Cancelar', value: null }, { label: okLabel, primary: true, value: (d) => d.querySelector('[name=v]').value.trim() || false }],
    onOpen: (d) => { const i = d.querySelector('[name=v]'); i.focus(); i.select(); },
  });
}

export async function confirmDialog(title, text, { okLabel = 'Aceptar', danger = false } = {}) {
  const v = await dialog({ title, body: `<p>${esc(text)}</p>`, actions: [{ label: 'Cancelar', value: false }, { label: okLabel, value: true, primary: true, danger }] });
  return v === true;
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function safeFilename(s) {
  return (s || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'documento';
}

// Página actual: cada vista puede dejar una función de limpieza (guardar pendientes, cerrar editor…)
export const page = { cleanup: null, flush: null };
export async function leavePage() {
  const fn = page.cleanup;
  page.cleanup = null;
  page.flush = null;
  document.body.classList.remove('focus-mode', 'reader-mode');
  if (fn) { try { await fn(); } catch (e) { console.error(e); } }
}

// Notifica a la barra lateral (y a quien escuche) que cambiaron datos
const listeners = new Set();
export const onRefresh = (fn) => listeners.add(fn);
export const refresh = () => listeners.forEach(fn => fn());
