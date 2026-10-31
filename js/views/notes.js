// Notas, espacios, búsqueda, papelera y plantillas.
import * as db from '../db.js';
import {
  S, $, $$, esc, debounce, toast, hace, icon, save, settings, page, refresh, dialog, askText, confirmDialog,
  spacesOrdered, liveNotes, notesIn, childrenOf, live, PALETA, isoDate, parseISO, fechaCorta, stripTags,
} from '../core.js';
import { createEditor, blocksToText, collectReferences, blocksToHtml } from '../editor.js';
import { formatAPA, citaEnTexto } from '../apa.js';
import { liturgicalDay, COLORES } from '../liturgia.js';
import { exportDocx, printDocument, exportMarkdown } from '../export.js';
import { reviewToggle } from './review.js';

const view = () => $('#view');
export const STATUS = { '': 'Sin estado', pendiente: 'Pendiente', curso: 'En curso', hecho: 'Hecho' };

export function noteText(n) { return blocksToText(n.content?.blocks || []); }

/* ---------- Filas de notas ---------- */
export function noteRow(n, { showSpace = true, snippet = '' } = {}) {
  const sp = S.spaces.get(n.spaceId);
  return `<a href="#/nota/${n.id}" class="row">
    <span class="row-main"><span class="row-title">${esc(n.title || 'Sin título')}</span>
    ${snippet ? `<span class="row-snip">${snippet}</span>` : ''}
    ${n.tags?.length ? `<span class="tags">${n.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</span>` : ''}</span>
    <span class="row-meta">${n.fecha ? `${icon('calendario', 12)}${esc(fechaCorta(parseISO(n.fecha)))} · ` : ''}${showSpace && sp ? `<span class="dot" style="background:${esc(sp.color)}"></span>${esc(sp.name)} · ` : ''}${hace(n.updated)}</span>
  </a>`;
}

/* ---------- Crear notas (con plantilla) ---------- */
// Versión sin diálogo intermedio: devuelve la elección como promesa
export function pickTemplate() {
  return new Promise(resolve => {
    const tpls = live('templates').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    let picked = null;
    dialog({
      title: 'Nueva nota',
      body: `<p class="hint">Elige una plantilla o empieza en blanco.</p><div class="tpl-grid">
        <button type="button" class="tpl-btn" data-t="">${icon('pagina', 18)}<span>En blanco</span></button>
        ${tpls.map(t => `<button type="button" class="tpl-btn" data-t="${t.id}">${icon('plantilla', 18)}<span>${esc(t.name)}</span></button>`).join('')}
      </div>`,
      actions: [{ label: 'Cancelar', value: null }],
      onOpen: (d) => $$('.tpl-btn', d).forEach(b => b.addEventListener('click', () => { picked = b.dataset.t; d.querySelector('[data-close]').click(); })),
    }).then(() => resolve(picked));
  });
}

export async function createNote({ spaceId, parentId = null, templateId = '', title = '', fecha = '', ask = false, blocks = null, extra = {} } = {}) {
  spaceId = spaceId || spacesOrdered()[0]?.id;
  if (!spaceId) { toast('Primero crea un espacio'); location.hash = '#/espacios'; return; }
  if (ask) {
    const t = await pickTemplate();
    if (t === null) return;
    templateId = t;
  }
  const tpl = templateId ? S.templates.get(templateId) : null;
  const now = Date.now();
  const n = {
    id: db.uid('n'), type: 'note', spaceId, parentId, title: title || '', tags: [],
    content: { blocks: structuredClone(blocks || tpl?.content?.blocks || []) }, created: now, updated: now, ...extra,
  };
  if (fecha) { n.fecha = fecha; n.litKey = liturgicalDay(parseISO(fecha)).clave || ''; }
  n.text = noteText(n);
  await save(n, { touch: false });
  location.hash = '#/nota/' + n.id;
  return n;
}

/* ---------- Pendientes (casillas sin marcar) ---------- */
export function pendientes() {
  const res = [];
  for (const n of liveNotes()) {
    if (S.spaces.get(n.spaceId)?.archived) continue;
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

/* ---------- Espacio: lista o tablero ---------- */
export function viewSpace(id) {
  const s = S.spaces.get(id);
  if (!s || s.deleted) { view().innerHTML = `<div class="page"><p class="empty">Ese espacio no existe.</p></div>`; return; }
  const mode = s.view === 'tablero' ? 'tablero' : 'lista';
  const all = notesIn(id);
  view().innerHTML = `
    <div class="page">
      <header class="page-head">
        <div>
          <div class="eyebrow"><span class="dot" style="background:${esc(s.color)}"></span> Espacio${s.archived ? ' · archivado' : ''} · ${all.length === 1 ? '1 nota' : all.length + ' notas'}</div>
          <h1 class="display">${esc(s.name)}</h1>
        </div>
        <div class="head-actions">
          <div class="seg" role="group" aria-label="Vista">
            <button type="button" class="${mode === 'lista' ? 'on' : ''}" data-mode="lista">${icon('lista', 14)}Lista</button>
            <button type="button" class="${mode === 'tablero' ? 'on' : ''}" data-mode="tablero">${icon('tablero', 14)}Tablero</button>
          </div>
          <a href="#/espacios" class="btn">${icon('lapiz', 14)}Editar</a>
          <button type="button" class="btn primary" id="newNote">${icon('mas', 14)}Nueva nota</button>
        </div>
      </header>
      <div id="spaceBody"></div>
    </div>`;
  $$('[data-mode]').forEach(b => b.addEventListener('click', async () => { s.view = b.dataset.mode; await save(s); viewSpace(id); }));
  $('#newNote').addEventListener('click', () => createNote({ spaceId: id, ask: true }));
  if (mode === 'lista') renderList(all); else renderBoard(s, all);
}

function renderList(all) {
  const tops = all.filter(n => !n.parentId || !S.notes.get(n.parentId) || S.notes.get(n.parentId).deleted).sort((a, b) => b.updated - a.updated);
  const tree = (n, depth) => `<div class="tree-item" style="--depth:${depth}">${noteRow(n, { showSpace: false })}</div>` + childrenOf(n.id).map(c => tree(c, depth + 1)).join('');
  $('#spaceBody').innerHTML = `<section class="card">${tops.length ? `<div class="rows">${tops.map(n => tree(n, 0)).join('')}</div>` : `<p class="empty">Este espacio está vacío. Crea la primera nota.</p>`}</section>`;
}

function renderBoard(space, all) {
  const cols = Object.entries(STATUS);
  $('#spaceBody').innerHTML = `<p class="hint">Arrastra las tarjetas entre columnas, o cambia el estado desde cada tarjeta.</p>
    <div class="board">${cols.map(([k, label]) => {
      const items = all.filter(n => (n.status || '') === k).sort((a, b) => b.updated - a.updated);
      return `<section class="board-col" data-status="${k}">
        <h2 class="board-head">${label}<span class="count">${items.length}</span></h2>
        <div class="board-list">${items.map(n => `<article class="board-card" draggable="true" data-id="${n.id}">
          <a href="#/nota/${n.id}" class="board-title">${esc(n.title || 'Sin título')}</a>
          ${n.tags?.length ? `<span class="tags">${n.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</span>` : ''}
          <label class="sr" for="st-${n.id}">Estado</label>
          <select id="st-${n.id}" class="board-sel" data-id="${n.id}">${cols.map(([k2, l2]) => `<option value="${k2}"${k2 === k ? ' selected' : ''}>${l2}</option>`).join('')}</select>
        </article>`).join('')}</div>
      </section>`;
    }).join('')}</div>`;
  const setStatus = async (nid, st) => { const n = S.notes.get(nid); n.status = st || undefined; if (!st) delete n.status; await save(n); renderBoard(space, notesIn(space.id)); };
  $$('.board-sel').forEach(sel => sel.addEventListener('change', () => setStatus(sel.dataset.id, sel.value)));
  $$('.board-card').forEach(c => c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); }));
  $$('.board-card').forEach(c => c.addEventListener('dragend', () => c.classList.remove('dragging')));
  $$('.board-col').forEach(col => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('over'); const nid = e.dataTransfer.getData('text/plain'); if (nid) setStatus(nid, col.dataset.status); });
  });
}

