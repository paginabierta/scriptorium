// Integración visual con Google Calendar: formulario de eventos, agenda del día y enlaces con notas.
import * as gcal from '../gcal.js';
import { S, $, $$, esc, icon, save, toast, dialog, confirmDialog, isoDate, parseISO, live } from '../core.js';

const noteUrl = (id) => `${location.origin}${location.pathname}#/nota/${id}`;

export function permissionHtml() {
  if (gcal.isReady()) return '';
  if (gcal.needsPermission()) return `<p class="hint">Para ver y crear eventos, Scriptorium necesita permiso para usar tu Google Calendar.</p><div class="btn-row"><button type="button" class="btn" data-gcal-grant>${icon('calendario', 14)}Conectar Google Calendar</button></div>`;
  return `<p class="hint">Conecta tu cuenta de Google en <a href="#/ajustes">Ajustes</a> para ver tu agenda aquí.</p>`;
}
export function bindPermission(root, after) {
  $$('[data-gcal-grant]', root).forEach(b => b.addEventListener('click', async () => {
    try { await gcal.grantAccess(); try { await gcal.listCalendars(); } catch (e) {} toast('Calendario conectado'); after?.(); }
    catch (e) { toast(e.message); }
  }));
}

/* ---------- Formulario de evento ---------- */
// opts: { existing (evento normalizado), date, title, noteId, description }
export async function eventDialog(opts = {}) {
  const ex = opts.existing;
  let cals = gcal.cachedCalendars().filter(c => c.canWrite);
  if (!cals.length) { try { cals = (await gcal.listCalendars()).filter(c => c.canWrite); } catch (e) { cals = [{ id: 'primary', name: 'Principal' }]; } }
  const date = ex ? isoDate(ex.start) : (opts.date || isoDate());
  const start = ex && !ex.allDay ? gcal.hhmm(ex.start) : (opts.startTime || '09:00');
  const end = ex && !ex.allDay ? gcal.hhmm(ex.end) : (opts.endTime || '10:00');
  const calId = ex?.calendarId || gcal.defaultCalendar();
  const result = await dialog({
    title: ex ? 'Editar evento' : 'Nuevo evento',
    body: `<label class="field"><span>Título</span><input name="summary" value="${esc(ex?.summary || opts.title || '')}" autocomplete="off"></label>
      <div class="field-row">
        <label class="field"><span>Fecha</span><input type="date" name="date" value="${esc(date)}"></label>
        <label class="field check"><input type="checkbox" name="allDay" ${ex?.allDay ? 'checked' : ''}><span>Todo el día</span></label>
      </div>
      <div class="field-row times">
        <label class="field"><span>Empieza</span><input type="time" name="startTime" value="${esc(start)}"></label>
        <label class="field"><span>Termina</span><input type="time" name="endTime" value="${esc(end)}"></label>
      </div>
      <label class="field"><span>Lugar</span><input name="location" value="${esc(ex?.location || '')}" placeholder="Por ejemplo: Vereda La Palma, salón comunal"></label>
      <label class="field"><span>Descripción</span><textarea name="description" rows="3">${esc(ex ? ex.description.replace(/\n?Nota en Scriptorium: \S+/, '') : (opts.description || ''))}</textarea></label>
      ${ex ? '' : `<label class="field"><span>Calendario</span><select name="cal">${cals.map(c => `<option value="${esc(c.id)}"${c.id === calId || (c.primary && calId === 'primary') ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`}
      ${opts.noteId ? `<p class="hint">${icon('enlace', 12)} El evento quedará enlazado a esta nota.</p>` : ''}`,
    actions: [
      ...(ex && ex.canWrite ? [{ label: 'Eliminar evento', danger: true, value: 'delete' }] : []),
      { label: 'Cancelar', value: null },
      { label: ex ? 'Guardar cambios' : 'Crear evento', primary: true, value: (d) => {
        const g = (n) => d.querySelector(`[name=${n}]`);
        const summary = g('summary').value.trim();
        if (!summary) { toast('Ponle un título al evento'); return false; }
        return { summary, date: g('date').value || date, allDay: g('allDay').checked, startTime: g('startTime').value, endTime: g('endTime').value,
          location: g('location').value.trim(), description: g('description').value.trim(), cal: g('cal')?.value };
      } },
    ],
    onOpen: (d) => {
      const allDay = d.querySelector('[name=allDay]'), times = d.querySelector('.times');
      const sync = () => { times.hidden = allDay.checked; }; allDay.addEventListener('change', sync); sync();
      const st = d.querySelector('[name=startTime]'), en = d.querySelector('[name=endTime]');
      st.addEventListener('change', () => { // mantener la duración
        const [h, m] = st.value.split(':').map(Number); const t = new Date(2000, 0, 1, h + 1, m); en.value = gcal.hhmm(t);
      });
      if (!ex) d.querySelector('[name=summary]').focus();
    },
  });
  if (!result) return null;
  const noteId = opts.noteId ?? ex?.noteId;
  try {
    if (result === 'delete') {
      if (!await confirmDialog('Eliminar evento', `Se eliminará «${ex.summary}» de tu Google Calendar.`, { okLabel: 'Eliminar', danger: true })) return null;
      await gcal.deleteEvent(ex.calendarId, ex.id);
      toast('Evento eliminado');
      return { action: 'deleted', calendarId: ex.calendarId, id: ex.id };
    }
    const data = { ...result, description: noteId ? `${result.description}\nNota en Scriptorium: ${noteUrl(noteId)}`.trim() : result.description };
    if (noteId) data.noteId = noteId;
    const ref = ex ? await gcal.updateEvent(ex.calendarId, ex.id, data) : await gcal.createEvent(result.cal || gcal.defaultCalendar(), data);
    toast(ex ? 'Evento actualizado' : 'Evento creado en tu Google Calendar');
    return { action: 'saved', ...ref, date: result.date, allDay: result.allDay, startTime: result.startTime, summary: result.summary };
  } catch (e) {
    toast(e.code === 'SCOPE' ? 'Falta el permiso del calendario: conéctalo en Ajustes' : e.message);
    return null;
  }
}

/* ---------- Enlazar evento ↔ nota ---------- */
export async function scheduleNote(note) {
  if (note.event) {
    let ex = null;
    try { ex = await gcal.getEvent(note.event.calendarId, note.event.id); } catch (e) { if (e.status === 404 || e.status === 410) { delete note.event; await save(note); toast('El evento ya no existe en tu calendario'); return; } toast(e.message); return; }
    const r = await eventDialog({ existing: ex, noteId: note.id });
    if (!r) return;
    if (r.action === 'deleted') delete note.event;
    else note.event = { calendarId: r.calendarId, id: r.id, htmlLink: r.htmlLink, date: r.date, allDay: r.allDay, time: r.allDay ? '' : r.startTime, summary: r.summary };
    await save(note);
    return;
  }
  const r = await eventDialog({ date: note.fecha || isoDate(), title: note.title, noteId: note.id });
  if (r?.action === 'saved') {
    note.event = { calendarId: r.calendarId, id: r.id, htmlLink: r.htmlLink, date: r.date, allDay: r.allDay, time: r.allDay ? '' : r.startTime, summary: r.summary };
    if (!note.fecha) note.fecha = r.date;
    await save(note);
  }
}

export function noteEventChip(note) {
  const e = note.event;
  if (!e) return '';
  const d = parseISO(e.date);
  const when = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}${e.time ? ' · ' + e.time : ''}`;
  return `<div class="event-chip">${icon('calendario', 14)}<span>En tu agenda: <strong>${esc(e.summary || '')}</strong> · ${esc(when)}</span>
    <button type="button" class="btn sm" data-ev-edit>Editar</button>${e.htmlLink ? `<a class="btn sm" href="${esc(e.htmlLink)}" target="_blank" rel="noopener">Abrir en Google</a>` : ''}</div>`;
}

export function noteForEvent(ev) {
  if (ev.noteId && S.notes.get(ev.noteId) && !S.notes.get(ev.noteId).deleted) return S.notes.get(ev.noteId);
  return live('notes').find(n => n.event?.id === ev.id);
}

/* ---------- Lista de eventos (Hoy y calendario) ---------- */
export function eventRows(events) {
  return events.map((e, i) => {
    const n = noteForEvent(e);
    return `<div class="ev-row">
      <span class="ev-bar" style="background:${esc(e.color)}"></span>
      <span class="ev-main"><span class="ev-time">${esc(gcal.timeLabel(e))}</span><span class="ev-title">${esc(e.summary)}</span>${e.location ? `<span class="ev-loc">${esc(e.location)}</span>` : ''}</span>
      <span class="ev-actions">
        ${n ? `<a class="btn sm" href="#/nota/${n.id}">${icon('pagina', 13)}Nota</a>` : `<button type="button" class="btn sm" data-ev-note="${i}">${icon('mas', 13)}Nota</button>`}
        ${e.canWrite ? `<button type="button" class="icon-btn sm" data-ev-edit="${i}" aria-label="Editar ${esc(e.summary)}">${icon('lapiz', 14)}</button>` : ''}
      </span>
    </div>`;
  }).join('');
}

// Conecta los botones de una lista de eventos. onChange se llama tras crear notas o editar eventos.
export function bindEventRows(root, events, { onChange, createNote }) {
  $$('[data-ev-edit]', root).forEach(b => b.addEventListener('click', async () => {
    const ev = events[Number(b.dataset.evEdit)];
    const r = await eventDialog({ existing: ev, noteId: noteForEvent(ev)?.id });
    if (r) {
      const n = noteForEvent(ev);
      if (n) { if (r.action === 'deleted') delete n.event; else n.event = { ...n.event, date: r.date, allDay: r.allDay, time: r.allDay ? '' : r.startTime, summary: r.summary }; await save(n); }
      onChange?.();
    }
  }));
  $$('[data-ev-note]', root).forEach(b => b.addEventListener('click', async () => {
    const ev = events[Number(b.dataset.evNote)];
    await createNote({
      title: ev.summary, fecha: isoDate(ev.start), ask: true,
      extra: { event: { calendarId: ev.calendarId, id: ev.id, htmlLink: ev.htmlLink, date: isoDate(ev.start), allDay: ev.allDay, time: ev.allDay ? '' : gcal.hhmm(ev.start), summary: ev.summary } },
    });
  }));
}
