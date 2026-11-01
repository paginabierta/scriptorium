// Biblioteca y lector de EPUB, con subrayados que se convierten en notas.
import * as db from '../db.js';
import * as drive from '../drive.js';
import {
  S, $, $$, esc, icon, save, toast, live, page, dialog, confirmDialog, findSpaceByName, refresh, hace, debounce,
} from '../core.js';
import { createNote } from './notes.js';
import { readEpubMeta, authorDisplay, authorNeedsReview, fillBlocks } from '../bookmeta.js';

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
  let meta = {}, cover = '', full = null;
  try {
    const book = ePub(buf.slice(0));
    meta = await book.loaded.metadata;
    cover = await coverDataUrl(book);
    await book.ready.catch(() => {});
    book.destroy();
  } catch (e) { throw new Error('No pude abrir ese archivo. ¿Es un EPUB sin protección (DRM)?'); }
  try { full = await readEpubMeta(buf.slice(0)); } catch (e) { /* nos quedamos con lo básico */ }
  const now = Date.now();
  const rec = {
    id: db.uid('b'), type: 'book', title: full?.title || meta.title || file.name.replace(/\.epub$/i, ''),
    author: full?.authors?.length ? full.authors.join('\n') : (meta.creator || ''),
    publisher: full?.publisher || meta.publisher || '', year: full?.year || (meta.pubdate || '').slice(0, 4),
    pages: full?.pages || '', isbn: full?.isbn || '', language: full?.language || meta.language || '',
    description: full?.description || '', subjects: full?.subjects || [], edition: '', metaV: 2,
    cover, size: file.size, percent: 0, cfi: '', highlights: [], club: false, created: now, updated: now, pendingUpload: true,
  };
  await db.putFile(rec.id, new Blob([buf], { type: 'application/epub+zip' }));
  await save(rec, { touch: false });
  syncBooks();
  return rec;
}

// Libros importados antes: completar los datos que falten leyendo su archivo
async function backfillMeta() {
  let changed = false;
  for (const b of live('books')) {
    if (b.metaV >= 2 || b.noFile) continue;
    const blob = await db.getFile(b.id);
    if (!blob) continue;
    try {
      const m = await readEpubMeta(await blob.arrayBuffer());
      if (!b.pages && m.pages) b.pages = m.pages;
      if (!b.isbn && m.isbn) b.isbn = m.isbn;
      if (!b.language && m.language) b.language = m.language;
      if (!b.description && m.description) b.description = m.description;
      if (!b.subjects?.length && m.subjects?.length) b.subjects = m.subjects;
      if (m.authors?.length && m.authors.some(x => x.includes(',')) && !String(b.author || '').includes(',')) b.author = m.authors.join('\n');
      b.metaV = 2; await save(b); changed = true;
    } catch (e) { b.metaV = 2; await save(b, { touch: false }); }
  }
  return changed;
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
          <button type="button" class="btn" id="addPaper">${icon('libro', 14)}Libro sin archivo</button>
          <label class="btn primary">${icon('mas', 14)}Agregar EPUB<input type="file" id="epubIn" accept=".epub,application/epub+zip" multiple hidden></label>
        </div>
      </header>
      ${!drive.isConnected() ? `<p class="hint">Con Google Drive conectado, los libros quedan en tu Drive y los puedes abrir desde cualquier aparato.</p>` : ''}
      ${shown.length ? `<div class="shelf">${shown.map(b => `
        <article class="book">
          <a href="${b.noFile ? '#/biblioteca' : '#/leer/' + b.id}" class="book-cover" ${b.noFile ? `data-edit="${b.id}"` : ''} aria-label="${b.noFile ? 'Datos de' : 'Leer'} ${esc(b.title)}">
            ${b.cover ? `<img src="${b.cover}" alt="">` : `<span class="book-fake">${esc(b.title)}</span>`}
          </a>
          <div class="book-info">
            <a href="${b.noFile ? '#/biblioteca' : '#/leer/' + b.id}" class="book-title" ${b.noFile ? `data-edit="${b.id}"` : ''}>${esc(b.title)}</a>
            <span class="book-author">${esc(authorDisplay(b))}${b.year ? ' · ' + esc(b.year) : ''}</span>
            ${b.noFile ? '<span class="book-meta">Libro físico o sin archivo</span>' : `<div class="bar"><div style="width:${Math.round(b.percent || 0)}%"></div></div>
            <span class="book-meta">${Math.round(b.percent || 0)} %${b.highlights?.length ? ` · ${b.highlights.length} subrayado${b.highlights.length > 1 ? 's' : ''}` : ''}${b.club ? ' · club' : ''}</span>`}
            ${authorNeedsReview(b) ? '<span class="book-warn">Revisa el autor: escríbelo como «Apellido, Nombre»</span>' : ''}
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
  $$('[data-edit]').forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); editBook(S.books.get(btn.dataset.edit)).then(() => viewLibrary(filter)); }));
  $('#addPaper').addEventListener('click', async () => { const b = await newPaperBook(); if (b) { toast(`«${b.title}» agregado`); viewLibrary(filter); refresh(); } });
  backfillMeta().then(ch => { if (ch && location.hash.startsWith('#/biblioteca')) viewLibrary(filter); });
  $$('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
    const b = S.books.get(btn.dataset.del);
    if (!await confirmDialog('Eliminar libro', `¿Quitar «${b.title}» de tu biblioteca? Se borran también sus subrayados (las notas que ya creaste se quedan).`, { okLabel: 'Eliminar', danger: true })) return;
    if (b.driveId && drive.hasValidToken()) drive.trashFile(b.driveId);
    await db.deleteFile(b.id);
    await save({ id: b.id, type: 'book', deleted: true, title: b.title });
    viewLibrary(filter); refresh();
  }));
}

