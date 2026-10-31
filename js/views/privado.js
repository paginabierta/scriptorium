// Espacio Privado: notas cifradas con tu contraseña antes de salir de este aparato.
import * as db from '../db.js';
import { S, $, $$, esc, icon, save, toast, live, page, settings, debounce, confirmDialog, dialog, hace, refresh } from '../core.js';
import { deriveKey, encryptJSON, decryptJSON, newSalt } from '../crypto.js';
import { createEditor } from '../editor.js';

let KEY = null;
const cache = new Map();          // id → { title, content }
let hiddenAt = 0;
const LOCK_AFTER = 10 * 60 * 1000;

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAt = Date.now();
  else if (KEY && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER) lock();
});

export const isUnlocked = () => !!KEY;
export function lock() {
  KEY = null; cache.clear(); refresh();
  if (location.hash === '#/privado') viewPrivado();
  else if (location.hash.startsWith('#/privado/')) location.hash = '#/privado';
}

async function decryptAll() {
  cache.clear();
  for (const s of live('secrets')) {
    try { cache.set(s.id, await decryptJSON(KEY, s)); } catch (e) { cache.set(s.id, { title: '(no se pudo abrir)', content: { blocks: [] }, broken: true }); }
  }
}

export function viewPrivado(id = '') {
  const cfg = settings().privado;
  const v = $('#view');
  if (!cfg) {
    v.innerHTML = `<div class="page narrow">
      <header class="page-head"><div><h1 class="display">${icon('candado', 28)} Privado</h1><p class="lead">Para lo más delicado: diario espiritual, acompañamientos, notas personales.</p></div></header>
      <section class="card">
        <h2 class="card-title">Crea tu contraseña</h2>
        <p>Todo lo que escribas aquí se cifra en este aparato con tu contraseña antes de guardarse o de ir a Drive. Ni Google ni nadie más puede leerlo.</p>
        <p class="warn-box"><strong>Importante:</strong> si olvidas la contraseña, no hay forma de recuperar estas notas. Anótala en un lugar seguro.</p>
        <form id="setupForm" class="stack">
          <label class="field"><span>Contraseña (mínimo 8 caracteres)</span><input type="password" id="pw1" autocomplete="new-password" minlength="8" required></label>
          <label class="field"><span>Repítela</span><input type="password" id="pw2" autocomplete="new-password" required></label>
          <button type="submit" class="btn primary">${icon('candado', 14)}Crear espacio privado</button>
        </form>
        <p class="hint">Consejo: usa iniciales o seudónimos cuando escribas sobre otras personas.</p>
      </section></div>`;
    $('#setupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const a = $('#pw1').value, b = $('#pw2').value;
      if (a.length < 8) { toast('La contraseña debe tener al menos 8 caracteres'); return; }
      if (a !== b) { toast('Las contraseñas no coinciden'); return; }
      const salt = newSalt();
      KEY = await deriveKey(a, salt);
      const st = settings();
      st.privado = { salt, check: await encryptJSON(KEY, { ok: true }) };
      await save(st);
      toast('Espacio privado listo'); refresh();
      viewPrivado();
    });
    return;
  }
  if (!KEY) {
    v.innerHTML = `<div class="page narrow">
      <header class="page-head"><div><h1 class="display">${icon('candado', 28)} Privado</h1><p class="lead">Escribe tu contraseña para abrir tus notas privadas.</p></div></header>
      <section class="card">
        <form id="unlockForm" class="inline-form">
          <label class="sr" for="pw">Contraseña</label>
          <input type="password" id="pw" autocomplete="current-password" placeholder="Contraseña" required>
          <button type="submit" class="btn primary">${icon('abierto', 14)}Abrir</button>
        </form>
        <p class="hint">Se vuelve a cerrar si dejas la app más de 10 minutos.</p>
      </section></div>`;
    $('#pw').focus();
    $('#unlockForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button'); btn.disabled = true;
      try {
        const k = await deriveKey($('#pw').value, cfg.salt);
        await decryptJSON(k, cfg.check);
        KEY = k;
        await decryptAll();
        refresh();
        viewPrivado(id);
      } catch (err) { toast('Contraseña incorrecta'); btn.disabled = false; $('#pw').select(); }
    });
    return;
  }
  if (id) return viewSecret(id);

  const items = live('secrets').map(s => ({ s, d: cache.get(s.id) })).filter(x => x.d).sort((a, b) => b.s.updated - a.s.updated);
  v.innerHTML = `<div class="page narrow">
    <header class="page-head">
      <div><h1 class="display">${icon('abierto', 28)} Privado</h1><p class="lead">Cifrado con tu contraseña. Solo tú puedes leerlo.</p></div>
      <div class="head-actions">
        <button type="button" class="btn" id="lockBtn">${icon('candado', 14)}Cerrar</button>
        <button type="button" class="btn primary" id="newSecret">${icon('mas', 14)}Nueva nota privada</button>
      </div>
    </header>
    <section class="card">${items.length ? `<div class="rows">${items.map(x => `<a class="row" href="#/privado/${x.s.id}"><span class="row-main"><span class="row-title">${esc(x.d.title || 'Sin título')}</span></span><span class="row-meta">${hace(x.s.updated)}</span></a>`).join('')}</div>` : '<p class="empty">Aún no hay notas privadas.</p>'}</section>
    <p class="hint center"><button type="button" class="link-btn" id="chgPw">Cambiar contraseña</button></p>
  </div>`;
  $('#lockBtn').addEventListener('click', lock);
  $('#newSecret').addEventListener('click', async () => {
    const id = db.uid('x');
    const d = { title: '', content: { blocks: [] } };
    cache.set(id, d);
    await save({ id, type: 'secret', ...(await encryptJSON(KEY, d)), created: Date.now() });
    location.hash = '#/privado/' + id;
  });
  $('#chgPw').addEventListener('click', changePassword);
}

