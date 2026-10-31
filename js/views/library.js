// Biblioteca y lector de EPUB, con subrayados que se convierten en notas.
import * as db from '../db.js';
import * as drive from '../drive.js';
import {
  S, $, $$, esc, icon, save, toast, live, page, dialog, confirmDialog, findSpaceByName, refresh, hace, debounce,
} from '../core.js';
import { createNote } from './notes.js';

/* ---------- Archivos: local + Drive ---------- */
export async function syncBooks() {
  if (!drive.isConnected() || !drive.hasValidToken() || !navigator.onLine) return;
  for (const b of live('books')) {
    if (b.driveId || !b.pendingUpload) continue;
    const blob = await db.getFile(b.id);
    if (!blob) continue;
    try {
      b.driveId = await drive.uploadFile(`${b.title || 'libro'}.epub`, blob);
      delete b.pendingUpload;
      await save(b);
    } catch (e) { /* se reintenta en la próxima sincronización */ }
  }
}

async function getBookBlob(b) {
  let blob = await db.getFile(b.id);
  if (blob) return blob;
  if (!b.driveId) throw new Error('Este libro solo está en el aparato donde lo subiste.');
  if (!drive.isConnected()) throw new Error('Conecta Google Drive en Ajustes para descargar este libro.');
  if (!drive.hasValidToken()) await drive.signIn({ silent: true });
  toast('Descargando el libro desde tu Drive…');
  blob = await drive.downloadFile(b.driveId);
  await db.putFile(b.id, blob);
  return blob;
}

async function coverDataUrl(book) {
  try {
    const url = await book.coverUrl();
    if (!url) return '';
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = 240, h = Math.round(img.height * (w / img.width));
    const c = document.createElement('canvas');
    c.width = w; c.height = Math.min(h, 380);
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.72);
  } catch (e) { return ''; }
}

async function importEpub(file) {
  const buf = await file.arrayBuffer();
  let meta = {}, cover = '';
  try {
    const book = ePub(buf);
    meta = await book.loaded.metadata;
    cover = await coverDataUrl(book);
    book.destroy();
  } catch (e) { throw new Error('No pude abrir ese archivo. ¿Es un EPUB sin protección (DRM)?'); }
  const now = Date.now();
  const rec = {
    id: db.uid('b'), type: 'book', title: meta.title || file.name.replace(/\.epub$/i, ''), author: meta.creator || '',
    publisher: meta.publisher || '', year: (meta.pubdate || '').slice(0, 4), cover, size: file.size,
    percent: 0, cfi: '', highlights: [], club: false, created: now, updated: now, pendingUpload: true,
  };
  await db.putFile(rec.id, new Blob([buf], { type: 'application/epub+zip' }));
  await save(rec, { touch: false });
  syncBooks();
  return rec;
}

