// Ajustes.
import * as db from '../db.js';
import * as drive from '../drive.js';
import * as sync from '../sync.js';
import { $, esc, icon, toast, hace, save, settings, loadAll, refresh, confirmDialog, downloadBlob, isoDate } from '../core.js';
import { APP_VERSION } from '../config.js';
import * as gcal from '../gcal.js';

export function viewSettings({ runSync }) {
  const acc = drive.account();
  const conf = drive.isConfigured();
  const con = drive.isConnected();
  const st = settings();
  $('#view').innerHTML = `
    <div class="page narrow">
      <header class="page-head"><div><h1 class="display">Ajustes</h1></div></header>

      <section class="card">
        <h2 class="card-title">Tu nombre</h2>
        <p class="hint">Así te saluda la app en «Hoy». Déjalo vacío si no quieres saludo con nombre.</p>
        <form id="nameForm" class="inline-form">
          <label class="sr" for="userName">Tu nombre</label>
          <input id="userName" value="${esc(st.userName || '')}" placeholder="Por ejemplo: padre Herwin" autocomplete="off">
          <button type="submit" class="btn">Guardar</button>
        </form>
      </section>

      <section class="card">
        <h2 class="card-title">Google Drive</h2>
        ${!conf ? `<p class="hint">Falta el ID de cliente de Google en <code>js/config.js</code>. Mientras tanto, todo se guarda en este aparato.</p>`
          : con ? `<p>Conectado como <strong>${esc(acc.email || acc.name || 'tu cuenta')}</strong>.</p>
              <p class="hint">Tus notas están en la carpeta «Scriptorium» de tu Drive, y tus libros en «Scriptorium/Libros». ${sync.state.lastSync ? 'Última sincronización: ' + hace(sync.state.lastSync) + '.' : ''}</p>
              <div class="btn-row"><button type="button" class="btn primary" id="syncNow">Sincronizar ahora</button><button type="button" class="btn" id="disconnect">Desconectar</button></div>`
          : `<p class="hint">Conecta tu cuenta para tener tus notas en el computador, la tablet y el teléfono. La app solo puede ver los archivos que ella misma crea en tu Drive.</p>
             <div class="btn-row"><button type="button" class="btn primary" id="connect">Conectar con Google</button></div>`}
      </section>

      <section class="card">
        <h2 class="card-title">Google Calendar</h2>
        <div id="calSettings">${!con ? '<p class="hint">Primero conecta tu cuenta de Google (arriba).</p>'
          : gcal.needsPermission() ? `<p class="hint">Scriptorium puede mostrar tu agenda en «Hoy» y en el Calendario, y crear o modificar eventos desde tus notas.</p><div class="btn-row"><button type="button" class="btn primary" id="calGrant">${icon('calendario', 14)}Conectar Google Calendar</button></div>`
          : '<p class="hint">Cargando tus calendarios…</p>'}</div>
      </section>

      <section class="card">
        <h2 class="card-title">Referencias APA</h2>
        <p class="hint">Entre el penúltimo y el último autor, la adaptación al español de APA 7 usa «y». Si tu universidad pide «&amp;», cámbialo aquí.</p>
        <div class="seg" role="group" aria-label="Conector entre autores">
          <button type="button" data-conn="y" class="${(st.apaConnector || 'y') === 'y' ? 'on' : ''}">Pérez, A. y Gómez, B.</button>
          <button type="button" data-conn="&" class="${st.apaConnector === '&' ? 'on' : ''}">Pérez, A., &amp; Gómez, B.</button>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Plantillas</h2>
        <p class="hint">Homilía, guion radial, sesión Merrill, acta, catequesis, ficha de lectura… Cámbialas o crea las tuyas.</p>
        <div class="btn-row"><a class="btn" href="#/plantillas">${icon('plantilla', 14)}Editar plantillas</a></div>
      </section>

      <section class="card">
        <h2 class="card-title">Copia de seguridad</h2>
        <p class="hint">Descarga en un archivo todas tus notas, espacios, plantillas, escritos y datos de libros (los EPUB no van incluidos; ya están en tu Drive). Las notas privadas van cifradas.</p>
        <div class="btn-row">
          <button type="button" class="btn" id="exportBtn">${icon('descargar', 14)}Descargar copia</button>
          <label class="btn">Cargar copia<input type="file" id="importFile" accept="application/json,.json" hidden></label>
        </div>
      </section>

      <p class="hint center">Scriptorium ${APP_VERSION}</p>
    </div>`;

  $('#calGrant')?.addEventListener('click', async () => {
    try { await gcal.grantAccess(); await gcal.listCalendars(); toast('Calendario conectado'); viewSettings({ runSync }); refresh(); }
    catch (e) { toast(e.message); }
  });
  if (con && gcal.isReady()) renderCalSettings();

  $('#nameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    st.userName = $('#userName').value.trim();
    await save(st); toast('Guardado');
  });
  document.querySelectorAll('[data-conn]').forEach(b => b.addEventListener('click', async () => {
    st.apaConnector = b.dataset.conn; await save(st);
    document.querySelectorAll('[data-conn]').forEach(x => x.classList.toggle('on', x === b));
    toast('Formato de referencias actualizado');
  }));
  $('#connect')?.addEventListener('click', async () => {
    try { await drive.signIn(); toast('Conectado con Google'); await runSync(); viewSettings({ runSync }); refresh(); }
    catch (e) { toast(e.message); }
  });
  $('#syncNow')?.addEventListener('click', async () => {
    try { if (!drive.hasValidToken()) await drive.signIn({ silent: true }); await runSync(); toast(sync.state.status === 'ok' ? 'Sincronizado' : sync.state.message); viewSettings({ runSync }); }
    catch (e) { toast(e.message); }
  });
  $('#disconnect')?.addEventListener('click', async () => {
    if (!await confirmDialog('Desconectar Google Drive', 'Tus notas siguen en este aparato y en tu Drive. Puedes volver a conectar cuando quieras.', { okLabel: 'Desconectar' })) return;
    drive.signOut(); sync.resetSyncState(); viewSettings({ runSync }); refresh();
  });
  $('#exportBtn').addEventListener('click', async () => {
    const data = { app: 'Scriptorium', version: 2, savedAt: Date.now(), records: await db.getAll() };
    downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `scriptorium-copia-${isoDate()}.json`);
  });
  $('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.records)) throw new Error('El archivo no es una copia de Scriptorium');
      if (!await confirmDialog('Cargar copia', `La copia tiene ${data.records.length} registros. Se unirán con lo que ya tienes; en cada registro gana la versión más reciente.`, { okLabel: 'Cargar' })) return;
      const { merged } = sync.merge(await db.getAll(), data.records, Infinity);
      await db.putMany(merged);
      await loadAll(); sync.schedule(500);
      toast('Copia cargada'); refresh();
    } catch (err) { toast(err.message); }
  });
}

