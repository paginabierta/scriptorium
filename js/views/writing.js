// Espacio de escritura: proyectos largos (libros, series, crónicas) por capítulos.
import * as db from '../db.js';
import {
  S, $, $$, esc, icon, save, toast, live, page, dialog, askText, confirmDialog, debounce, wordCount, isoDate, hace, refresh, parseISO, MESES,
} from '../core.js';
import { createEditor, blocksToText } from '../editor.js';
import { exportDocx, printDocument, exportMarkdown, buildEpub } from '../export.js';

const KINDS = { personaje: 'Personajes', lugar: 'Lugares', fuente: 'Fuentes', idea: 'Ideas' };
const KIND1 = { personaje: 'Personaje', lugar: 'Lugar', fuente: 'Fuente', idea: 'Idea' };
const ESTADOS = { borrador: 'Borrador', revision: 'En revisión', listo: 'Listo' };

const chaptersOf = (pid) => live('chapters').filter(c => c.projectId === pid).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const cardsOf = (pid) => live('cards').filter(c => c.projectId === pid);
const projectWords = (pid) => chaptersOf(pid).reduce((s, c) => s + (c.words || 0), 0);
const fmt = (n) => Number(n || 0).toLocaleString('es-CO');

export function todayWords(p) { return (p.log || {})[isoDate()] || 0; }
export function streak(p) {
  const log = p.log || {};
  let n = 0;
  const d = new Date();
  if (!log[isoDate(d)]) d.setDate(d.getDate() - 1);
  while (log[isoDate(d)] > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export function lastProject() {
  return live('projects').sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
}

/* ---------- Lista de proyectos ---------- */
export function viewWriting(arg = '') {
  const [pid, cid] = arg.split('/');
  if (pid && cid) return viewChapter(pid, cid);
  if (pid) return viewProject(pid);
  const ps = live('projects').sort((a, b) => (b.updated || 0) - (a.updated || 0));
  $('#view').innerHTML = `
    <div class="page">
      <header class="page-head">
        <div><h1 class="display">Escritura</h1><p class="lead">Tus proyectos largos: un libro, una serie de reflexiones, crónicas…</p></div>
        <div class="head-actions"><button type="button" class="btn primary" id="newProj">${icon('mas', 14)}Nuevo proyecto</button></div>
      </header>
      ${ps.length ? `<div class="grid">${ps.map(p => {
        const total = projectWords(p.id), caps = chaptersOf(p.id).length;
        const pctDay = p.dailyGoal ? Math.min(100, Math.round(todayWords(p) / p.dailyGoal * 100)) : 0;
        return `<a href="#/escritura/${p.id}" class="card proj-card">
          <h2 class="card-title">${esc(p.title)}</h2>
          <p class="hint">${caps} capítulo${caps === 1 ? '' : 's'} · ${fmt(total)} palabras${p.totalGoal ? ` de ${fmt(p.totalGoal)}` : ''}</p>
          ${p.dailyGoal ? `<div class="bar"><div style="width:${pctDay}%"></div></div><p class="hint">Hoy: ${fmt(todayWords(p))} de ${fmt(p.dailyGoal)}${streak(p) > 1 ? ` · ${streak(p)} días seguidos` : ''}</p>` : ''}
        </a>`;
      }).join('')}</div>` : `<section class="card"><p class="empty">Aún no tienes proyectos. Crea uno para empezar tu libro.</p></section>`}
    </div>`;
  $('#newProj').addEventListener('click', async () => {
    const title = await askText('Nuevo proyecto de escritura', { label: 'Título (puedes cambiarlo después)', placeholder: 'Por ejemplo: Cartas desde la vereda' });
    if (!title) return;
    const now = Date.now();
    const p = await save({ id: db.uid('p'), type: 'project', title, author: '', dailyGoal: 500, totalGoal: 0, log: {}, created: now });
    await save({ id: db.uid('c'), type: 'chapter', projectId: p.id, title: 'Capítulo 1', order: 0, content: { blocks: [] }, words: 0, status: 'borrador', versions: [], created: now });
    location.hash = '#/escritura/' + p.id;
  });
}

/* ---------- Proyecto ---------- */
function viewProject(pid) {
  const p = S.projects.get(pid);
  if (!p || p.deleted) { location.hash = '#/escritura'; return; }
  const caps = chaptersOf(pid);
  const total = projectWords(pid);
  const cards = cardsOf(pid);
  const last14 = [...Array(14)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return { d, w: (p.log || {})[isoDate(d)] || 0 }; });
  const maxW = Math.max(p.dailyGoal || 1, ...last14.map(x => x.w));
  $('#view').innerHTML = `
    <div class="page">
      <nav class="crumbs"><a href="#/escritura">${icon('pluma', 14)}Escritura</a></nav>
      <header class="page-head">
        <div><h1 class="display" id="pTitle">${esc(p.title)}</h1><p class="lead">${p.author ? esc(p.author) + ' · ' : ''}${fmt(total)} palabras · ${caps.length} capítulo${caps.length === 1 ? '' : 's'}</p></div>
        <div class="head-actions">
          <button type="button" class="btn" id="pEdit">${icon('ajustes', 14)}Datos y metas</button>
          <details class="menu"><summary class="btn">${icon('descargar', 14)}Exportar</summary>
            <div class="menu-pop">
              <button type="button" data-x="docx">Word (.docx)</button>
              <button type="button" data-x="pdf">Imprimir o guardar PDF</button>
              <button type="button" data-x="epub">Libro electrónico (EPUB)</button>
              <button type="button" data-x="lib">Agregar a mi Biblioteca para leerlo</button>
              <button type="button" data-x="md">Markdown</button>
            </div></details>
        </div>
      </header>
      <div class="grid wide-first">
        <section class="card">
          <div class="card-head"><h2 class="card-title">Capítulos</h2><button type="button" class="btn sm primary" id="addCap">${icon('mas', 14)}Capítulo</button></div>
          <div class="rows">${caps.map((c, i) => `<div class="row cap-row">
            <div class="order-btns">
              <button type="button" class="icon-btn sm" data-up="${c.id}" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>${icon('arriba', 14)}</button>
              <button type="button" class="icon-btn sm" data-down="${c.id}" aria-label="Bajar" ${i === caps.length - 1 ? 'disabled' : ''}>${icon('abajo', 14)}</button>
            </div>
            <a class="row-main" href="#/escritura/${p.id}/${c.id}"><span class="row-title">${esc(c.title || 'Sin título')}</span>${c.synopsis ? `<span class="row-snip">${esc(c.synopsis)}</span>` : ''}</a>
            <span class="row-meta"><span class="chip st-${c.status || 'borrador'}">${ESTADOS[c.status || 'borrador']}</span>${fmt(c.words)} pal.</span>
          </div>`).join('') || '<p class="empty">Sin capítulos.</p>'}</div>
        </section>
        <section class="card">
          <h2 class="card-title">Avance</h2>
          <div class="stat-row">
            <div class="stat"><span class="stat-n">${fmt(todayWords(p))}</span><span class="stat-l">hoy${p.dailyGoal ? ` / ${fmt(p.dailyGoal)}` : ''}</span></div>
            <div class="stat"><span class="stat-n">${streak(p)}</span><span class="stat-l">días seguidos</span></div>
            <div class="stat"><span class="stat-n">${p.totalGoal ? Math.min(100, Math.round(total / p.totalGoal * 100)) + ' %' : fmt(total)}</span><span class="stat-l">${p.totalGoal ? 'de la meta total' : 'palabras'}</span></div>
          </div>
          <div class="spark" role="img" aria-label="Palabras por día, últimas dos semanas">${last14.map(x => `<span title="${x.d.getDate()} ${MESES[x.d.getMonth()].slice(0, 3)}: ${x.w} palabras" style="height:${Math.max(3, Math.round(x.w / maxW * 100))}%" class="${x.w >= (p.dailyGoal || Infinity) ? 'goal' : ''}"></span>`).join('')}</div>
          <p class="hint">Últimas dos semanas. Las barras oscuras alcanzaron la meta del día.</p>
        </section>
      </div>
      <section class="card">
        <div class="card-head"><h2 class="card-title">Fichas</h2><button type="button" class="btn sm" id="addCard">${icon('mas', 14)}Ficha</button></div>
        <p class="hint">Personajes, lugares, fuentes e ideas que quieres tener a mano mientras escribes.</p>
        ${Object.entries(KINDS).map(([k, label]) => {
          const list = cards.filter(c => c.kind === k);
          return list.length ? `<h3 class="mini">${label}</h3><div class="card-grid">${list.map(c => `<button type="button" class="ficha" data-card="${c.id}"><strong>${esc(c.title)}</strong><span>${esc((c.text || '').slice(0, 140))}</span></button>`).join('')}</div>` : '';
        }).join('') || '<p class="empty">Aún no hay fichas.</p>'}
      </section>
      <p class="hint center"><button type="button" class="link-btn danger" id="pDel">Eliminar este proyecto</button></p>
    </div>`;

  $('#addCap').addEventListener('click', async () => {
    const now = Date.now();
    const c = await save({ id: db.uid('c'), type: 'chapter', projectId: pid, title: `Capítulo ${caps.length + 1}`, order: caps.length, content: { blocks: [] }, words: 0, status: 'borrador', versions: [], created: now });
    location.hash = `#/escritura/${pid}/${c.id}`;
  });
  const move = async (cid, dir) => {
    const list = chaptersOf(pid); const i = list.findIndex(c => c.id === cid), j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) if (list[k].order !== k) { list[k].order = k; await save(list[k]); }
    viewProject(pid);
  };
  $$('[data-up]').forEach(b => b.addEventListener('click', () => move(b.dataset.up, -1)));
  $$('[data-down]').forEach(b => b.addEventListener('click', () => move(b.dataset.down, 1)));
  $('#addCard').addEventListener('click', () => editCard(pid).then(() => viewProject(pid)));
  $$('[data-card]').forEach(b => b.addEventListener('click', () => editCard(pid, b.dataset.card).then(() => viewProject(pid))));
  $('#pEdit').addEventListener('click', async () => {
    const r = await dialog({
      title: 'Datos y metas',
      body: `<label class="field"><span>Título</span><input name="title" value="${esc(p.title)}"></label>
        <label class="field"><span>Autor (como aparecerá en el libro)</span><input name="author" value="${esc(p.author || '')}"></label>
        <div class="field-row"><label class="field"><span>Meta diaria (palabras)</span><input name="dailyGoal" type="number" min="0" step="50" value="${p.dailyGoal || 0}"></label>
        <label class="field"><span>Meta total (0 = sin meta)</span><input name="totalGoal" type="number" min="0" step="1000" value="${p.totalGoal || 0}"></label></div>`,
      actions: [{ label: 'Cancelar', value: null }, { label: 'Guardar', primary: true, value: (d) => ({ title: d.querySelector('[name=title]').value.trim() || p.title, author: d.querySelector('[name=author]').value.trim(), dailyGoal: Number(d.querySelector('[name=dailyGoal]').value) || 0, totalGoal: Number(d.querySelector('[name=totalGoal]').value) || 0 }) }],
    });
    if (!r) return;
    Object.assign(p, r); await save(p); viewProject(pid); refresh();
  });
  const menu = $('.menu');
  $$('[data-x]').forEach(b => b.addEventListener('click', async () => {
    menu.open = false;
    const sections = chaptersOf(pid).map(c => ({ title: c.title, blocks: c.content?.blocks || [] }));
    if (!sections.length) { toast('El proyecto no tiene capítulos'); return; }
    const x = b.dataset.x;
    if (x === 'docx') await exportDocx(p.title, sections);
    if (x === 'pdf') printDocument(p.title, sections);
    if (x === 'md') exportMarkdown(p.title, sections);
    if (x === 'epub' || x === 'lib') {
      const blob = await buildEpub({ title: p.title, author: p.author, chapters: sections });
      if (x === 'epub') { const { downloadBlob, safeFilename } = await import('../core.js'); downloadBlob(blob, safeFilename(p.title) + '.epub'); }
      else {
        const now = Date.now();
        const old = live('books').find(bk => bk.fromProject === pid);
        const id = old?.id || db.uid('b');
        await db.putFile(id, blob);
        await db.deleteFile('loc:' + id);
        await save({ ...(old || {}), id, type: 'book', title: p.title, author: p.author, cover: old?.cover || '', percent: old?.percent || 0, cfi: '', highlights: old?.highlights || [], fromProject: pid, created: old?.created || now, pendingUpload: true, driveId: undefined });
        const { syncBooks } = await import('./library.js'); syncBooks();
        toast('Listo: está en tu Biblioteca'); refresh();
      }
    }
  }));
  $('#pDel').addEventListener('click', async () => {
    if (!await confirmDialog('Eliminar proyecto', `Se eliminará «${p.title}» con todos sus capítulos y fichas. Antes, si quieres, exporta una copia.`, { okLabel: 'Eliminar', danger: true })) return;
    for (const c of chaptersOf(pid)) await save({ id: c.id, type: 'chapter', deleted: true, projectId: pid });
    for (const c of cardsOf(pid)) await save({ id: c.id, type: 'card', deleted: true, projectId: pid });
    p.deleted = true; await save(p);
    location.hash = '#/escritura'; refresh();
  });
}