/* ---------- Biblioteca ---------- */
export function viewLibrary(filter = '') {
  const books = live('books').sort((a, b) => (b.lastOpened || b.created || 0) - (a.lastOpened || a.created || 0));
  const shown = filter === 'club' ? books.filter(b => b.club) : books;
  $('#view').innerHTML = `
    <div class="page">
      <header class="page-head">
        <div><h1 class="display">Biblioteca</h1><p class="lead">Tus libros EPUB, con lo que vas subrayando.</p></div>
        <div class="head-actions">
          <div class="seg" role="group" aria-label="Filtro">
            <a class="${filter !== 'club' ? 'on' : ''}" href="#/biblioteca">Todos</a>
            <a class="${filter === 'club' ? 'on' : ''}" href="#/biblioteca/club">Del club</a>
          </div>
          <label class="btn primary">${icon('mas', 14)}Agregar EPUB<input type="file" id="epubIn" accept=".epub,application/epub+zip" multiple hidden></label>
        </div>
      </header>
      ${!drive.isConnected() ? `<p class="hint">Con Google Drive conectado, los libros quedan en tu Drive y los puedes abrir desde cualquier aparato.</p>` : ''}
      ${shown.length ? `<div class="shelf">${shown.map(b => `
        <article class="book">
          <a href="#/leer/${b.id}" class="book-cover" aria-label="Leer ${esc(b.title)}">
            ${b.cover ? `<img src="${b.cover}" alt="">` : `<span class="book-fake">${esc(b.title)}</span>`}
          </a>
          <div class="book-info">
            <a href="#/leer/${b.id}" class="book-title">${esc(b.title)}</a>
            <span class="book-author">${esc(b.author || '')}</span>
            <div class="bar"><div style="width:${Math.round(b.percent || 0)}%"></div></div>
            <span class="book-meta">${Math.round(b.percent || 0)} %${b.highlights?.length ? ` · ${b.highlights.length} subrayado${b.highlights.length > 1 ? 's' : ''}` : ''}${b.club ? ' · club' : ''}</span>
            <div class="book-actions">
              <button type="button" class="btn sm" data-edit="${b.id}">Datos</button>
              <button type="button" class="btn sm" data-club="${b.id}">${b.club ? 'Quitar del club' : 'Libro del club'}</button>
              <button type="button" class="icon-btn sm" data-del="${b.id}" aria-label="Eliminar ${esc(b.title)}">${icon('papelera', 15)}</button>
            </div>
          </div>
        </article>`).join('')}</div>`
      : `<section class="card"><p class="empty">${filter === 'club' ? 'Ningún libro marcado como libro del club.' : 'Aún no hay libros. Agrega un archivo EPUB sin protección (DRM).'}</p></section>`}
    </div>`;

  $('#epubIn').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    for (const f of files) {
      try { const r = await importEpub(f); toast(`«${r.title}» agregado`); }
      catch (err) { toast(err.message); }
    }
    viewLibrary(filter); refresh();
  });
  $$('[data-club]').forEach(btn => btn.addEventListener('click', async () => {
    const b = S.books.get(btn.dataset.club); b.club = !b.club; await save(b); viewLibrary(filter);
  }));
  $$('[data-edit]').forEach(btn => btn.addEventListener('click', () => editBook(S.books.get(btn.dataset.edit)).then(() => viewLibrary(filter))));
  $$('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
    const b = S.books.get(btn.dataset.del);
    if (!await confirmDialog('Eliminar libro', `¿Quitar «${b.title}» de tu biblioteca? Se borran también sus subrayados (las notas que ya creaste se quedan).`, { okLabel: 'Eliminar', danger: true })) return;
    if (b.driveId && drive.hasValidToken()) drive.trashFile(b.driveId);
    await db.deleteFile(b.id);
    await save({ id: b.id, type: 'book', deleted: true, title: b.title });
    viewLibrary(filter); refresh();
  }));
}

async function editBook(b) {
  const r = await dialog({
    title: 'Datos del libro',
    body: `<label class="field"><span>Título</span><input name="title" value="${esc(b.title)}"></label>
      <label class="field"><span>Autor (Apellido, Nombres)</span><input name="author" value="${esc(b.author || '')}"></label>
      <div class="field-row"><label class="field"><span>Año</span><input name="year" value="${esc(b.year || '')}"></label>
      <label class="field"><span>Editorial</span><input name="publisher" value="${esc(b.publisher || '')}"></label></div>
      <p class="hint">Estos datos se usan para la referencia APA de la ficha de lectura.</p>`,
    actions: [{ label: 'Cancelar', value: null }, { label: 'Guardar', primary: true, value: (d) => Object.fromEntries(['title', 'author', 'year', 'publisher'].map(k => [k, d.querySelector(`[name=${k}]`).value.trim()])) }],
  });
  if (!r) return;
  Object.assign(b, r);
  await save(b);
}

/* ---------- Lector ---------- */
const THEMES = {
  claro: { body: { background: '#FFFDF8', color: '#1E1B16' } },
  sepia: { body: { background: '#F3E8D2', color: '#3B2F22' } },
  noche: { body: { background: '#1C1A17', color: '#D9D2C5' }, a: { color: '#E0B48A' } },
};
const HL_COLOR = '#E8B84A';