async function renderCalSettings(force = false) {
  const box = $('#calSettings');
  if (!box) return;
  let cals = gcal.cachedCalendars();
  try { if (force || !cals.length) cals = await gcal.listCalendars(); } catch (e) {
    if (!cals.length) { box.innerHTML = `<p class="hint">${e.code === 'SCOPE' ? 'Falta el permiso del calendario.' : 'No pude leer tus calendarios ahora.'}</p>`; return; }
  }
  if (!$('#calSettings')) return;
  const sel = gcal.selectedIds();
  const def = gcal.defaultCalendar();
  box.innerHTML = `<p class="hint">Elige qué calendarios se ven en Scriptorium y en cuál se crean los eventos nuevos.</p>
    <div class="cal-list">${cals.map(c => `<label class="cal-opt"><input type="checkbox" value="${esc(c.id)}" ${sel.includes(c.id) || (c.primary && sel.includes('primary')) ? 'checked' : ''}><span class="dot" style="background:${esc(c.color || '#3E4C8A')}"></span><span class="grow">${esc(c.name)}${c.primary ? ' <span class="muted">(principal)</span>' : ''}</span></label>`).join('')}</div>
    <label class="field"><span>Los eventos nuevos van a</span><select id="calDef">${cals.filter(c => c.canWrite).map(c => `<option value="${esc(c.id)}" ${c.id === def || (c.primary && def === 'primary') ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <div class="btn-row"><button type="button" class="btn sm" id="calReload">Actualizar lista</button></div>`;
  box.querySelectorAll('.cal-opt input').forEach(cb => cb.addEventListener('change', () => {
    const ids = [...box.querySelectorAll('.cal-opt input:checked')].map(x => x.value);
    gcal.setSelected(ids.length ? ids : ['primary']);
    toast('Listo');
  }));
  $('#calDef').addEventListener('change', (e) => { gcal.setDefault(e.target.value); toast('Listo'); });
  $('#calReload').addEventListener('click', () => renderCalSettings(true));
}