/* ---------- Enlaces entre notas: [[Título]] ---------- */
const WIKI = /\[\[([^\[\]]{1,120})\]\]/g;

async function resolveWikiLinks(content, note) {
  const changed = [];
  const created = [];
  const findOrCreate = async (title) => {
    const t = title.trim();
    let target = liveNotes().find(n => (n.title || '').trim().toLowerCase() === t.toLowerCase() && n.id !== note.id);
    if (!target) {
      const now = Date.now();
      target = { id: db.uid('n'), type: 'note', spaceId: note.spaceId, parentId: null, title: t, tags: [], content: { blocks: [] }, text: '', created: now, updated: now };
      await save(target, { touch: false });
      created.push(t);
    }
    return target;
  };
  const replaceIn = async (html) => {
    if (!html || !html.includes('[[')) return html;
    let out = html;
    for (const m of [...html.matchAll(WIKI)]) {
      const target = await findOrCreate(stripTags(m[1]));
      out = out.replace(m[0], `<a href="#/nota/${target.id}" class="nlink">${esc(target.title)}</a>`);
    }
    return out;
  };
  for (const b of content.blocks || []) {
    const d = b.data || {};
    let did = false;
    for (const k of ['text', 'caption']) {
      if (typeof d[k] === 'string' && d[k].includes('[[')) { const v = await replaceIn(d[k]); if (v !== d[k]) { d[k] = v; did = true; } }
    }
    const walk = async (items) => { for (const it of items || []) {
      if (typeof it === 'object') {
        for (const k of ['text', 'content']) if (typeof it[k] === 'string' && it[k].includes('[[')) { const v = await replaceIn(it[k]); if (v !== it[k]) { it[k] = v; did = true; } }
        await walk(it.items);
      }
    } };
    await walk(d.items);
    if (did) changed.push(b);
  }
  return { changed, created };
}

