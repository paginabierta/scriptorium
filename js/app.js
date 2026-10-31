// Scriptorium — Fase 1
import * as db from './db.js';
import * as drive from './drive.js';
import * as sync from './sync.js';
import { liturgicalDay, COLORES } from './liturgia.js';
import { APP_VERSION } from './config.js';

/* ---------- Estado en memoria ---------- */
const S = { spaces: new Map(), notes: new Map(), settings: null };

const PALETA = ['#7A2E2A', '#8A6A1F', '#2F5D7C', '#4F6B3A', '#9A4E2B', '#5B4A7A', '#6B6257', '#2F6B6B', '#8A3B5C', '#3E4C8A'];

const ESPACIOS_INICIALES = [
  ['Pastoral', '#7A2E2A'], ['Teología', '#8A6A1F'], ['Psicología', '#2F5D7C'], ['Estudio UDI', '#4F6B3A'],
  ['Club de lectura', '#9A4E2B'], ['Formación permanente', '#5B4A7A'], ['Productividad', '#6B6257']
];

/* ---------- Utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stripTags = (s = '') => String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const debounce = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.flush = () => { clearTimeout(t); return fn(); }; return f; };

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
function fechaLarga(d = new Date()) { return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; }
function hace(ts) {
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
  papelera: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  nube: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z"/>',
  arriba: '<path d="M6 15l6-6 6 6"/>',
  abajo: '<path d="M6 9l6 6 6-6"/>',
  pagina: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const icon = (name, size = 16) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;

/* ---------- Datos ---------- */
async function loadAll() {
  const all = await db.getAll();
  S.spaces.clear(); S.notes.clear(); S.settings = null;
  for (const r of all) {
    if (r.type === 'space') S.spaces.set(r.id, r);
    else if (r.type === 'note') S.notes.set(r.id, r);
    else if (r.type === 'settings') S.settings = r;
  }
}

async function seedIfEmpty() {
  if (S.spaces.size || S.notes.size) return;
  const now = Date.now();
  const recs = ESPACIOS_INICIALES.map(([name, color], i) => ({ id: db.uid('s'), type: 'space', name, color, order: i, archived: false, created: now, updated: now }));
  const bienvenida = {
    id: db.uid('n'), type: 'note', spaceId: recs[6].id, parentId: null, title: 'Bienvenido a Scriptorium', tags: ['inicio'],
    created: now, updated: now,
    content: { blocks: [
      { type: 'paragraph', data: { text: 'Este es tu cuaderno. Todo lo que escribas se guarda en este aparato, y cuando conectes tu cuenta de Google, también en tu Drive.' } },
      { type: 'header', data: { text: 'Para empezar', level: 3 } },
      { type: 'checklist', data: { items: [
        { text: 'Revisar mis espacios (lápiz junto a «Espacios»)', checked: false },
        { text: 'Escribir mi primera nota', checked: false },
        { text: 'Conectar Google Drive en Ajustes', checked: false }
      ] } },
      { type: 'quote', data: { text: 'Las casillas sin marcar de cualquier nota aparecen en «Hoy» como pendientes.', caption: '' } }
    ] }
  };
  const settings = { id: 'settings', type: 'settings', userName: '', updated: now };
  await db.putMany([...recs, bienvenida, settings]);
  await loadAll();
}

async function save(rec, { touch = true } = {}) {
  if (touch) rec.updated = Date.now();
  await db.put(rec);
  if (rec.type === 'space') S.spaces.set(rec.id, rec);
  else if (rec.type === 'note') S.notes.set(rec.id, rec);
  else if (rec.type === 'settings') S.settings = rec;
  sync.schedule();
  return rec;
}