const BOOK_FORM = [
  ['title', 'Título', 'wide'], ['author', 'Autores (uno por línea, como «Apellido, Nombre»)', 'area'],
  ['year', 'Año'], ['publisher', 'Editorial'], ['edition', 'Edición (número, si no es la 1.ª)'], ['pages', 'Número de páginas'],
  ['isbn', 'ISBN'], ['language', 'Idioma'], ['subjects', 'Temas (separados por coma)', 'wide'], ['description', 'Sinopsis', 'area'],
];

export async function editBook(b, { title = 'Datos del libro' } = {}) {
  const val = (k) => k === 'subjects' ? (b.subjects || []).join(', ') : (b[k] || '');
  const r = await dialog({
    title, wide: true,
    body: `<div class="book-form">${BOOK_FORM.map(([k, label, kind]) => `<label class="field${kind ? ' ' + kind : ''}"><span>${label}</span>${kind === 'area'
      ? `<textarea name="${k}" rows="${k === 'description' ? 4 : 2}">${esc(val(k))}</textarea>` : `<input name="${k}" value="${esc(val(k))}">`}</label>`).join('')}</div>
      <p class="hint">Estos datos llenan automáticamente las fichas de lectura y las referencias APA. El número de páginas casi nunca viene en el EPUB: si lo necesitas, cópialo del libro impreso.</p>`,
    actions: [{ label: 'Cancelar', value: null }, { label: 'Guardar', primary: true, value: (d) => {
      const o = Object.fromEntries(BOOK_FORM.map(([k]) => [k, d.querySelector(`[name=${k}]`).value.trim()]));
      if (!o.title) { toast('El libro necesita un título'); return false; }
      o.subjects = o.subjects ? o.subjects.split(',').map(x => x.trim()).filter(Boolean) : [];
      return o;
    } }],
    onOpen: (d) => { if (!b.title) d.querySelector('[name=title]').focus(); },
  });
  if (!r) return null;
  Object.assign(b, r);
  await save(b);
  return b;
}

export async function newPaperBook() {
  const now = Date.now();
  const b = { id: db.uid('b'), type: 'book', title: '', author: '', noFile: true, highlights: [], subjects: [], percent: 0, club: false, metaV: 2, created: now };
  const r = await editBook(b, { title: 'Agregar libro sin archivo' });
  return r;
}

