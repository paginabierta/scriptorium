// Scriptorium — arranque, menú y navegación.
import * as db from './db.js';
import * as drive from './drive.js';
import * as sync from './sync.js';
import {
  S, page, $, esc, debounce, toast, hace, icon, save, settings, loadAll, spacesOrdered, notesIn, live, leavePage, onRefresh,
} from './core.js';
import { DEFAULT_TEMPLATES } from './templates.js';
import { viewSpace, viewNote, viewSpaces, viewSearch, viewTrash, viewTemplates } from './views/notes.js';
import { viewHoy } from './views/hoy.js';
import { viewCalendar } from './views/calendar.js';
import { viewReview, dueNotes } from './views/review.js';
import { viewLibrary, viewReader, syncBooks } from './views/library.js';
import { viewWriting } from './views/writing.js';
import { viewPrivado, isUnlocked } from './views/privado.js';
import { viewSettings } from './views/settings.js';

const ESPACIOS_INICIALES = [
  ['Pastoral', '#7A2E2A'], ['Teología', '#8A6A1F'], ['Psicología', '#2F5D7C'], ['Estudio UDI', '#4F6B3A'],
  ['Club de lectura', '#9A4E2B'], ['Formación permanente', '#5B4A7A'], ['Productividad', '#6B6257'],
];

/* ---------- Primer uso y actualizaciones ---------- */
async function seed() {
  const now = Date.now();
  const st = settings();
  const recs = [];
  if (!S.spaces.size && !S.notes.size) {
    const spaces = ESPACIOS_INICIALES.map(([name, color], i) => ({ id: db.uid('s'), type: 'space', name, color, order: i, archived: false, created: now, updated: now }));
    recs.push(...spaces);
    recs.push({
      id: db.uid('n'), type: 'note', spaceId: spaces[6].id, parentId: null, title: 'Bienvenido a Scriptorium', tags: ['inicio'],
      created: now, updated: now,
      content: { blocks: [
        { type: 'paragraph', data: { text: 'Este es tu cuaderno. Todo se guarda en este aparato y, con Google conectado, también en tu Drive.' } },
        { type: 'header', data: { text: 'Para empezar', level: 3 } },
        { type: 'checklist', data: { items: [
          { text: 'Revisar mis espacios (lápiz junto a «Espacios»)', checked: false },
          { text: 'Crear una nota con la plantilla de homilía', checked: false },
          { text: 'Conectar Google Drive en Ajustes', checked: false },
        ] } },
        { type: 'quote', data: { text: 'Las casillas sin marcar de cualquier nota aparecen en «Hoy» como pendientes.', caption: '' } },
      ] },
    });
  }
  if (!st.seededTemplates) {
    if (!live('templates').length) DEFAULT_TEMPLATES.forEach((t, i) => recs.push({ id: db.uid('t'), type: 'template', name: t.name, content: { blocks: t.blocks }, order: i, builtin: t.key, created: now, updated: now }));
    st.seededTemplates = true; st.updated = now; recs.push(st);
  }
  if (recs.length) { await db.putMany(recs); await loadAll(); }
}