export function backlinks(id) {
  const re = new RegExp(`#/nota/${id}(?![a-z0-9])`);
  return liveNotes().filter(n => n.id !== id && re.test(JSON.stringify(n.content || {})));
}

/* ---------- Vista de una nota ---------- */
export function viewNote(id) {
  const n = S.notes.get(id);
  if (!n || n.deleted) { view().innerHTML = `<div class="page"><p class="empty">Esa nota no existe o está en la papelera.</p></div>`; return; }
  const sp = S.spaces.get(n.spaceId);
  const crumbs = [];
  let p = n.parentId ? S.notes.get(n.parentId) : null;
  while (p && crumbs.length < 6) { crumbs.unshift(p); p = p.parentId ? S.notes.get(p.parentId) : null; }
  const kids = childrenOf(n.id);
  const back = backlinks(n.id);

  view().innerHTML = `
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
        <label class="meta-field"><span class="sr">Fecha</span><input type="date" id="noteDate" value="${esc(n.fecha || '')}" title="Fecha (para el calendario y la liturgia)"></label>
        <label class="meta-field"><span class="sr">Estado</span>
          <select id="noteStatus">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${(n.status || '') === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
        </label>
        <div class="tag-edit" id="tagEdit"></div>
        <span class="grow"></span>
        <button type="button" class="btn sm${n.review ? ' on' : ''}" id="reviewBtn" aria-pressed="${!!n.review}">${icon('repaso', 14)}${n.review ? 'En repaso' : 'Repasar'}</button>
        <details class="menu">
          <summary class="btn sm">Más</summary>
          <div class="menu-pop">
            <button type="button" data-act="sub">${icon('pagina', 14)}Nueva subpágina</button>
            <button type="button" data-act="refs">${icon('marca', 14)}Lista de referencias</button>
            <button type="button" data-act="docx">${icon('descargar', 14)}Exportar a Word</button>
            <button type="button" data-act="pdf">${icon('descargar', 14)}Imprimir o guardar PDF</button>
            <button type="button" data-act="md">${icon('descargar', 14)}Exportar a Markdown</button>
            <button type="button" data-act="tpl">${icon('plantilla', 14)}Guardar como plantilla</button>
            <button type="button" data-act="del" class="danger">${icon('papelera', 14)}Enviar a la papelera</button>
          </div>
        </details>
      </div>
      <div id="litInfo"></div>
      <div id="editor" class="editor"></div>
      <p class="hint editor-hint">Escribe <code>[[Título de otra nota]]</code> para enlazarla (si no existe, se crea). Pulsa Tab o el botón + para cita bíblica, magisterio, referencia APA, casillas…</p>
      ${kids.length ? `<section class="subpages"><h2 class="card-title">Subpáginas</h2><div class="rows">${kids.map(k => noteRow(k, { showSpace: false })).join('')}</div></section>` : ''}
      ${back.length ? `<section class="subpages"><h2 class="card-title">Notas que enlazan aquí</h2><div class="rows">${back.map(k => noteRow(k)).join('')}</div></section>` : ''}
      <div class="saved" id="savedMark" aria-live="polite"></div>
    </article>`;

  renderLitInfo(n);

  let editor = null;
  let saving = Promise.resolve();
  const markSaved = (t) => { const m = $('#savedMark'); if (m) m.textContent = t; };
  const doSave = async () => {
    const cur = S.notes.get(id);
    if (!cur || cur.deleted) return;
    if (editor) {
      try {
        const content = await editor.save();
        const { changed, created } = await resolveWikiLinks(content, cur);
        cur.content = content;
        if (changed.length) {
          for (const b of changed) { try { await editor.blocks.update(b.id, b.data); const idx = editor.blocks.getBlockIndex(b.id); editor.caret.setToBlock(idx, 'end'); } catch (e) {} }
          if (created.length) toast(created.length === 1 ? `Nota «${created[0]}» creada y enlazada` : `${created.length} notas nuevas enlazadas`);
          refresh();
        }
      } catch (e) { /* editor cerrado */ }
    }
    const t = $('#noteTitle');
    if (t) cur.title = t.value.trim();
    cur.text = noteText(cur).slice(0, 6000);
    await save(cur);
    markSaved('Guardado');
  };
  const queue = debounce(() => { saving = saving.then(doSave); }, 700);
  const changed = () => { markSaved('Guardando…'); queue(); };

  editor = createEditor('editor', n.content, { onChange: changed });
  page.flush = () => queue.flush();
  page.cleanup = async () => { queue.flush(); await saving; try { editor?.destroy(); } catch (e) {} editor = null; };

  // Enlaces dentro del editor
  $('#editor').addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href.startsWith('#/')) { e.preventDefault(); location.hash = href; }
    else if (/^https?:/.test(href) && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(href, '_blank', 'noopener'); }
  });

  const title = $('#noteTitle');
  title.addEventListener('input', changed);
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); editor?.focus?.(); } });
  if (!n.title) setTimeout(() => title.focus(), 60);

  $('#noteSpace').addEventListener('change', async (e) => {
    const ids = [id]; const collect = (nid) => childrenOf(nid).forEach(c => { ids.push(c.id); collect(c.id); }); collect(id);
    for (const nid of ids) { const x = S.notes.get(nid); x.spaceId = e.target.value; await save(x); }
    refresh(); toast('Nota movida');
  });
  $('#noteDate').addEventListener('change', async (e) => {
    const cur = S.notes.get(id);
    if (e.target.value) { cur.fecha = e.target.value; cur.litKey = liturgicalDay(parseISO(cur.fecha)).clave || ''; }
    else { delete cur.fecha; delete cur.litKey; }
    await save(cur); renderLitInfo(cur);
  });
  $('#noteStatus').addEventListener('change', async (e) => {
    const cur = S.notes.get(id);
    if (e.target.value) cur.status = e.target.value; else delete cur.status;
    await save(cur);
  });
  $('#reviewBtn').addEventListener('click', async () => {
    const cur = S.notes.get(id);
    const on = await reviewToggle(cur);
    const b = $('#reviewBtn');
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    b.innerHTML = `${icon('repaso', 14)}${on ? 'En repaso' : 'Repasar'}`;
    toast(on ? 'La verás en Repaso' : 'Quitada del repaso');
    refresh();
  });
  renderTagEditor(id);

  const menu = $('.menu');
  document.addEventListener('click', function close(e) { if (!menu.isConnected) { document.removeEventListener('click', close); return; } if (!menu.contains(e.target)) menu.open = false; });
  $$('.menu-pop button').forEach(b => b.addEventListener('click', async () => {
    menu.open = false;
    queue.flush(); await saving;
    const cur = S.notes.get(id);
    const tree = [cur]; const collect = (nid) => childrenOf(nid).forEach(c => { tree.push(c); collect(c.id); });
    switch (b.dataset.act) {
      case 'sub': createNote({ spaceId: cur.spaceId, parentId: cur.id, ask: true }); break;
      case 'refs': showReferences(cur); break;
      case 'docx': { collect(cur.id); const refs = dedupeRefs(tree.flatMap(x => collectReferences(x.content?.blocks))); await exportDocx(cur.title || 'Sin título', tree.length > 1 ? tree.map(x => ({ title: x.title, blocks: stripRefBlocks(x.content?.blocks) })) : [{ blocks: stripRefBlocks(cur.content?.blocks) }], { refs }); break; }
      case 'pdf': { collect(cur.id); const refs = dedupeRefs(tree.flatMap(x => collectReferences(x.content?.blocks))); printDocument(cur.title || 'Sin título', tree.length > 1 ? tree.map(x => ({ title: x.title, blocks: stripRefBlocks(x.content?.blocks) })) : [{ blocks: stripRefBlocks(cur.content?.blocks) }], { refs }); break; }
      case 'md': collect(cur.id); exportMarkdown(cur.title || 'Sin título', tree.map(x => ({ title: x.title, blocks: x.content?.blocks || [] }))); break;
      case 'tpl': {
        const name = await askText('Guardar como plantilla', { label: 'Nombre de la plantilla', value: cur.title });
        if (!name) return;
        await save({ id: db.uid('t'), type: 'template', name, content: structuredClone(cur.content || { blocks: [] }), order: live('templates').length, created: Date.now() });
        toast(`Plantilla «${name}» guardada`); break;
      }
      case 'del': {
        collect(cur.id);
        if (!await confirmDialog('Enviar a la papelera', tree.length > 1 ? `Se enviarán esta nota y sus ${tree.length - 1} subpáginas a la papelera. Podrás recuperarlas.` : 'Podrás recuperarla desde la papelera.', { okLabel: 'Enviar a la papelera', danger: true })) return;
        for (const x of tree) { x.deleted = true; x.deletedAt = Date.now(); await save(x); }
        page.cleanup = async () => { try { editor?.destroy(); } catch (e) {} };
        toast('Enviada a la papelera');
        location.hash = sp ? '#/espacio/' + sp.id : '#/hoy';
        break;
      }
    }
  }));
}