// Selector de libro para las plantillas de lectura. Devuelve el libro, 'none' (sin libro) o null (cancelar).
export function pickBook({ title = '¿De qué libro?' } = {}) {
  return new Promise(resolve => {
    let picked = null;
    const books = live('books').sort((a, b) => (b.lastOpened || b.created || 0) - (a.lastOpened || a.created || 0));
    const row = (b) => `<button type="button" class="pick-book" data-b="${b.id}" data-q="${esc((b.title + ' ' + (b.author || '')).toLowerCase())}">
      ${b.cover ? `<img src="${b.cover}" alt="">` : `<span class="pick-fake">${esc(b.title.slice(0, 18))}</span>`}
      <span class="grow"><strong>${esc(b.title)}</strong><span class="hint">${esc(authorDisplay(b))}${b.year ? ' · ' + esc(b.year) : ''}${b.noFile ? ' · sin archivo' : ''}</span></span></button>`;
    dialog({
      title, wide: true,
      body: `${books.length > 5 ? `<label class="field"><span class="sr">Buscar libro</span><input type="search" id="pickQ" placeholder="Buscar por título o autor…" autocomplete="off"></label>` : ''}
        <div class="pick-list">${books.map(row).join('') || '<p class="empty">Tu biblioteca está vacía.</p>'}</div>
        <div class="btn-row"><button type="button" class="btn" id="pickNew">${icon('mas', 14)}Agregar un libro que no está</button><button type="button" class="btn" id="pickNone">Seguir sin libro</button></div>`,
      actions: [{ label: 'Cancelar', value: null }],
      onOpen: (d) => {
        const done = (v) => { picked = v; d.querySelector('[data-close]').click(); };
        d.querySelectorAll('[data-b]').forEach(x => x.addEventListener('click', () => done(S.books.get(x.dataset.b))));
        d.querySelector('#pickNone').addEventListener('click', () => done('none'));
        d.querySelector('#pickNew').addEventListener('click', async () => { const b = await newPaperBook(); if (b) done(b); });
        const q = d.querySelector('#pickQ');
        q?.addEventListener('input', () => { const v = q.value.toLowerCase().trim(); d.querySelectorAll('[data-b]').forEach(x => { x.hidden = v && !x.dataset.q.includes(v); }); });
        q?.focus();
      },
    }).then(() => resolve(picked));
  });
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
      <div class="sel-hint" id="selHint" hidden><span>Toca la palabra donde termina</span><button type="button" class="sel-btn" id="selHintX">Cancelar</button></div>
      <div class="sel-bar" id="selBar" hidden>
        <button type="button" class="sel-btn primary" id="selHl">${icon('marca', 15)}Subrayar</button>
        <button type="button" class="sel-btn" id="selSent" title="Ampliar la selección a toda la frase">Frase</button>
        <button type="button" class="sel-btn" id="selPara" title="Ampliar la selección a todo el párrafo">Párrafo</button>
        <button type="button" class="sel-btn" id="selTo" title="Toca después la palabra donde termina">Hasta…</button>
        <button type="button" class="sel-btn" id="selNote" aria-label="Subrayar y anotar">${icon('lapiz', 15)}<span class="lbl">Anotar</span></button>
        <button type="button" class="sel-btn x" id="selX" aria-label="Cerrar">${icon('x', 16)}</button>
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
  // Si la selección desaparece (tocas otra parte del texto), la barra se esconde sola
  let suppressUntil = 0;
  let extendFrom = null;   // modo «Hasta…»: inicio fijo, esperando que toques dónde termina
  rendition.hooks.content.register((contents) => {
    contents.document.addEventListener('selectionchange', () => {
      if (extendFrom) return;
      const sel = contents.window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) hideSelBar();
    });
  });
  const hideSelBar = () => { pendingSel = null; const bar = $('#selBar'); if (bar) bar.hidden = true; };
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
    if (Date.now() < suppressUntil) return;
    const text = contents.window.getSelection()?.toString().trim();
    if (!text || cfiRange === lastHl) return;
    pendingSel = { cfi: cfiRange, text, contents };
    $('#selBar').hidden = false;
  });
  // Cerrar: quita la selección en todas las páginas cargadas y evita que la barra reaparezca enseguida
  const clearSel = () => {
    suppressUntil = Date.now() + 900;
    try { rendition.getContents().forEach(c => c.window.getSelection().removeAllRanges()); } catch (e) {}
    try { pendingSel?.contents.window.getSelection().removeAllRanges(); } catch (e) {}
    hideSelBar();
  };
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
  ['selHl', 'selNote', 'selX', 'selSent', 'selPara'].forEach(id => $('#' + id).addEventListener('pointerdown', (e) => e.preventDefault()));

  // Ampliar la selección a la frase o al párrafo completo (en el celular arrastrar las manijas es difícil)
  const blockOf = (n) => { n = n.nodeType === 3 ? n.parentNode : n; return n.closest('p,li,blockquote,h1,h2,h3,h4,h5,h6,dd,dt,td,figcaption') || n.closest('div') || n; };
  const textMap = (block) => {
    const w = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const nodes = []; let pos = 0, n;
    while ((n = w.nextNode())) { nodes.push({ n, start: pos }); pos += n.textContent.length; }
    return { nodes, text: nodes.map(x => x.n.textContent).join('') };
  };
  const toAbs = (map, node, off) => { const hit = map.nodes.find(x => x.n === node); return hit ? hit.start + off : (node.nodeType === 1 ? 0 : 0); };
  const toNode = (map, abs) => {
    for (const x of map.nodes) if (abs <= x.start + x.n.textContent.length) return [x.n, abs - x.start];
    const last = map.nodes[map.nodes.length - 1]; return [last.n, last.n.textContent.length];
  };
  const expandSel = (kind) => {
    const ps = pendingSel; if (!ps) return;
    const win = ps.contents.window, doc = ps.contents.document;
    const sel = win.getSelection(); if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const b1 = blockOf(r.startContainer), b2 = blockOf(r.endContainer);
    const nr = doc.createRange();
    if (kind === 'p') {
      nr.setStart(b1, 0); nr.setEnd(b2, b2.childNodes.length);
    } else {
      const m1 = textMap(b1), m2 = b1 === b2 ? m1 : textMap(b2);
      if (!m1.nodes.length || !m2.nodes.length) return;
      let a = r.startContainer.nodeType === 3 ? toAbs(m1, r.startContainer, r.startOffset) : 0;
      let z = r.endContainer.nodeType === 3 ? toAbs(m2, r.endContainer, r.endOffset) : m2.text.length;
      const t1 = m1.text, t2 = m2.text;
      // inicio: después del último signo de cierre de frase antes de la selección
      let i = a; while (i > 0 && !/[.!?…;]/.test(t1[i - 1])) i--;
      while (i < t1.length && /[\s"'»”’)\]]/.test(t1[i])) i++;
      // fin: hasta el siguiente signo de cierre (incluye comillas que lo siguen)
      let j = Math.max(z, 0); while (j < t2.length && !/[.!?…]/.test(t2[j])) j++;
      if (j < t2.length) j++;
      while (j < t2.length && /["'»”’)\]]/.test(t2[j])) j++;
      const [sn, so] = toNode(m1, Math.min(i, a)); const [en, eo] = toNode(m2, Math.max(j, z));
      nr.setStart(sn, so); nr.setEnd(en, eo);
    }
    sel.removeAllRanges(); sel.addRange(nr);
    let cfi = ps.cfi; try { cfi = ps.contents.cfiFromRange(nr); } catch (e) {}
    pendingSel = { cfi, text: nr.toString().trim(), contents: ps.contents };
    $('#selBar').hidden = false;
  };
  // «Hasta…»: fija el inicio y espera un toque en la palabra final (sin arrastrar manijas)
  const wordEdge = (node, off, dir) => {
    if (node.nodeType !== 3) return off;
    const t = node.textContent;
    if (dir > 0) { while (off < t.length && /[\p{L}\p{N}'’-]/u.test(t[off])) off++; while (off < t.length && /[.,;:!?…»”"')\]]/.test(t[off])) off++; }
    else { while (off > 0 && /[\p{L}\p{N}'’-]/u.test(t[off - 1])) off--; while (off > 0 && /[«“"'(\[¿¡]/.test(t[off - 1])) off--; }
    return off;
  };
  const endHint = () => { extendFrom = null; $('#selHint').hidden = true; };
  $('#selTo').addEventListener('click', () => {
    const ps = pendingSel; if (!ps) return;
    const sel = ps.contents.window.getSelection(); if (!sel.rangeCount) return;
    extendFrom = { range: sel.getRangeAt(0).cloneRange(), contents: ps.contents };
    $('#selBar').hidden = true; $('#selHint').hidden = false;
  });
  $('#selHintX').addEventListener('click', () => { endHint(); clearSel(); });
  $('#selHintX').addEventListener('pointerdown', (e) => e.preventDefault());
  rendition.on('click', (e, contents) => {
    if (!extendFrom) return;
    const c = contents || extendFrom.contents;
    const doc = c.document;
    let node, off;
    if (doc.caretRangeFromPoint) { const r = doc.caretRangeFromPoint(e.clientX, e.clientY); if (r) { node = r.startContainer; off = r.startOffset; } }
    else if (doc.caretPositionFromPoint) { const p = doc.caretPositionFromPoint(e.clientX, e.clientY); if (p) { node = p.offsetNode; off = p.offset; } }
    if (!node || c !== extendFrom.contents) { endHint(); return; }
    const base = extendFrom.range;
    const nr = doc.createRange();
    if (base.comparePoint(node, off) >= 0) { nr.setStart(base.startContainer, base.startOffset); nr.setEnd(node, wordEdge(node, off, 1)); }
    else { nr.setStart(node, wordEdge(node, off, -1)); nr.setEnd(base.endContainer, base.endOffset); }
    const sel = c.window.getSelection();
    sel.removeAllRanges(); sel.addRange(nr);
    let cfi = ''; try { cfi = c.cfiFromRange(nr); } catch (err) {}
    endHint();
    if (!cfi || !nr.toString().trim()) return;
    pendingSel = { cfi, text: nr.toString().trim(), contents: c };
    $('#selBar').hidden = false;
  });
  ['selTo'].forEach(id => $('#' + id).addEventListener('pointerdown', (e) => e.preventDefault()));
  $('#selSent').addEventListener('click', () => expandSel('s'));
  $('#selPara').addEventListener('click', () => expandSel('p'));

  // Navegación
  // El lector se mueve de página en página. Si el navegador intenta correrlo de lado (por ejemplo al arrastrar
  // las manijas de selección), lo devolvemos a su sitio; solo nuestras acciones pueden cambiar de página.
  const scroller = area.querySelector('.epub-container') || area;
  let lockLeft = scroller.scrollLeft, navigating = false, navTimer = null;
  const nav = async (fn) => {
    navigating = true; clearTimeout(navTimer);
    try { await fn(); } catch (e) {}
    navTimer = setTimeout(() => { lockLeft = scroller.scrollLeft; navigating = false; }, 150);
  };
  scroller.addEventListener('scroll', () => { if (!navigating && Math.abs(scroller.scrollLeft - lockLeft) > 2) scroller.scrollLeft = lockLeft; });
  const onResize = () => nav(() => new Promise(r => setTimeout(r, 600)));
  window.addEventListener('resize', onResize);
  const hasSelection = () => { try { return rendition.getContents().some(c => { const x = c.window.getSelection(); return x && !x.isCollapsed && x.toString().trim(); }); } catch (e) { return false; } };
  const prev = () => nav(() => rendition.prev()), next = () => nav(() => rendition.next());
  $('#rdPrev').addEventListener('click', prev);
  $('#rdNext').addEventListener('click', next);
  const keys = (e) => { if (e.target.closest?.('input,textarea,[contenteditable="true"]')) return; if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next(); };
  document.addEventListener('keyup', keys);
  rendition.on('keyup', keys);
  // Deslizar para pasar de página, pero nunca mientras estás seleccionando texto
  let touchX = null, touchT = 0, selectingAtStart = false;
  rendition.on('touchstart', (e) => { touchX = e.changedTouches?.[0]?.screenX ?? null; touchT = Date.now(); selectingAtStart = hasSelection() || !!pendingSel; });
  rendition.on('touchend', (e) => {
    if (touchX === null) return;
    const dx = (e.changedTouches?.[0]?.screenX ?? touchX) - touchX;
    const quick = Date.now() - touchT < 600;
    if (!selectingAtStart && !hasSelection() && quick && Math.abs(dx) > 60) (dx < 0 ? next : prev)();
    touchX = null;
  });

  // Paneles
  const panel = $('#rdPanel');
  const openPanel = (html) => { panel.innerHTML = `<div class="panel-head"><span></span><button type="button" class="icon-btn sm" id="pClose" aria-label="Cerrar">${icon('x', 16)}</button></div>${html}`; panel.hidden = false; $('#pClose').addEventListener('click', () => { panel.hidden = true; }); };

  $('#rdToc').addEventListener('click', async () => {
    const nav = await book.loaded.navigation;
    const flat = (items, depth = 0) => items.flatMap(i => [{ ...i, depth }, ...flat(i.subitems || [], depth + 1)]);
    openPanel(`<h2 class="card-title">Índice</h2><div class="toc">${flat(nav.toc).map(i => `<button type="button" data-href="${esc(i.href)}" style="padding-left:${12 + i.depth * 14}px">${esc(i.label.trim())}</button>`).join('') || '<p class="empty">Este libro no trae índice.</p>'}</div>`);
    $$('[data-href]', panel).forEach(x => x.addEventListener('click', () => { nav(() => rendition.display(x.dataset.href)); panel.hidden = true; }));
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
    $$('[data-go]', panel).forEach(x => x.addEventListener('click', () => { const h = hs.find(y => y.id === x.dataset.go); nav(() => rendition.display(h.cfi)); panel.hidden = true; }));
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
    const setSize = (d) => { prefs.size = Math.max(70, Math.min(180, prefs.size + d)); nav(() => { rendition.themes.fontSize(prefs.size + '%'); return new Promise(r => setTimeout(r, 700)); }); $('#fSize').textContent = prefs.size + ' %'; localStorage.setItem('scr.reader', JSON.stringify(prefs)); };
    $('#fMinus').addEventListener('click', () => setSize(-10));
    $('#fPlus').addEventListener('click', () => setSize(10));
    $$('[data-th]', panel).forEach(x => x.addEventListener('click', () => {
      prefs.theme = x.dataset.th; nav(() => { rendition.themes.select(prefs.theme); return new Promise(r => setTimeout(r, 400)); });
      $('.reader').className = 'reader theme-' + prefs.theme;
      localStorage.setItem('scr.reader', JSON.stringify(prefs));
      $$('[data-th]', panel).forEach(y => y.classList.toggle('primary', y === x));
    }));
  });

  page.cleanup = async () => {
    document.removeEventListener('keyup', keys);
    window.removeEventListener('resize', onResize);
    destroyed = true;
    saveProgress.flush();
    try { rendition.destroy(); } catch (e) {}
    try { book.destroy(); } catch (e) {}
  };
}

async function fichaDeLectura(b) {
  const sp = findSpaceByName('club', 'lectura');
  const tpl = live('templates').find(t => t.builtin === 'ficha') || live('templates').find(t => /ficha/i.test(t.name));
  const subrayados = [
    { type: 'header', data: { text: 'Subrayados', level: 2 } },
    ...(b.highlights || []).map(h => ({ type: 'quote', data: { text: esc(h.text), caption: esc([h.chapter, h.note].filter(Boolean).join(' — ')), alignment: 'left' } })),
  ];
  const base = tpl ? fillBlocks(structuredClone(tpl.content?.blocks || []), b) : fillBlocks([{ type: 'referencia', data: {} }], b);
  await createNote({ spaceId: sp?.id, title: `Ficha de lectura · ${b.title}`, blocks: [...base, ...subrayados], extra: { bookId: b.id } });
}

export function lastBook() {
  return live('books').filter(b => b.lastOpened).sort((a, b) => b.lastOpened - a.lastOpened)[0];
}
export { hace };