/* ---------- Barra lateral ---------- */
function currentQuery() {
  const m = (location.hash || '').match(/^#\/buscar\/(.*)$/);
  return m ? decodeURIComponent(m[1]) : '';
}

function renderSidebar() {
  const route = location.hash || '#/hoy';
  const act = (h) => route === h || route.startsWith(h + '/') ? ' active' : '';
  const due = dueNotes().length;
  $('#sidebar').innerHTML = `
    <a href="#/hoy" class="brand"><img src="icons/icon.svg" alt="" width="32" height="32"><span>Scriptorium</span></a>
    <form class="search" role="search" id="searchForm">
      ${icon('buscar')}
      <label class="sr" for="searchInput">Buscar</label>
      <input id="searchInput" type="search" placeholder="Buscar en todo…" autocomplete="off" value="${esc(currentQuery())}">
    </form>
    <nav class="nav-group" aria-label="Principal">
      <a href="#/hoy" class="nav-item${act('#/hoy')}">${icon('hoy')}Hoy</a>
      <a href="#/calendario" class="nav-item${act('#/calendario')}">${icon('calendario')}Calendario</a>
      <a href="#/repaso" class="nav-item${act('#/repaso')}">${icon('repaso')}<span class="grow">Repaso</span>${due ? `<span class="badge">${due}</span>` : ''}</a>
    </nav>
    <div class="nav-group">
      <div class="nav-head"><span>Espacios</span>
        <a href="#/espacios" class="icon-btn sm" aria-label="Editar espacios" title="Editar espacios">${icon('lapiz', 15)}</a>
      </div>
      ${spacesOrdered().map(s => `<a href="#/espacio/${s.id}" class="nav-item${act('#/espacio/' + s.id)}"><span class="dot" style="background:${esc(s.color)}"></span><span class="grow">${esc(s.name)}</span><span class="count">${notesIn(s.id).length || ''}</span></a>`).join('')}
      <a href="#/espacios" class="nav-item muted">${icon('mas', 14)}Nuevo espacio</a>
    </div>
    <div class="nav-group">
      <div class="nav-head"><span>Herramientas</span></div>
      <a href="#/biblioteca" class="nav-item${act('#/biblioteca')}${act('#/leer')}">${icon('libro')}<span class="grow">Biblioteca</span><span class="count">${live('books').length || ''}</span></a>
      <a href="#/escritura" class="nav-item${act('#/escritura')}">${icon('pluma')}Escritura</a>
      <a href="#/privado" class="nav-item${act('#/privado')}">${icon(isUnlocked() ? 'abierto' : 'candado')}Privado</a>
      <a href="#/plantillas" class="nav-item${act('#/plantillas')}">${icon('plantilla')}Plantillas</a>
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
  syncBooks();
  if (changed) {
    await loadAll();
    renderSidebar();
    if (!/^#\/(nota|escritura\/[^/]+\/|privado\/|leer|plantillas\/)/.test(location.hash)) route();
  }
}

/* ---------- Navegación ---------- */
let routing = Promise.resolve();
function route() { routing = routing.then(doRoute).catch(e => console.error(e)); return routing; }

async function doRoute() {
  await leavePage();
  closeMenu();
  const h = location.hash || '#/hoy';
  const [, view, arg = ''] = h.match(/^#\/([^/]*)\/?(.*)$/) || [];
  window.scrollTo(0, 0);
  switch (view) {
    case 'espacio': viewSpace(arg); break;
    case 'nota': viewNote(arg); break;
    case 'espacios': viewSpaces(); break;
    case 'buscar': viewSearch(decodeURIComponent(arg)); break;
    case 'papelera': viewTrash(); break;
    case 'plantillas': viewTemplates(arg); break;
    case 'calendario': viewCalendar(arg); break;
    case 'repaso': viewReview(); break;
    case 'biblioteca': viewLibrary(arg); break;
    case 'leer': await viewReader(arg); break;
    case 'escritura': viewWriting(arg); break;
    case 'privado': viewPrivado(arg); break;
    case 'ajustes': viewSettings({ runSync }); break;
    default: viewHoy();
  }
  renderSidebar();
  if (view === 'buscar') { const i = $('#searchInput'); if (i && window.innerWidth > 900) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}

function openMenu() { document.body.classList.add('menu-open'); $('#scrim').hidden = false; }
function closeMenu() { document.body.classList.remove('menu-open'); $('#scrim').hidden = true; }

/* ---------- Arranque ---------- */
async function start() {
  await loadAll();
  await seed();
  $('#menuBtn').addEventListener('click', openMenu);
  $('#scrim').addEventListener('click', closeMenu);
  $('#sidebar').addEventListener('click', e => { if (e.target.closest('a.nav-item, a.brand')) closeMenu(); });
  window.addEventListener('hashchange', route);
  sync.onChange(renderSyncBtn);
  onRefresh(() => renderSidebar());
  await route();

  window.addEventListener('online', () => runSync());
  window.addEventListener('offline', () => renderSyncBtn());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runSync(); else page.flush?.(); });
  window.addEventListener('pagehide', () => page.flush?.());
  setInterval(() => { renderSyncBtn(); runSync(); }, 3 * 60 * 1000);
  runSync();

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