const stripRefBlocks = (blocks = []) => blocks.filter(b => b.type !== 'referencia');
function dedupeRefs(refs) {
  const conn = settings().apaConnector || 'y';
  const map = new Map();
  refs.forEach(r => map.set(stripTags(formatAPA(r, conn)).toLowerCase(), r));
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(e => e[1]);
}

function showReferences(note) {
  const conn = settings().apaConnector || 'y';
  const tree = [note]; const collect = (nid) => childrenOf(nid).forEach(c => { tree.push(c); collect(c.id); }); collect(note.id);
  const refs = dedupeRefs(tree.flatMap(x => collectReferences(x.content?.blocks)));
  const html = refs.map(r => `<p class="apa">${formatAPA(r, conn)}</p>`).join('');
  dialog({
    title: 'Referencias',
    wide: true,
    body: refs.length
      ? `<p class="hint">${refs.length} referencia${refs.length > 1 ? 's' : ''} en orden alfabético, con formato APA 7. Al copiar se conserva la cursiva.</p>
         <div class="apa-list">${html}</div>
         <h3 class="mini">Citas en el texto</h3><ul class="plain cites">${refs.map(r => `<li>${esc(citaEnTexto(r, conn))}</li>`).join('')}</ul>`
      : `<p class="empty">Esta nota no tiene bloques de «Referencia APA». Agrégalos desde el botón + del editor.</p>`,
    actions: refs.length ? [{ label: 'Cerrar', value: null }, { label: 'Copiar referencias', primary: true, value: () => { copyRich(html, refs.map(r => stripTags(formatAPA(r, conn))).join('\n')); toast('Referencias copiadas'); return false; } }] : [{ label: 'Cerrar', value: null }],
  });
}