function viewSecret(id) {
  const s = S.secrets.get(id);
  const d = cache.get(id);
  if (!s || s.deleted || !d) { location.hash = '#/privado'; return; }
  $('#view').innerHTML = `<article class="page note">
    <nav class="crumbs"><a href="#/privado">${icon('abierto', 14)}Privado</a></nav>
    <label class="sr" for="sTitle">Título</label>
    <input id="sTitle" class="note-title" value="${esc(d.title)}" placeholder="Sin título">
    <div class="note-meta"><span class="hint">${icon('candado', 13)} Se guarda cifrado</span><span class="grow"></span>
      <button type="button" class="btn sm danger" id="sDel">${icon('papelera', 14)}Eliminar</button></div>
    <div id="editor" class="editor"></div>
    <div class="saved" id="savedMark"></div>
  </article>`;
  let saving = Promise.resolve();
  const doSave = async () => {
    if (!KEY) return;
    try { d.content = await editor.save(); } catch (e) { return; }
    d.title = $('#sTitle')?.value.trim() ?? d.title;
    Object.assign(s, await encryptJSON(KEY, d));
    await save(s);
    const m = $('#savedMark'); if (m) m.textContent = 'Guardado y cifrado';
  };
  const queue = debounce(() => { saving = saving.then(doSave); }, 800);
  const editor = createEditor('editor', d.content, { onChange: queue });
  $('#sTitle').addEventListener('input', queue);
  if (!d.title) setTimeout(() => $('#sTitle')?.focus(), 60);
  page.flush = () => queue.flush();
  page.cleanup = async () => { queue.flush(); await saving; try { editor.destroy(); } catch (e) {} };
  $('#sDel').addEventListener('click', async () => {
    if (!await confirmDialog('Eliminar nota privada', 'Se borrará para siempre. No hay papelera para las notas privadas.', { okLabel: 'Eliminar', danger: true })) return;
    queue.cancel();
    await save({ id, type: 'secret', deleted: true });
    cache.delete(id);
    page.cleanup = async () => { try { editor.destroy(); } catch (e) {} };
    location.hash = '#/privado';
  });
}

async function changePassword() {
  const r = await dialog({
    title: 'Cambiar contraseña',
    body: `<label class="field"><span>Contraseña nueva (mínimo 8)</span><input type="password" name="a" autocomplete="new-password"></label>
      <label class="field"><span>Repítela</span><input type="password" name="b" autocomplete="new-password"></label>`,
    actions: [{ label: 'Cancelar', value: null }, { label: 'Cambiar', primary: true, value: (dl) => {
      const a = dl.querySelector('[name=a]').value, b = dl.querySelector('[name=b]').value;
      if (a.length < 8) { toast('Mínimo 8 caracteres'); return false; }
      if (a !== b) { toast('No coinciden'); return false; }
      return a;
    } }],
  });
  if (!r) return;
  await decryptAll();
  const salt = newSalt();
  const k = await deriveKey(r, salt);
  for (const s of live('secrets')) {
    const d = cache.get(s.id);
    if (!d || d.broken) continue;
    Object.assign(s, await encryptJSON(k, d));
    await save(s);
  }
  const st = settings();
  st.privado = { salt, check: await encryptJSON(k, { ok: true }) };
  await save(st);
  KEY = k;
  toast('Contraseña cambiada');
}