export async function viewReader(id) {
  const b = S.books.get(id);
  const v = $('#view');
  if (!b || b.deleted) { v.innerHTML = `<div class="page"><p class="empty">Ese libro no está en tu biblioteca.</p></div>`; return; }
  document.body.classList.add('reader-mode');
  const prefs = JSON.parse(localStorage.getItem('scr.reader') || '{"theme":"claro","size":105}');
  v.innerHTML = `
    <div class="reader theme-${prefs.theme}">
      <header class="reader-bar">
        <a href="#/biblioteca" class="icon-btn" aria-label="Volver a la biblioteca">${icon('izq', 18)}</a>
        <div class="reader-title"><strong>${esc(b.title)}</strong><span id="rdChapter"></span></div>
        <button type="button" class="icon-btn" id="rdToc" aria-label="Índice">${icon('indice', 18)}</button>
        <button type="button" class="icon-btn" id="rdHl" aria-label="Subrayados">${icon('marca', 18)}</button>
        <button type="button" class="icon-btn" id="rdAa" aria-label="Letra y colores">${icon('texto', 18)}</button>
      </header>
      <div class="reader-stage">
        <button type="button" class="reader-nav prev" id="rdPrev" aria-label="Página anterior">${icon('izq', 22)}</button>
        <div id="rdArea" class="reader-area"><p class="empty center">Abriendo el libro…</p></div>
        <button type="button" class="reader-nav next" id="rdNext" aria-label="Página siguiente">${icon('der', 22)}</button>
      </div>
      <footer class="reader-foot"><div class="bar"><div id="rdBar" style="width:${b.percent || 0}%"></div></div><span id="rdPct">${Math.round(b.percent || 0)} %</span></footer>
      <aside class="reader-panel" id="rdPanel" hidden></aside>
      <div class="sel-bar" id="selBar" hidden>
        <button type="button" class="btn sm primary" id="selHl">Subrayar</button>
        <button type="button" class="btn sm" id="selNote">Subrayar y anotar</button>
        <button type="button" class="icon-btn sm" id="selX" aria-label="Cancelar">${icon('x', 14)}</button>
      </div>
    </div>`;

  let book, rendition, current = null, pendingSel = null;
  try {
    const blob = await getBookBlob(b);
    book = ePub(await blob.arrayBuffer());
  } catch (e) {
    $('#rdArea').innerHTML = `<p class="empty center">${esc(e.message)}</p>`;
    return;
  }
  const area = $('#rdArea');
  area.innerHTML = '';
  rendition = book.renderTo(area, { width: '100%', height: '100%', flow: 'paginated', spread: 'none', allowScriptedContent: false });
  Object.entries(THEMES).forEach(([k, t]) => rendition.themes.register(k, t));
  rendition.themes.select(prefs.theme);
  rendition.themes.fontSize(prefs.size + '%');
  rendition.themes.default({ body: { 'font-family': 'Georgia, "EB Garamond", serif !important', 'line-height': '1.6' }, '::selection': { background: 'rgba(232,184,74,.45)' } });
  await rendition.display(b.cfi || undefined).catch(() => rendition.display());

  const drawHl = (h) => { try { rendition.annotations.highlight(h.cfi, { id: h.id }, () => openHighlight(h.id), 'scr-hl', { fill: HL_COLOR, 'fill-opacity': '0.35', 'mix-blend-mode': 'multiply' }); } catch (e) {} };
  (b.highlights || []).forEach(drawHl);

  // Progreso
  const saveProgress = debounce(async () => { b.lastOpened = Date.now(); await save(b); }, 1500);
  let destroyed = false;
  const locKey = 'loc:' + b.id;
  const cached = await db.getFile(locKey);
  if (cached) book.locations.load(cached);
  else book.ready.then(() => book.locations.generate(1400)).then(() => { if (!destroyed) return db.putFile(locKey, book.locations.save()); }).catch(() => {});
  rendition.on('relocated', (loc) => {
    if (destroyed) return;
    current = loc;
    if (pendingSel) clearSel();
    b.cfi = loc.start.cfi;
    if (book.locations.length()) b.percent = Math.round(book.locations.percentageFromCfi(loc.start.cfi) * 1000) / 10;
    $('#rdBar').style.width = (b.percent || 0) + '%';
    $('#rdPct').textContent = Math.round(b.percent || 0) + ' %';
    let item = null; try { item = book.navigation?.get(loc.start.href); } catch (e) {}
    $('#rdChapter').textContent = item?.label?.trim() || '';
    saveProgress();
  });

  // Selección → subrayar
  let lastHl = '';
  rendition.on('selected', (cfiRange, contents) => {
    const text = contents.window.getSelection()?.toString().trim();
    if (!text || cfiRange === lastHl) return;
    pendingSel = { cfi: cfiRange, text, contents };
    $('#selBar').hidden = false;
  });
  const clearSel = () => { try { pendingSel?.contents.window.getSelection().removeAllRanges(); } catch (e) {} pendingSel = null; $('#selBar').hidden = true; };
  const addHl = async (withNote) => {
    if (!pendingSel) return;
    lastHl = pendingSel.cfi;
    const h = { id: db.uid('h'), cfi: pendingSel.cfi, text: pendingSel.text.slice(0, 2000), note: '', created: Date.now(), chapter: $('#rdChapter').textContent };
    clearSel();
    if (withNote) {
      const note = await dialog({ title: 'Tu anotación', body: `<blockquote class="q-prev">${esc(h.text.slice(0, 300))}${h.text.length > 300 ? '…' : ''}</blockquote><label class="field"><span>Lo que te sugiere</span><textarea name="n" rows="4"></textarea></label>`,
        actions: [{ label: 'Cancelar', value: null }, { label: 'Guardar', primary: true, value: (d) => d.querySelector('[name=n]').value.trim() }], onOpen: (d) => d.querySelector('textarea').focus() });
      if (note === null) return;
      h.note = note;
    }
    b.highlights = [...(b.highlights || []), h];
    await save(b);
    drawHl(h);
    toast('Subrayado guardado');
  };
  $('#selHl').addEventListener('click', () => addHl(false));
  $('#selNote').addEventListener('click', () => addHl(true));
  $('#selX').addEventListener('click', clearSel);

  // Navegación
  const prev = () => rendition.prev(), next = () => rendition.next();
  $('#rdPrev').addEventListener('click', prev);
  $('#rdNext').addEventListener('click', next);
  const keys = (e) => { if (e.target.closest?.('input,textarea,[contenteditable="true"]')) return; if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next(); };
  document.addEventListener('keyup', keys);
  rendition.on('keyup', keys);
  let touchX = null;
  rendition.on('touchstart', (e) => { touchX = e.changedTouches?.[0]?.screenX ?? null; });
  rendition.on('touchend', (e) => {
    if (touchX === null) return;
    const dx = (e.changedTouches?.[0]?.screenX ?? touchX) - touchX;
    if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
    touchX = null;
  });

  // Paneles
  const panel = $('#rdPanel');
  const openPanel = (html) => { panel.innerHTML = `<div class="panel-head"><span></span><button type="button" class="icon-btn sm" id="pClose" aria-label="Cerrar">${icon('x', 16)}</button></div>${html}`; panel.hidden = false; $('#pClose').addEventListener('click', () => { panel.hidden = true; }); };

  $('#rdToc').addEventListener('click', async () => {
    const nav = await book.loaded.navigation;
    const flat = (items, depth = 0) => items.flatMap(i => [{ ...i, depth }, ...flat(i.subitems || [], depth + 1)]);
    openPanel(`<h2 class="card-title">Índice</h2><div class="toc">${flat(nav.toc).map(i => `<button type="button" data-href="${esc(i.href)}" style="padding-left:${12 + i.depth * 14}px">${esc(i.label.trim())}</button>`).join('') || '<p class="empty">Este libro no trae índice.</p>'}</div>`);
    $$('[data-href]', panel).forEach(x => x.addEventListener('click', () => { rendition.display(x.dataset.href); panel.hidden = true; }));
  });

  const renderHlPanel = () => {
    const hs = b.highlights || [];
    openPanel(`<h2 class="card-title">Subrayados</h2>
      ${hs.length ? `<button type="button" class="btn sm primary" id="mkFicha">${icon('pagina', 14)}Crear ficha de lectura</button>
      <div class="hl-list">${hs.map(h => `<article class="hl-item" data-id="${h.id}">
        <blockquote>${esc(h.text)}</blockquote>${h.note ? `<p class="hl-note">${esc(h.note)}</p>` : ''}
        <div class="hl-actions"><span class="muted">${esc(h.chapter || '')}</span><span class="grow"></span>
          <button type="button" class="btn sm" data-go="${h.id}">Ir</button>
          <button type="button" class="icon-btn sm" data-rm="${h.id}" aria-label="Borrar subrayado">${icon('papelera', 14)}</button></div>
      </article>`).join('')}</div>` : '<p class="empty">Selecciona un texto del libro para subrayarlo.</p>'}`);
    $$('[data-go]', panel).forEach(x => x.addEventListener('click', () => { const h = hs.find(y => y.id === x.dataset.go); rendition.display(h.cfi); panel.hidden = true; }));
    $$('[data-rm]', panel).forEach(x => x.addEventListener('click', async () => {
      const h = hs.find(y => y.id === x.dataset.rm);
      try { rendition.annotations.remove(h.cfi, 'highlight'); } catch (e) {}
      b.highlights = hs.filter(y => y.id !== h.id); await save(b); renderHlPanel();
    }));
    $('#mkFicha')?.addEventListener('click', () => fichaDeLectura(b));
  };
  const openHighlight = () => renderHlPanel();
  $('#rdHl').addEventListener('click', renderHlPanel);

  $('#rdAa').addEventListener('click', () => {
    openPanel(`<h2 class="card-title">Lectura</h2>
      <div class="field"><span>Tamaño de letra</span><div class="btn-row"><button type="button" class="btn" id="fMinus">A−</button><span class="pill" id="fSize">${prefs.size} %</span><button type="button" class="btn" id="fPlus">A+</button></div></div>
      <div class="field"><span>Colores</span><div class="btn-row">${Object.keys(THEMES).map(k => `<button type="button" class="btn${prefs.theme === k ? ' primary' : ''}" data-th="${k}">${k.charAt(0).toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>`);
    const setSize = (d) => { prefs.size = Math.max(70, Math.min(180, prefs.size + d)); rendition.themes.fontSize(prefs.size + '%'); $('#fSize').textContent = prefs.size + ' %'; localStorage.setItem('scr.reader', JSON.stringify(prefs)); };
    $('#fMinus').addEventListener('click', () => setSize(-10));
    $('#fPlus').addEventListener('click', () => setSize(10));
    $$('[data-th]', panel).forEach(x => x.addEventListener('click', () => {
      prefs.theme = x.dataset.th; rendition.themes.select(prefs.theme);
      $('.reader').className = 'reader theme-' + prefs.theme;
      localStorage.setItem('scr.reader', JSON.stringify(prefs));
      $$('[data-th]', panel).forEach(y => y.classList.toggle('primary', y === x));
    }));
  });

  page.cleanup = async () => {
    document.removeEventListener('keyup', keys);
    destroyed = true;
    saveProgress.flush();
    try { rendition.destroy(); } catch (e) {}
    try { book.destroy(); } catch (e) {}
  };
}

async function fichaDeLectura(b) {
  const sp = findSpaceByName('club', 'lectura');
  const blocks = [
    { type: 'referencia', data: { tipo: 'libro', autores: b.author || '', anio: b.year || '', titulo: b.title || '', editorial: b.publisher || '' } },
    { type: 'header', data: { text: 'De qué trata', level: 2 } },
    { type: 'paragraph', data: { text: '' } },
    { type: 'header', data: { text: 'Subrayados', level: 2 } },
    ...(b.highlights || []).map(h => ({ type: 'quote', data: { text: esc(h.text), caption: esc([h.chapter, h.note].filter(Boolean).join(' — ')), alignment: 'left' } })),
    { type: 'header', data: { text: 'Lo que me deja', level: 2 } },
    { type: 'paragraph', data: { text: '' } },
  ];
  await createNote({ spaceId: sp?.id, title: `Ficha de lectura · ${b.title}`, blocks, extra: { bookId: b.id } });
}

export function lastBook() {
  return live('books').filter(b => b.lastOpened).sort((a, b) => b.lastOpened - a.lastOpened)[0];
}
export { hace };