async function copyRich(html, text) {
  try {
    if (window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return;
    }
  } catch (e) {}
  try { await navigator.clipboard.writeText(text); } catch (e) { toast('No se pudo copiar'); }
}

function renderLitInfo(n) {
  const box = $('#litInfo');
  if (!box) return;
  if (!n.fecha) { box.innerHTML = ''; return; }
  const dt = parseISO(n.fecha);
  const lit = liturgicalDay(dt);
  const others = n.litKey ? liveNotes().filter(x => x.id !== n.id && x.litKey === n.litKey).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')) : [];
  const borde = lit.color === 'blanco' ? 'border:1.5px solid #B9AC96;' : '';
  box.innerHTML = `<div class="lit-box">
    <div class="lit-line"><span class="lit-dot" style="background:${COLORES[lit.color]};${borde}"></span><strong>${esc(lit.etiqueta || lit.semana)}</strong><span class="muted">· ${esc(fechaCorta(dt))} · Ciclo ${lit.ciclo} · ${lit.anoFerial}</span></div>
    ${others.length ? `<div class="lit-prev"><span class="muted">Lo que escribiste para este mismo día:</span> ${others.map(o => `<a href="#/nota/${o.id}">${esc(o.title || 'Sin título')}${o.fecha ? ` (${o.fecha.slice(0, 4)}, ciclo ${liturgicalDay(parseISO(o.fecha)).ciclo})` : ''}</a>`).join(' · ')}</div>` : ''}
  </div>`;
}