async function editCard(pid, cardId) {
  const c = cardId ? S.cards.get(cardId) : null;
  const r = await dialog({
    title: c ? 'Ficha' : 'Nueva ficha',
    body: `<div class="field-row"><label class="field"><span>Tipo</span><select name="kind">${Object.entries(KIND1).map(([k, v]) => `<option value="${k}"${c?.kind === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field grow"><span>Nombre</span><input name="title" value="${esc(c?.title || '')}"></label></div>
      <label class="field"><span>Descripción y apuntes</span><textarea name="text" rows="7">${esc(c?.text || '')}</textarea></label>`,
    actions: [
      ...(c ? [{ label: 'Eliminar', danger: true, value: 'del' }] : []),
      { label: 'Cancelar', value: null },
      { label: 'Guardar', primary: true, value: (d) => ({ kind: d.querySelector('[name=kind]').value, title: d.querySelector('[name=title]').value.trim() || 'Sin nombre', text: d.querySelector('[name=text]').value }) },
    ],
  });
  if (!r) return;
  if (r === 'del') { c.deleted = true; await save(c); return; }
  await save({ ...(c || { id: db.uid('k'), type: 'card', projectId: pid, created: Date.now() }), ...r });
}

/* ---------- Capítulo ---------- */
function viewChapter(pid, cid) {
  const p = S.projects.get(pid);
  const c = S.chapters.get(cid);
  if (!p || !c || c.deleted) { location.hash = '#/escritura/' + pid; return; }
  const caps = chaptersOf(pid);
  const idx = caps.findIndex(x => x.id === cid);
  const prevC = caps[idx - 1], nextC = caps[idx + 1];

  // Versión automática: una al día, la primera vez que abres el capítulo
  const today = isoDate();
  if ((c.content?.blocks || []).length && (c.versions || []).every(v => isoDate(new Date(v.at)) !== today)) {
    c.versions = [{ at: Date.now(), words: c.words || 0, content: structuredClone(c.content), auto: true }, ...(c.versions || [])].slice(0, 15);
    save(c, { touch: false });
  }

  $('#view').innerHTML = `
    <article class="page note chapter">
      <nav class="crumbs"><a href="#/escritura">${icon('pluma', 14)}Escritura</a><span aria-hidden="true">›</span><a href="#/escritura/${pid}">${esc(p.title)}</a></nav>
      <label class="sr" for="cTitle">Título del capítulo</label>
      <input id="cTitle" class="note-title" value="${esc(c.title)}" placeholder="Título del capítulo">
      <div class="note-meta">
        <label class="meta-field"><span class="sr">Estado</span><select id="cStatus">${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}"${(c.status || 'borrador') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <span class="pill" id="cWords">${fmt(c.words)} palabras</span>
        <span class="pill" id="cToday">Hoy: ${fmt(todayWords(p))}${p.dailyGoal ? ` / ${fmt(p.dailyGoal)}` : ''}</span>
        <span class="grow"></span>
        <button type="button" class="btn sm" id="cFichas">${icon('marca', 14)}Fichas</button>
        <button type="button" class="btn sm" id="cVers">${icon('reloj', 14)}Versiones</button>
        <button type="button" class="btn sm primary" id="cFocus">${icon('expandir', 14)}Concentración</button>
      </div>
      <label class="field synopsis"><span class="sr">Resumen del capítulo</span><input id="cSyn" value="${esc(c.synopsis || '')}" placeholder="Resumen en una línea (opcional)"></label>
      <div id="editor" class="editor prose"></div>
      <nav class="chap-nav">
        ${prevC ? `<a class="btn" href="#/escritura/${pid}/${prevC.id}">${icon('izq', 14)}${esc(prevC.title)}</a>` : '<span></span>'}
        ${nextC ? `<a class="btn" href="#/escritura/${pid}/${nextC.id}">${esc(nextC.title)}${icon('der', 14)}</a>` : '<span></span>'}
      </nav>
      <div class="focus-bar"><span id="fWords"></span><button type="button" class="btn sm" id="fExit">Salir · Esc</button></div>
      <aside class="side-drawer" id="drawer" hidden></aside>
      <div class="saved" id="savedMark"></div>
    </article>`;

  let editor;
  let saving = Promise.resolve();
  const updateCounts = () => {
    $('#cWords').textContent = `${fmt(c.words)} palabras`;
    $('#cToday').textContent = `Hoy: ${fmt(todayWords(p))}${p.dailyGoal ? ` / ${fmt(p.dailyGoal)}` : ''}`;
    $('#fWords').textContent = `${fmt(c.words)} palabras · hoy ${fmt(todayWords(p))}${p.dailyGoal ? ` de ${fmt(p.dailyGoal)}` : ''}`;
  };
  const doSave = async () => {
    try { c.content = await editor.save(); } catch (e) { return; }
    const before = projectWords(pid);
    c.title = $('#cTitle')?.value.trim() || c.title;
    c.synopsis = $('#cSyn')?.value.trim() || '';
    c.words = wordCount(blocksToText(c.content.blocks));
    const after = projectWords(pid);
    if (!p.dayStart || p.dayStart.date !== today) p.dayStart = { date: today, total: before };
    p.log = { ...(p.log || {}), [today]: Math.max(0, after - p.dayStart.total) };
    await save(c); await save(p);
    updateCounts();
    const m = $('#savedMark'); if (m) m.textContent = 'Guardado';
  };
  const queue = debounce(() => { saving = saving.then(doSave); }, 800);
  editor = createEditor('editor', c.content, { onChange: queue, minimal: true, placeholder: 'Empieza a escribir…' });
  updateCounts();
  $('#cTitle').addEventListener('input', queue);
  $('#cSyn').addEventListener('input', queue);
  $('#cStatus').addEventListener('change', async (e) => { c.status = e.target.value; await save(c); });

  const setFocus = (on) => { document.body.classList.toggle('focus-mode', on); if (on) editor.focus?.(true); };
  $('#cFocus').addEventListener('click', () => setFocus(true));
  $('#fExit').addEventListener('click', () => setFocus(false));
  const esc_ = (e) => { if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) setFocus(false); };
  document.addEventListener('keydown', esc_);

  const drawer = $('#drawer');
  const openDrawer = (html) => { drawer.innerHTML = `<div class="panel-head"><span></span><button type="button" class="icon-btn sm" id="dClose" aria-label="Cerrar">${icon('x', 16)}</button></div>${html}`; drawer.hidden = false; $('#dClose').addEventListener('click', () => { drawer.hidden = true; }); };
  $('#cFichas').addEventListener('click', () => {
    const cards = cardsOf(pid);
    openDrawer(`<h2 class="card-title">Fichas</h2>${cards.length ? Object.entries(KINDS).map(([k, label]) => {
      const list = cards.filter(x => x.kind === k);
      return list.length ? `<h3 class="mini">${label}</h3>${list.map(x => `<details class="ficha-d"><summary>${esc(x.title)}</summary><p>${esc(x.text || '').replace(/\n/g, '<br>')}</p></details>`).join('')}` : '';
    }).join('') : `<p class="empty">Este proyecto no tiene fichas. Créalas desde la página del proyecto.</p>`}`);
  });
  const renderVersions = () => {
    const vs = c.versions || [];
    openDrawer(`<h2 class="card-title">Versiones</h2>
      <p class="hint">Se guarda una copia automática al día. Puedes guardar otras cuando quieras.</p>
      <button type="button" class="btn sm primary" id="vSave">${icon('mas', 14)}Guardar versión ahora</button>
      <div class="rows">${vs.map((v, i) => `<div class="row static"><span class="row-main"><span class="row-title">${new Date(v.at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</span><span class="row-snip">${fmt(v.words)} palabras${v.auto ? ' · automática' : ''}${v.label ? ' · ' + esc(v.label) : ''}</span></span><button type="button" class="btn sm" data-restore="${i}">Recuperar</button></div>`).join('') || '<p class="empty">Aún no hay versiones.</p>'}</div>`);
    $('#vSave').addEventListener('click', async () => {
      queue.flush(); await saving;
      const label = await dialog({ title: 'Guardar versión', body: `<label class="field"><span>Nombre (opcional)</span><input name="v" placeholder="Por ejemplo: antes de reescribir el final"></label>`,
        actions: [{ label: 'Cancelar', value: null }, { label: 'Guardar', primary: true, value: (d) => d.querySelector('[name=v]').value.trim() }], onOpen: (d) => d.querySelector('input').focus() });
      if (label === null) return;
      c.versions = [{ at: Date.now(), words: c.words || 0, content: structuredClone(c.content), label }, ...(c.versions || [])].slice(0, 15);
      await save(c); renderVersions(); toast('Versión guardada');
    });
    $$('[data-restore]', drawer).forEach(b => b.addEventListener('click', async () => {
      const v = vs[Number(b.dataset.restore)];
      if (!await confirmDialog('Recuperar versión', 'El texto actual se guarda como otra versión antes de recuperar esta.', { okLabel: 'Recuperar' })) return;
      queue.flush(); await saving;
      c.versions = [{ at: Date.now(), words: c.words || 0, content: structuredClone(c.content), label: 'antes de recuperar' }, ...vs].slice(0, 15);
      c.content = structuredClone(v.content);
      c.words = wordCount(blocksToText(c.content.blocks));
      await save(c);
      await editor.render(c.content.blocks?.length ? c.content : { blocks: [] });
      updateCounts(); renderVersions(); toast('Versión recuperada');
    }));
  };
  $('#cVers').addEventListener('click', renderVersions);

  page.flush = () => queue.flush();
  page.cleanup = async () => {
    document.removeEventListener('keydown', esc_);
    queue.flush(); await saving;
    try { editor.destroy(); } catch (e) {}
  };
}