const spacesOrdered = (includeArchived = false) =>
  [...S.spaces.values()].filter(s => !s.deleted && (includeArchived || !s.archived)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

const liveNotes = () => [...S.notes.values()].filter(n => !n.deleted);
const notesIn = (spaceId) => liveNotes().filter(n => n.spaceId === spaceId);
const childrenOf = (noteId) => liveNotes().filter(n => n.parentId === noteId).sort((a, b) => (a.created || 0) - (b.created || 0));

function noteText(n) {
  const out = [];
  for (const b of n.content?.blocks || []) {
    const d = b.data || {};
    if (d.text) out.push(stripTags(d.text));
    if (d.caption) out.push(stripTags(d.caption));
    if (Array.isArray(d.items)) {
      const walk = (items) => items.forEach(it => {
        if (typeof it === 'string') out.push(stripTags(it));
        else { out.push(stripTags(it.text || it.content || '')); if (it.items) walk(it.items); }
      });
      walk(d.items);
    }
  }
  return out.join(' ');
}

function pendientes() {
  const res = [];
  for (const n of liveNotes()) {
    const sp = S.spaces.get(n.spaceId);
    if (sp?.archived) continue;
    for (const b of n.content?.blocks || []) {
      if (b.type === 'checklist') (b.data?.items || []).forEach(it => { if (!it.checked && stripTags(it.text)) res.push({ note: n, text: stripTags(it.text) }); });
      if (b.type === 'list' && b.data?.style === 'checklist') {
        const walk = (items) => items.forEach(it => { if (!it.meta?.checked && stripTags(it.content)) res.push({ note: n, text: stripTags(it.content) }); if (it.items) walk(it.items); });
        walk(b.data.items || []);
      }
    }
  }
  return res;
}

function userName() {
  return (S.settings?.userName || '').trim() || drive.account().name.split(' ')[0] || '';
}

/* ---------- Barra lateral ---------- */
function renderSidebar() {
  const route = location.hash || '#/hoy';
  const act = (h) => route === h || route.startsWith(h + '/') ? ' active' : '';
  const sp = spacesOrdered();
  $('#sidebar').innerHTML = `
    <a href="#/hoy" class="brand"><img src="icons/icon.svg" alt="" width="32" height="32"><span>Scriptorium</span></a>
    <form class="search" role="search" id="searchForm">
      ${icon('buscar')}
      <label class="sr" for="searchInput">Buscar</label>
      <input id="searchInput" type="search" placeholder="Buscar en todo…" autocomplete="off" value="${esc(currentQuery())}">
    </form>
    <nav class="nav-group">
      <a href="#/hoy" class="nav-item${act('#/hoy')}">${icon('hoy')}Hoy</a>
    </nav>
    <div class="nav-group">
      <div class="nav-head"><span>Espacios</span>
        <a href="#/espacios" class="icon-btn sm" aria-label="Editar espacios" title="Editar espacios">${icon('lapiz', 15)}</a>
      </div>
      ${sp.map(s => `<a href="#/espacio/${s.id}" class="nav-item${act('#/espacio/' + s.id)}"><span class="dot" style="background:${esc(s.color)}"></span><span class="grow">${esc(s.name)}</span><span class="count">${notesIn(s.id).length || ''}</span></a>`).join('')}
      <a href="#/espacios" class="nav-item muted">${icon('mas', 14)}Nuevo espacio</a>
    </div>
    <div class="nav-group">
      <div class="nav-head"><span>Herramientas</span></div>
      <span class="nav-item disabled">${icon('libro')}<span class="grow">Biblioteca</span><span class="chip">pronto</span></span>
      <span class="nav-item disabled">${icon('lapiz')}<span class="grow">Escritura</span><span class="chip">pronto</span></span>
      <span class="nav-item disabled">${icon('candado')}<span class="grow">Privado</span><span class="chip">pronto</span></span>
      <a href="#/papelera" class="nav-item${act('#/papelera')}">${icon('papelera')}Papelera</a>
      <a href="#/ajustes" class="nav-item${act('#/ajustes')}">${icon('ajustes')}Ajustes</a>
    </div>
    <button type="button" id="syncBtn" class="sync"></button>`;
  renderSyncBtn();
  const input = $('#searchInput');
  const go = debounce(() => { const q = input.value.trim(); location.hash = q ? '#/buscar/' + encodeURIComponent(q) : '#/buscar'; }, 300);
  input.addEventListener('input', go);
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); go.flush(); });
  $('#syncBtn').addEventListener('click', onSyncClick);
}