function renderTagEditor(id) {
  const n = S.notes.get(id);
  const box = $('#tagEdit');
  if (!box) return;
  box.innerHTML = `${(n.tags || []).map((t, i) => `<span class="tag">#${esc(t)}<button type="button" data-i="${i}" aria-label="Quitar etiqueta ${esc(t)}">${icon('x', 12)}</button></span>`).join('')}
    <label class="sr" for="tagInput">Añadir etiqueta</label><input id="tagInput" placeholder="+ etiqueta" autocomplete="off" list="allTags">
    <datalist id="allTags">${[...new Set(liveNotes().flatMap(x => x.tags || []))].map(t => `<option value="${esc(t)}"></option>`).join('')}</datalist>`;
  $$('button[data-i]', box).forEach(b => b.addEventListener('click', async () => {
    n.tags.splice(Number(b.dataset.i), 1); await save(n); renderTagEditor(id); $('#tagInput')?.focus();
  }));
  const input = $('#tagInput');
  const add = async () => {
    const vals = input.value.split(',').map(v => v.trim().replace(/^#/, '')).filter(Boolean);
    if (!vals.length) return;
    n.tags = [...new Set([...(n.tags || []), ...vals])];
    await save(n); renderTagEditor(id); $('#tagInput')?.focus();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    if (e.key === 'Backspace' && !input.value && n.tags?.length) { n.tags.pop(); save(n).then(() => { renderTagEditor(id); $('#tagInput')?.focus(); }); }
  });
  input.addEventListener('change', add);
}

/* ---------- Editar espacios ---------- */
export function viewSpaces() {
  const act = spacesOrdered(false);
  const arch = spacesOrdered(true).filter(s => s.archived);
  const count = (id) => { const c = notesIn(id).length; return c === 1 ? '1 nota' : `${c} notas`; };
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
        <span class="count">${count(s.id)}</span>
      </div>
      <div class="space-row-actions">
        ${s.archived ? `<button type="button" class="btn sm" data-act="unarchive">Volver al menú</button>` : `<button type="button" class="btn sm" data-act="archive">Archivar</button>`}
        <label class="merge"><span class="sr">Unir ${esc(s.name)} con otro espacio</span>
          <select data-act="merge"><option value="">Unir con…</option>${spacesOrdered(true).filter(o => o.id !== s.id).map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>
        </label>
        ${notesIn(s.id).length === 0 ? `<button type="button" class="btn sm danger" data-act="delete">Eliminar</button>` : ''}
      </div>
    </div>`;
  view().innerHTML = `
    <div class="page narrow">
      <header class="page-head"><div><h1 class="display">Tus espacios</h1><p class="lead">Cambia nombres, colores y orden cuando quieras. Las notas se quedan donde están.</p></div></header>
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
      if (a === 'delete') { if (!await confirmDialog('Eliminar espacio', `¿Eliminar el espacio «${s.name}»? Está vacío.`, { okLabel: 'Eliminar', danger: true })) return; s.deleted = true; await save(s); }
      viewSpaces(); refresh();
    });
    $('input[data-act="name"]', rowEl).addEventListener('change', async (e) => {
      const v = e.target.value.trim();
      if (!v) { e.target.value = s.name; return; }
      s.name = v; await save(s); refresh(); toast('Nombre actualizado');
    });
    $('input[data-act="color"]', rowEl).addEventListener('input', async (e) => {
      s.color = e.target.value; e.target.parentElement.style.background = s.color; await save(s); refresh();
    });
    $('select[data-act="merge"]', rowEl).addEventListener('change', async (e) => {
      const target = S.spaces.get(e.target.value);
      if (!target) return;
      const c = notesIn(id).length;
      if (!await confirmDialog('Unir espacios', `Las ${c} notas de «${s.name}» pasarán a «${target.name}» y «${s.name}» quedará archivado.`, { okLabel: 'Unir' })) { e.target.value = ''; return; }
      for (const x of notesIn(id)) { x.spaceId = target.id; await save(x); }
      s.archived = true; await save(s);
      toast(`Unido con «${target.name}»`);
      viewSpaces(); refresh();
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
    viewSpaces(); refresh();
    $('#newSpaceName').focus();
  });
}

/* ---------- Búsqueda ---------- */
export function viewSearch(q) {
  const ql = q.toLowerCase().trim();
  let html;
  if (!ql) html = `<p class="empty">Busca por título, texto, etiqueta (#homilía) o cita bíblica.</p>`;
  else {
    const terms = ql.split(/\s+/).map(t => t.replace(/^#/, ''));
    const res = liveNotes().map(n => {
      const text = n.text || noteText(n);
      const hay = `${n.title} ${text} ${(n.tags || []).join(' ')}`.toLowerCase();
      if (!terms.every(t => hay.includes(t))) return null;
      const score = (n.title || '').toLowerCase().includes(ql) ? 2 : 1;
      const pos = text.toLowerCase().indexOf(terms[0]);
      let snip = '';
      if (pos >= 0) {
        const start = Math.max(0, pos - 50);
        const raw = (start ? '…' : '') + text.slice(start, pos + 110) + '…';
        snip = esc(raw).replace(new RegExp(terms.map(t => esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi'), m => `<mark>${m}</mark>`);
      }
      return { n, score, snip };
    }).filter(Boolean).sort((a, b) => b.score - a.score || b.n.updated - a.n.updated);
    const books = live('books').filter(b => `${b.title} ${b.author}`.toLowerCase().includes(ql));
    html = (res.length ? `<div class="rows">${res.map(r => noteRow(r.n, { snippet: r.snip })).join('')}</div>` : `<p class="empty">No encontré notas con «${esc(q)}».</p>`)
      + (books.length ? `<h3 class="mini">En tu biblioteca</h3><div class="rows">${books.map(b => `<a class="row" href="#/leer/${b.id}"><span class="row-main"><span class="row-title">${esc(b.title)}</span><span class="row-snip">${esc(b.author || '')}</span></span></a>`).join('')}</div>` : '');
  }
  view().innerHTML = `
    <div class="page narrow">
      <header class="page-head"><div><h1 class="display">Buscar</h1>${ql ? `<p class="lead">Resultados para «${esc(q)}»</p>` : ''}</div></header>
      <div class="mobile-only search big">
        ${icon('buscar')}<label class="sr" for="mSearch">Buscar</label>
        <input id="mSearch" type="search" placeholder="Buscar en todo…" value="${esc(q)}" autocomplete="off">
      </div>
      <section class="card">${html}</section>
    </div>`;
  const m = $('#mSearch');
  m.addEventListener('input', debounce(() => {
    const v = m.value.trim();
    history.replaceState(null, '', v ? '#/buscar/' + encodeURIComponent(v) : '#/buscar');
    viewSearch(v);
    const m2 = $('#mSearch'); m2.focus(); m2.setSelectionRange(m2.value.length, m2.value.length);
  }, 300));
  if (window.innerWidth <= 900 && !ql) m.focus();
}

/* ---------- Papelera ---------- */
export function viewTrash() {
  const del = [...S.notes.values()].filter(n => n.deleted && !n.purged).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  view().innerHTML = `
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
    await save(n); toast('Nota restaurada'); viewTrash(); refresh();
  }));
  $('#emptyTrash')?.addEventListener('click', async () => {
    if (!await confirmDialog('Vaciar papelera', 'Las notas se borrarán para siempre. Esto no se puede deshacer.', { okLabel: 'Borrar para siempre', danger: true })) return;
    for (const n of del) await save({ id: n.id, type: 'note', deleted: true, purged: true, spaceId: n.spaceId, title: '', content: { blocks: [] }, tags: [] });
    toast('Papelera vaciada'); viewTrash();
  });
}

/* ---------- Plantillas ---------- */
export function viewTemplates(id) {
  if (id) return viewTemplate(id);
  const tpls = live('templates').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  view().innerHTML = `
    <div class="page narrow">
      <header class="page-head">
        <div><h1 class="display">Plantillas</h1><p class="lead">Aparecen al crear una nota nueva. Cámbialas a tu gusto o crea las tuyas.</p></div>
        <div class="head-actions"><button type="button" class="btn primary" id="newTpl">${icon('mas', 14)}Nueva plantilla</button></div>
      </header>
      <section class="card flush">${tpls.map((t, i) => `<div class="tpl-row">
        <div class="order-btns">
          <button type="button" class="icon-btn sm" data-up="${t.id}" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>${icon('arriba', 14)}</button>
          <button type="button" class="icon-btn sm" data-down="${t.id}" aria-label="Bajar" ${i === tpls.length - 1 ? 'disabled' : ''}>${icon('abajo', 14)}</button>
        </div>
        <a href="#/plantillas/${t.id}" class="grow tpl-name">${icon('plantilla', 16)}${esc(t.name)}</a>
        <span class="count">${(t.content?.blocks || []).length} bloques</span>
      </div>`).join('') || '<p class="empty pad">No hay plantillas.</p>'}</section>
    </div>`;
  $('#newTpl').addEventListener('click', async () => {
    const name = await askText('Nueva plantilla', { label: 'Nombre' });
    if (!name) return;
    const t = await save({ id: db.uid('t'), type: 'template', name, content: { blocks: [] }, order: tpls.length, created: Date.now() });
    location.hash = '#/plantillas/' + t.id;
  });
  const move = async (tid, dir) => {
    const list = live('templates').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const i = list.findIndex(x => x.id === tid), j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) if (list[k].order !== k) { list[k].order = k; await save(list[k]); }
    viewTemplates();
  };
  $$('[data-up]').forEach(b => b.addEventListener('click', () => move(b.dataset.up, -1)));
  $$('[data-down]').forEach(b => b.addEventListener('click', () => move(b.dataset.down, 1)));
}

function viewTemplate(id) {
  const t = S.templates.get(id);
  if (!t || t.deleted) { location.hash = '#/plantillas'; return; }
  view().innerHTML = `
    <article class="page note">
      <nav class="crumbs"><a href="#/plantillas">${icon('plantilla', 14)}Plantillas</a></nav>
      <label class="sr" for="tplName">Nombre</label>
      <input id="tplName" class="note-title" value="${esc(t.name)}" placeholder="Nombre de la plantilla">
      <div class="note-meta"><span class="hint">Lo que escribas aquí aparecerá en cada nota nueva creada con esta plantilla.</span><span class="grow"></span>
        <button type="button" class="btn sm danger" id="delTpl">${icon('papelera', 14)}Eliminar plantilla</button></div>
      <div id="editor" class="editor"></div>
      <div class="saved" id="savedMark"></div>
    </article>`;
  let saving = Promise.resolve();
  const doSave = async () => {
    try { t.content = await editor.save(); } catch (e) {}
    t.name = $('#tplName')?.value.trim() || t.name;
    await save(t);
    const m = $('#savedMark'); if (m) m.textContent = 'Guardado';
  };
  const queue = debounce(() => { saving = saving.then(doSave); }, 700);
  const editor = createEditor('editor', t.content, { onChange: queue });
  $('#tplName').addEventListener('input', queue);
  page.flush = () => queue.flush();
  page.cleanup = async () => { queue.flush(); await saving; try { editor.destroy(); } catch (e) {} };
  $('#delTpl').addEventListener('click', async () => {
    if (!await confirmDialog('Eliminar plantilla', `¿Eliminar la plantilla «${t.name}»? Las notas ya creadas con ella no cambian.`, { okLabel: 'Eliminar', danger: true })) return;
    queue.cancel(); t.deleted = true; await save(t);
    page.cleanup = async () => { try { editor.destroy(); } catch (e) {} };
    location.hash = '#/plantillas';
  });
}

export { blocksToHtml };