function currentQuery() {
  const m = (location.hash || '').match(/^#\/buscar\/(.*)$/);
  return m ? decodeURIComponent(m[1]) : '';
}

function renderSyncBtn() {
  const b = $('#syncBtn');
  if (!b) return;
  let cls = 'sync', text;
  if (!drive.isConfigured()) { text = 'Solo en este aparato'; cls += ' muted'; }
  else if (!drive.isConnected()) { text = 'Conectar Google Drive'; cls += ' muted'; }
  else {
    const st = sync.state;
    if (st.status === 'syncing') text = 'Sincronizando…';
    else if (st.status === 'auth') { text = 'Toca para reconectar'; cls += ' warn'; }
    else if (st.status === 'offline') { text = 'Sin conexión · guardado aquí'; cls += ' muted'; }
    else if (st.status === 'error') { text = 'No se pudo sincronizar'; cls += ' warn'; }
    else text = st.lastSync ? `Sincronizado con Drive · ${hace(st.lastSync)}` : 'Conectado a Drive';
  }
  b.className = cls;
  b.innerHTML = `${icon('nube')}<span>${esc(text)}</span>`;
  b.title = sync.state.message || text;
}

async function onSyncClick() {
  if (!drive.isConfigured() || !drive.isConnected()) { location.hash = '#/ajustes'; return; }
  try {
    if (!drive.hasValidToken()) await drive.signIn({ silent: true });
    await runSync();
  } catch (e) { toast(e.message); }
}

async function runSync() {
  const changed = await sync.syncNow();
  if (changed) {
    await loadAll();
    renderSidebar();
    if (!/^#\/nota\//.test(location.hash)) route();
  }
}

/* ---------- Vistas ---------- */
let editor = null;
let pendingSave = null;

async function leaveNote() {
  if (pendingSave) { await pendingSave.flush(); pendingSave = null; }
  if (editor) { try { editor.destroy(); } catch (e) {} editor = null; }
}

async function route() {
  await leaveNote();
  closeMenu();
  const h = location.hash || '#/hoy';
  const [, view, arg] = h.match(/^#\/([^/]*)\/?(.*)$/) || [];
  const el = $('#view');
  el.scrollTop = 0; window.scrollTo(0, 0);
  if (view === 'espacio') viewSpace(arg);
  else if (view === 'nota') viewNote(arg);
  else if (view === 'espacios') viewSpaces();
  else if (view === 'ajustes') viewSettings();
  else if (view === 'buscar') viewSearch(decodeURIComponent(arg || ''));
  else if (view === 'papelera') viewTrash();
  else viewHoy();
  renderSidebar();
  if (view === 'buscar') { const i = $('#searchInput'); if (i && document.activeElement !== i && window.innerWidth > 900) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}

function noteRow(n, { showSpace = true, snippet = '' } = {}) {
  const sp = S.spaces.get(n.spaceId);
  return `<a href="#/nota/${n.id}" class="row">
    <span class="row-main"><span class="row-title">${esc(n.title || 'Sin título')}</span>
    ${snippet ? `<span class="row-snip">${snippet}</span>` : ''}
    ${n.tags?.length ? `<span class="tags">${n.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</span>` : ''}</span>
    <span class="row-meta">${showSpace && sp ? `<span class="dot" style="background:${esc(sp.color)}"></span>${esc(sp.name)} · ` : ''}${hace(n.updated)}</span>
  </a>`;
}

function viewHoy() {
  const now = new Date();
  const lit = liturgicalDay(now);
  const h = now.getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = userName();
  const pend = pendientes().slice(0, 8);
  const recientes = liveNotes().sort((a, b) => b.updated - a.updated).slice(0, 6);
  const colorBorde = lit.color === 'blanco' ? 'border:1.5px solid #B9AC96;' : '';
  $('#view').innerHTML = `
    <div class="page">
      <header class="page-head">
        <div>
          <div class="eyebrow">${esc(fechaLarga(now))}</div>
          <h1 class="display">${saludo}${nombre ? ', ' + esc(nombre) : ''}</h1>
        </div>
        <div class="head-actions">
          <span class="pill"><span class="lit-dot" style="background:${COLORES[lit.color]};${colorBorde}"></span>${esc(lit.etiqueta || lit.semana)}</span>
          <span class="pill">Ciclo ${lit.ciclo} · ${lit.anoFerial}</span>
          <button type="button" class="btn primary" id="newNote">${icon('mas', 14)}Nueva nota</button>
        </div>
      </header>
      <div class="grid">
        <section class="card">
          <h2 class="card-title">Pendientes</h2>
          ${pend.length ? `<ul class="plain">${pend.map(p => `<li><a href="#/nota/${p.note.id}" class="pend"><span class="box" aria-hidden="true"></span><span><span>${esc(p.text)}</span><span class="pend-src">${esc(p.note.title || 'Sin título')}</span></span></a></li>`).join('')}</ul>`
            : `<p class="empty">Nada pendiente. Las casillas sin marcar de tus notas aparecen aquí.</p>`}
        </section>
        <section class="card">
          <h2 class="card-title">Notas recientes</h2>
          ${recientes.length ? `<div class="rows">${recientes.map(n => noteRow(n)).join('')}</div>` : `<p class="empty">Aún no hay notas.</p>`}
        </section>
        <section class="card">
          <h2 class="card-title">Tus espacios</h2>
          <div class="space-grid">
            ${spacesOrdered().map(s => `<a href="#/espacio/${s.id}" class="space-tile"><span class="dot lg" style="background:${esc(s.color)}"></span><span class="grow">${esc(s.name)}</span><span class="count">${notesIn(s.id).length}</span></a>`).join('')}
          </div>
        </section>
      </div>
    </div>`;
  $('#newNote').addEventListener('click', () => createNote(spacesOrdered()[0]?.id));
}

async function createNote(spaceId, parentId = null) {
  if (!spaceId) { toast('Primero crea un espacio'); location.hash = '#/espacios'; return; }
  const now = Date.now();
  const n = { id: db.uid('n'), type: 'note', spaceId, parentId, title: '', tags: [], content: { blocks: [] }, created: now, updated: now };
  await save(n, { touch: false });
  location.hash = '#/nota/' + n.id;
}

function viewSpace(id) {
  const s = S.spaces.get(id);
  if (!s || s.deleted) { $('#view').innerHTML = `<div class="page"><p class="empty">Ese espacio no existe.</p></div>`; return; }
  const all = notesIn(id);
  const tops = all.filter(n => !n.parentId || !S.notes.get(n.parentId) || S.notes.get(n.parentId).deleted).sort((a, b) => b.updated - a.updated);
  const tree = (n, depth) => `<div class="tree-item" style="--depth:${depth}">${noteRow(n, { showSpace: false })}</div>` + childrenOf(n.id).map(c => tree(c, depth + 1)).join('');
  $('#view').innerHTML = `
    <div class="page">
      <header class="page-head">
        <div>
          <div class="eyebrow"><span class="dot" style="background:${esc(s.color)}"></span> Espacio${s.archived ? ' · archivado' : ''}</div>
          <h1 class="display">${esc(s.name)}</h1>
        </div>
        <div class="head-actions">
          <a href="#/espacios" class="btn">${icon('lapiz', 14)}Editar</a>
          <button type="button" class="btn primary" id="newNote">${icon('mas', 14)}Nueva nota</button>
        </div>
      </header>
      <section class="card">
        ${tops.length ? `<div class="rows">${tops.map(n => tree(n, 0)).join('')}</div>` : `<p class="empty">Este espacio está vacío. Crea la primera nota.</p>`}
      </section>
    </div>`;
  $('#newNote').addEventListener('click', () => createNote(id));
}

const EDITOR_I18N = {
  messages: {
    ui: {
      blockTunes: { toggler: { 'Click to tune': 'Opciones', 'or drag to move': 'o arrastra para mover' } },
      inlineToolbar: { converter: { 'Convert to': 'Convertir en' } },
      toolbar: { toolbox: { Add: 'Añadir' } },
      popover: { Filter: 'Buscar', 'Nothing found': 'Nada encontrado', 'Convert to': 'Convertir en' }
    },
    toolNames: { Text: 'Texto', Heading: 'Título', 'Unordered List': 'Lista', 'Ordered List': 'Lista numerada', Checklist: 'Casillas', Quote: 'Cita', Delimiter: 'Separador', Bold: 'Negrita', Italic: 'Cursiva', Link: 'Enlace', List: 'Lista' },
    tools: {
      link: { 'Add a link': 'Pega un enlace' },
      header: { 'Heading 2': 'Título 2', 'Heading 3': 'Título 3', 'Heading 4': 'Título 4' },
      list: { Unordered: 'Con viñetas', Ordered: 'Numerada', Checklist: 'Casillas', 'Start with': 'Empezar en', 'Counter type': 'Tipo de número' },
      quote: { 'Align Left': 'Alinear a la izquierda', 'Align Center': 'Centrar' }
    },
    blockTunes: {
      delete: { Delete: 'Eliminar', 'Click to delete': 'Confirmar' },
      moveUp: { 'Move up': 'Subir' },
      moveDown: { 'Move down': 'Bajar' }
    }
  }
};

function viewNote(id) {
  const n = S.notes.get(id);
  if (!n || n.deleted) { $('#view').innerHTML = `<div class="page"><p class="empty">Esa nota no existe o está en la papelera.</p></div>`; return; }
  const sp = S.spaces.get(n.spaceId);
  const crumbs = [];
  let p = n.parentId ? S.notes.get(n.parentId) : null;
  while (p && crumbs.length < 6) { crumbs.unshift(p); p = p.parentId ? S.notes.get(p.parentId) : null; }
  const kids = childrenOf(n.id);
  $('#view').innerHTML = `
    <article class="page note">
      <nav class="crumbs" aria-label="Ruta">
        ${sp ? `<a href="#/espacio/${sp.id}"><span class="dot" style="background:${esc(sp.color)}"></span>${esc(sp.name)}</a>` : ''}
        ${crumbs.map(c => `<span aria-hidden="true">›</span><a href="#/nota/${c.id}">${esc(c.title || 'Sin título')}</a>`).join('')}
      </nav>
      <label class="sr" for="noteTitle">Título</label>
      <input id="noteTitle" class="note-title" placeholder="Sin título" value="${esc(n.title)}" autocomplete="off">
      <div class="note-meta">
        <label class="meta-field"><span class="sr">Espacio</span>
          <select id="noteSpace">${spacesOrdered(true).map(s => `<option value="${s.id}"${s.id === n.spaceId ? ' selected' : ''}>${esc(s.name)}${s.archived ? ' (archivado)' : ''}</option>`).join('')}</select>
        </label>
        <div class="tag-edit" id="tagEdit"></div>
        <span class="grow"></span>
        <button type="button" class="btn sm" id="addSub">${icon('pagina', 14)}Subpágina</button>
        <button type="button" class="btn sm danger" id="delNote">${icon('papelera', 14)}A la papelera</button>
      </div>
      <div id="editor" class="editor"></div>
      ${kids.length ? `<section class="subpages"><h2 class="card-title">Subpáginas</h2><div class="rows">${kids.map(k => noteRow(k, { showSpace: false })).join('')}</div></section>` : ''}
      <div class="saved" id="savedMark" aria-live="polite"></div>
    </article>`;

  const markSaved = () => { const m = $('#savedMark'); if (m) m.textContent = 'Guardado'; };
  const doSave = async () => {
    const cur = S.notes.get(id);
    if (!cur) return;
    if (editor) {
      try { cur.content = await editor.save(); } catch (e) { /* editor destruido */ }
    }
    cur.title = $('#noteTitle')?.value.trim() ?? cur.title;
    cur.text = noteText(cur).slice(0, 4000);
    await save(cur);
    markSaved();
  };
  pendingSave = debounce(doSave, 700);
  const changed = () => { const m = $('#savedMark'); if (m) m.textContent = 'Guardando…'; pendingSave(); };

  editor = new EditorJS({
    holder: 'editor',
    data: n.content?.blocks?.length ? n.content : { blocks: [] },
    autofocus: !n.title && !n.content?.blocks?.length ? false : false,
    placeholder: 'Escribe aquí… Pulsa Tab para elegir un tipo de bloque',
    i18n: EDITOR_I18N,
    tools: {
      header: { class: Header, inlineToolbar: true, config: { levels: [2, 3, 4], defaultLevel: 2, placeholder: 'Título' } },
      list: { class: EditorjsList, inlineToolbar: true, config: { defaultStyle: 'unordered' } },
      checklist: { class: Checklist, inlineToolbar: true },
      quote: { class: Quote, inlineToolbar: true, config: { quotePlaceholder: 'Cita', captionPlaceholder: 'Fuente' } },
      delimiter: Delimiter,
    },
    onChange: changed,
  });

  const title = $('#noteTitle');
  title.addEventListener('input', changed);
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); editor?.focus?.(); } });
  if (!n.title) setTimeout(() => title.focus(), 50);

  $('#noteSpace').addEventListener('change', async (e) => {
    const cur = S.notes.get(id);
    const moveTree = (noteId, spaceId) => { const x = S.notes.get(noteId); x.spaceId = spaceId; childrenOf(noteId).forEach(c => moveTree(c.id, spaceId)); return x; };
    moveTree(cur.id, e.target.value);
    const ids = [cur.id]; const collect = (nid) => childrenOf(nid).forEach(c => { ids.push(c.id); collect(c.id); }); collect(cur.id);
    for (const nid of ids) await save(S.notes.get(nid));
    renderSidebar();
    toast('Nota movida');
    viewNoteCrumbs(id);
  });

  renderTagEditor(id);
  $('#addSub').addEventListener('click', async () => { await pendingSave.flush(); createNote(n.spaceId, n.id); });
  $('#delNote').addEventListener('click', async () => {
    const kidsCount = childrenOf(id).length;
    if (!confirm(kidsCount ? `¿Enviar esta nota y sus ${kidsCount} subpáginas a la papelera?` : '¿Enviar esta nota a la papelera?')) return;
    await pendingSave.flush();
    const trashTree = async (nid) => { const x = S.notes.get(nid); for (const c of childrenOf(nid)) await trashTree(c.id); x.deleted = true; x.deletedAt = Date.now(); await save(x); };
    await trashTree(id);
    pendingSave = null;
    toast('Enviada a la papelera');
    location.hash = sp ? '#/espacio/' + sp.id : '#/hoy';
  });
}

function viewNoteCrumbs(id) {
  const n = S.notes.get(id); const sp = S.spaces.get(n.spaceId);
  const first = $('.crumbs a');
  if (first && sp && !n.parentId) first.innerHTML = `<span class="dot" style="background:${esc(sp.color)}"></span>${esc(sp.name)}`;
}

function renderTagEditor(id) {
  const n = S.notes.get(id);
  const box = $('#tagEdit');
  box.innerHTML = `${(n.tags || []).map((t, i) => `<span class="tag">#${esc(t)}<button type="button" data-i="${i}" aria-label="Quitar etiqueta ${esc(t)}">${icon('x', 12)}</button></span>`).join('')}
    <label class="sr" for="tagInput">Añadir etiqueta</label><input id="tagInput" placeholder="+ etiqueta" autocomplete="off">`;
  $$('button[data-i]', box).forEach(b => b.addEventListener('click', async () => {
    n.tags.splice(Number(b.dataset.i), 1); await save(n); renderTagEditor(id); $('#tagInput').focus();
  }));
  const input = $('#tagInput');
  const add = async () => {
    const vals = input.value.split(',').map(v => v.trim().replace(/^#/, '')).filter(Boolean);
    if (!vals.length) return;
    n.tags = [...new Set([...(n.tags || []), ...vals])];
    await save(n); renderTagEditor(id); $('#tagInput').focus();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    if (e.key === 'Backspace' && !input.value && n.tags?.length) { n.tags.pop(); save(n).then(() => { renderTagEditor(id); $('#tagInput').focus(); }); }
  });
  input.addEventListener('blur', add);
}

function viewSpaces() {
  const act = spacesOrdered(false);
  const arch = spacesOrdered(true).filter(s => s.archived);
  const row = (s, i, list) => `
    <div class="space-row" data-id="${s.id}">
      <div class="space-row-main">
        <div class="order-btns">
          <button type="button" class="icon-btn sm" data-act="up" aria-label="Subir ${esc(s.name)}" ${i === 0 ? 'disabled' : ''}>${icon('arriba', 14)}</button>
          <button type="button" class="icon-btn sm" data-act="down" aria-label="Bajar ${esc(s.name)}" ${i === list.length - 1 ? 'disabled' : ''}>${icon('abajo', 14)}</button>
        </div>
        <label class="swatch" style="background:${esc(s.color)}"><span class="sr">Color de ${esc(s.name)}</span><input type="color" value="${esc(s.color)}" list="paleta" data-act="color"></label>
        <label class="sr" for="name-${s.id}">Nombre del espacio</label>
        <input id="name-${s.id}" class="space-name" value="${esc(s.name)}" data-act="name" autocomplete="off">
        <span class="count">${notesIn(s.id).length === 1 ? '1 nota' : notesIn(s.id).length + ' notas'}</span>
      </div>
      <div class="space-row-actions">
        ${s.archived
          ? `<button type="button" class="btn sm" data-act="unarchive">Volver al menú</button>`
          : `<button type="button" class="btn sm" data-act="archive">Archivar</button>`}
        <label class="merge"><span class="sr">Unir ${esc(s.name)} con otro espacio</span>
          <select data-act="merge"><option value="">Unir con…</option>${spacesOrdered(true).filter(o => o.id !== s.id).map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>
        </label>
        ${notesIn(s.id).length === 0 ? `<button type="button" class="btn sm danger" data-act="delete">Eliminar</button>` : ''}
      </div>
    </div>`;
  $('#view').innerHTML = `
    <div class="page narrow">
      <header class="page-head">
        <div>
          <h1 class="display">Tus espacios</h1>
          <p class="lead">Cambia nombres, colores y orden cuando quieras. Las notas se quedan donde están.</p>
        </div>
      </header>
      <datalist id="paleta">${PALETA.map(c => `<option value="${c}"></option>`).join('')}</datalist>
      <section class="card flush">${act.map((s, i) => row(s, i, act)).join('') || '<p class="empty pad">No tienes espacios activos.</p>'}</section>
      <form id="newSpace" class="new-space">
        <label class="sr" for="newSpaceName">Nombre del nuevo espacio</label>
        <input id="newSpaceName" placeholder="Nombre del nuevo espacio" autocomplete="off">
        <button type="submit" class="btn primary">${icon('mas', 14)}Crear espacio</button>
      </form>
      <p class="hint">Archivar saca un espacio del menú sin borrar nada: sus notas siguen apareciendo en el buscador.</p>
      ${arch.length ? `<h2 class="section-title">Archivados</h2><section class="card flush">${arch.map((s, i) => row(s, i, arch)).join('')}</section>` : ''}
    </div>`;

  $$('.space-row').forEach(rowEl => {
    const id = rowEl.dataset.id;
    const s = S.spaces.get(id);
    rowEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const a = btn.dataset.act;
      if (a === 'up' || a === 'down') {
        const list = s.archived ? spacesOrdered(true).filter(x => x.archived) : spacesOrdered();
        const i = list.findIndex(x => x.id === id);
        const j = a === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        for (let k = 0; k < list.length; k++) if (list[k].order !== k) { list[k].order = k; await save(list[k]); }
      }
      if (a === 'archive') { s.archived = true; await save(s); toast(`«${s.name}» archivado`); }
      if (a === 'unarchive') { s.archived = false; s.order = spacesOrdered().length; await save(s); toast(`«${s.name}» volvió al menú`); }
      if (a === 'delete') { if (!confirm(`¿Eliminar el espacio «${s.name}»?`)) return; s.deleted = true; await save(s); }
      viewSpaces(); renderSidebar();
    });
    $('input[data-act="name"]', rowEl).addEventListener('change', async (e) => {
      const v = e.target.value.trim();
      if (!v) { e.target.value = s.name; return; }
      s.name = v; await save(s); renderSidebar(); toast('Nombre actualizado');
    });
    $('input[data-act="color"]', rowEl).addEventListener('input', async (e) => {
      s.color = e.target.value; e.target.parentElement.style.background = s.color; await save(s); renderSidebar();
    });
    $('select[data-act="merge"]', rowEl).addEventListener('change', async (e) => {
      const target = S.spaces.get(e.target.value);
      if (!target) return;
      const count = notesIn(id).length;
      if (!confirm(`¿Pasar las ${count} notas de «${s.name}» a «${target.name}» y archivar «${s.name}»?`)) { e.target.value = ''; return; }
      for (const n of notesIn(id)) { n.spaceId = target.id; await save(n); }
      s.archived = true; await save(s);
      toast(`Unido con «${target.name}»`);
      viewSpaces(); renderSidebar();
    });
  });

  $('#newSpace').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#newSpaceName').value.trim();
    if (!name) return;
    const used = new Set(spacesOrdered(true).map(s => s.color));
    const color = PALETA.find(c => !used.has(c)) || PALETA[spacesOrdered(true).length % PALETA.length];
    const now = Date.now();
    await save({ id: db.uid('s'), type: 'space', name, color, order: spacesOrdered().length, archived: false, created: now, updated: now }, { touch: false });
    toast(`Espacio «${name}» creado`);
    viewSpaces(); renderSidebar();
    $('#newSpaceName').focus();
  });
}

function viewSearch(q) {
  const ql = q.toLowerCase().trim();
  let html;
  if (!ql) html = `<p class="empty">Escribe en el buscador para encontrar notas por título, texto o etiqueta.</p>`;
  else {
    const terms = ql.split(/\s+/);
    const res = liveNotes().map(n => {
      const text = (n.text || noteText(n));
      const hay = `${n.title} ${text} ${(n.tags || []).join(' ')}`.toLowerCase();
      if (!terms.every(t => hay.includes(t.replace(/^#/, '')))) return null;
      const score = (n.title || '').toLowerCase().includes(ql) ? 2 : 1;
      const pos = text.toLowerCase().indexOf(terms[0]);
      let snip = '';
      if (pos >= 0) {
        const start = Math.max(0, pos - 50);
        const raw = (start ? '…' : '') + text.slice(start, pos + 110) + '…';
        snip = esc(raw).replace(new RegExp(terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi'), m => `<mark>${m}</mark>`);
      }
      return { n, score, snip };
    }).filter(Boolean).sort((a, b) => b.score - a.score || b.n.updated - a.n.updated);
    html = res.length ? `<div class="rows">${res.map(r => noteRow(r.n, { snippet: r.snip })).join('')}</div>` : `<p class="empty">No encontré nada con «${esc(q)}».</p>`;
  }
  $('#view').innerHTML = `
    <div class="page narrow">
      <header class="page-head"><div><h1 class="display">Buscar</h1>${ql ? `<p class="lead">Resultados para «${esc(q)}»</p>` : ''}</div></header>
      <div class="mobile-only search big">
        ${icon('buscar')}<label class="sr" for="mSearch">Buscar</label>
        <input id="mSearch" type="search" placeholder="Buscar en todo…" value="${esc(q)}" autocomplete="off">
      </div>
      <section class="card">${html}</section>
    </div>`;
  const m = $('#mSearch');
  m.addEventListener('input', debounce(() => { history.replaceState(null, '', m.value.trim() ? '#/buscar/' + encodeURIComponent(m.value.trim()) : '#/buscar'); viewSearchResultsOnly(m.value); }, 300));
  if (window.innerWidth <= 900) { m.focus(); m.setSelectionRange(m.value.length, m.value.length); }
}

function viewSearchResultsOnly(q) {
  const card = $('#view .card');
  viewSearch(q);
  const m = $('#mSearch'); if (m) { m.focus(); m.setSelectionRange(m.value.length, m.value.length); }
  return card;
}

function viewTrash() {
  const del = [...S.notes.values()].filter(n => n.deleted && !n.purged).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  $('#view').innerHTML = `
    <div class="page narrow">
      <header class="page-head">
        <div><h1 class="display">Papelera</h1><p class="lead">Las notas que envías aquí se pueden recuperar.</p></div>
        ${del.length ? `<div class="head-actions"><button type="button" class="btn danger" id="emptyTrash">Vaciar papelera</button></div>` : ''}
      </header>
      <section class="card">
        ${del.length ? `<div class="rows">${del.map(n => `<div class="row static"><span class="row-main"><span class="row-title">${esc(n.title || 'Sin título')}</span><span class="row-meta">${esc(S.spaces.get(n.spaceId)?.name || '')} · eliminada ${hace(n.deletedAt)}</span></span><button type="button" class="btn sm" data-restore="${n.id}">Restaurar</button></div>`).join('')}</div>`
          : `<p class="empty">La papelera está vacía.</p>`}
      </section>
    </div>`;
  $$('[data-restore]').forEach(b => b.addEventListener('click', async () => {
    const n = S.notes.get(b.dataset.restore);
    n.deleted = false; delete n.deletedAt;
    if (n.parentId && S.notes.get(n.parentId)?.deleted) n.parentId = null;
    if (!S.spaces.get(n.spaceId) || S.spaces.get(n.spaceId).deleted) n.spaceId = spacesOrdered()[0]?.id;
    await save(n); toast('Nota restaurada'); viewTrash(); renderSidebar();
  }));
  $('#emptyTrash')?.addEventListener('click', async () => {
    if (!confirm('¿Borrar para siempre las notas de la papelera? Esto no se puede deshacer.')) return;
    for (const n of del) { await save({ id: n.id, type: 'note', deleted: true, purged: true, spaceId: n.spaceId, title: '', content: { blocks: [] }, tags: [] }); }
    toast('Papelera vaciada'); viewTrash();
  });
}

function viewSettings() {
  const acc = drive.account();
  const conf = drive.isConfigured();
  const con = drive.isConnected();
  $('#view').innerHTML = `
    <div class="page narrow">
      <header class="page-head"><div><h1 class="display">Ajustes</h1></div></header>

      <section class="card">
        <h2 class="card-title">Tu nombre</h2>
        <p class="hint">Así te saluda la app en «Hoy». Déjalo vacío si no quieres saludo con nombre.</p>
        <form id="nameForm" class="inline-form">
          <label class="sr" for="userName">Tu nombre</label>
          <input id="userName" value="${esc(S.settings?.userName || '')}" placeholder="Por ejemplo: padre Herwin" autocomplete="off">
          <button type="submit" class="btn">Guardar</button>
        </form>
      </section>

      <section class="card">
        <h2 class="card-title">Google Drive</h2>
        ${!conf ? `<p class="hint">Todavía falta el ID de cliente de Google en el archivo <code>js/config.js</code>. Mientras tanto, todo se guarda en este aparato.</p>`
          : con ? `<p>Conectado como <strong>${esc(acc.email || acc.name || 'tu cuenta')}</strong>.</p>
              <p class="hint">Tus notas se guardan en la carpeta «Scriptorium» de tu Drive. ${sync.state.lastSync ? 'Última sincronización: ' + hace(sync.state.lastSync) + '.' : ''}</p>
              <div class="btn-row"><button type="button" class="btn primary" id="syncNow">Sincronizar ahora</button><button type="button" class="btn" id="disconnect">Desconectar</button></div>`
          : `<p class="hint">Conecta tu cuenta para tener tus notas en el computador, la tablet y el teléfono. La app solo puede ver los archivos que ella misma crea en tu Drive.</p>
             <div class="btn-row"><button type="button" class="btn primary" id="connect">Conectar con Google</button></div>`}
      </section>

      <section class="card">
        <h2 class="card-title">Copia de seguridad</h2>
        <p class="hint">Descarga todo en un archivo, o recupéralo desde una copia anterior.</p>
        <div class="btn-row">
          <button type="button" class="btn" id="exportBtn">Descargar copia</button>
          <label class="btn">Cargar copia<input type="file" id="importFile" accept="application/json,.json" hidden></label>
        </div>
      </section>

      <p class="hint center">Scriptorium ${APP_VERSION}</p>
    </div>`;

  $('#nameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = S.settings || { id: 'settings', type: 'settings' };
    st.userName = $('#userName').value.trim();
    await save(st); toast('Guardado');
  });
  $('#connect')?.addEventListener('click', async () => {
    try { await drive.signIn(); toast('Conectado con Google'); await runSync(); viewSettings(); renderSidebar(); }
    catch (e) { toast(e.message); }
  });
  $('#syncNow')?.addEventListener('click', async () => {
    try { if (!drive.hasValidToken()) await drive.signIn({ silent: true }); await runSync(); toast(sync.state.status === 'ok' ? 'Sincronizado' : sync.state.message); viewSettings(); }
    catch (e) { toast(e.message); }
  });
  $('#disconnect')?.addEventListener('click', () => {
    if (!confirm('¿Desconectar Google Drive? Tus notas siguen en este aparato y en tu Drive.')) return;
    drive.signOut(); sync.resetSyncState(); viewSettings(); renderSidebar();
  });
  $('#exportBtn').addEventListener('click', async () => {
    const data = { app: 'Scriptorium', version: 1, savedAt: Date.now(), records: await db.getAll() };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `scriptorium-copia-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.records)) throw new Error('El archivo no es una copia de Scriptorium');
      if (!confirm(`La copia tiene ${data.records.length} registros. Se unirán con lo que ya tienes (gana lo más reciente). ¿Continuar?`)) return;
      const { merged } = sync.merge(await db.getAll(), data.records, Infinity);
      await db.putMany(merged);
      await loadAll(); sync.schedule(500);
      toast('Copia cargada'); renderSidebar();
    } catch (err) { toast(err.message); }
  });
}

/* ---------- Menú en el teléfono ---------- */
function openMenu() { document.body.classList.add('menu-open'); $('#scrim').hidden = false; }
function closeMenu() { document.body.classList.remove('menu-open'); $('#scrim').hidden = true; }

/* ---------- Arranque ---------- */
async function start() {
  await loadAll();
  await seedIfEmpty();
  $('#menuBtn').addEventListener('click', openMenu);
  $('#scrim').addEventListener('click', closeMenu);
  $('#sidebar').addEventListener('click', e => { if (e.target.closest('a.nav-item, a.brand')) closeMenu(); });
  window.addEventListener('hashchange', route);
  sync.onChange(renderSyncBtn);
  await route();

  window.addEventListener('online', () => runSync());
  window.addEventListener('offline', () => renderSyncBtn());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') runSync();
    else if (pendingSave) pendingSave.flush();
  });
  window.addEventListener('pagehide', () => { if (pendingSave) pendingSave.flush(); });
  setInterval(() => { renderSyncBtn(); runSync(); }, 3 * 60 * 1000);
  runSync();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
