// Google Calendar: ver, crear y modificar eventos, y enlazarlos con notas.
import * as drive from './drive.js';
import { isoDate, parseISO } from './core.js';

const BASE = 'https://www.googleapis.com/calendar/v3';
const LS_SEL = 'scr.cal.selected';
const LS_DEF = 'scr.cal.default';
const LS_LIST = 'scr.cal.list';
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota';

export function isReady() { return drive.isConfigured() && drive.isConnected() && drive.hasScope(drive.SCOPE_CAL); }
export function needsPermission() { return drive.isConfigured() && drive.isConnected() && !drive.hasScope(drive.SCOPE_CAL); }

export async function grantAccess() { await drive.signIn({ consent: true }); }

async function call(path, opts = {}) {
  if (!drive.hasValidToken()) await drive.signIn({ silent: true });
  return drive.api(BASE + path, { ...opts, calendar: true });
}

/* ---------- Calendarios ---------- */
export function cachedCalendars() { try { return JSON.parse(localStorage.getItem(LS_LIST) || '[]'); } catch (e) { return []; } }

export async function listCalendars() {
  const r = await call('/users/me/calendarList?minAccessRole=reader&fields=items(id,summary,summaryOverride,backgroundColor,primary,accessRole,selected)');
  const items = (r.items || []).map(c => ({ id: c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor, primary: !!c.primary, canWrite: ['owner', 'writer'].includes(c.accessRole), selected: c.selected !== false }));
  localStorage.setItem(LS_LIST, JSON.stringify(items));
  return items;
}

export function selectedIds() {
  const saved = localStorage.getItem(LS_SEL);
  if (saved) { try { return JSON.parse(saved); } catch (e) {} }
  const list = cachedCalendars();
  return list.length ? list.filter(c => c.primary || c.selected).map(c => c.id) : ['primary'];
}
export function setSelected(ids) { localStorage.setItem(LS_SEL, JSON.stringify(ids)); cache.clear(); }
export function defaultCalendar() { return localStorage.getItem(LS_DEF) || 'primary'; }
export function setDefault(id) { localStorage.setItem(LS_DEF, id); }

/* ---------- Eventos ---------- */
const cache = new Map();   // "desde|hasta" → { at, events }

function normalize(e, cal) {
  const allDay = !!e.start?.date;
  const start = allDay ? parseISO(e.start.date) : new Date(e.start?.dateTime);
  const end = allDay ? parseISO(e.end.date) : new Date(e.end?.dateTime);
  return {
    id: e.id, calendarId: cal.id, calendarName: cal.name, color: cal.color || '#3E4C8A', canWrite: cal.canWrite !== false,
    summary: e.summary || '(sin título)', location: e.location || '', description: e.description || '',
    allDay, start, end, htmlLink: e.htmlLink, noteId: e.extendedProperties?.private?.scrNote || '',
  };
}

export async function listEvents(from, to, { force = false } = {}) {
  const key = `${from.toISOString()}|${to.toISOString()}|${selectedIds().join(',')}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.events;
  let cals = cachedCalendars();
  if (!cals.length) { try { cals = await listCalendars(); } catch (e) { cals = [{ id: 'primary', name: 'Principal', primary: true, canWrite: true }]; } }
  const ids = selectedIds();
  const use = cals.filter(c => ids.includes(c.id) || (c.primary && ids.includes('primary')));
  if (!use.length) use.push({ id: 'primary', name: 'Principal', canWrite: true });
  const all = [];
  await Promise.all(use.map(async cal => {
    const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
    const r = await call(`/calendars/${encodeURIComponent(cal.id)}/events?${q}`);
    (r.items || []).filter(e => e.status !== 'cancelled').forEach(e => all.push(normalize(e, cal)));
  }));
  all.sort((a, b) => a.start - b.start);
  cache.set(key, { at: Date.now(), events: all });
  return all;
}

export function eventsOnDay(events, iso) {
  const day = parseISO(iso), next = new Date(day); next.setDate(next.getDate() + 1);
  return events.filter(e => e.start < next && e.end > day);
}

// d: { summary, date (YYYY-MM-DD), allDay, startTime 'HH:MM', endTime, location, description, noteId }
function body(d) {
  const b = { summary: d.summary, location: d.location || '', description: d.description || '' };
  if (d.allDay) {
    const end = parseISO(d.date); end.setDate(end.getDate() + 1);
    b.start = { date: d.date }; b.end = { date: isoDate(end) };
  } else {
    const [sh, sm] = (d.startTime || '09:00').split(':').map(Number);
    const [eh, em] = (d.endTime || '10:00').split(':').map(Number);
    const s = parseISO(d.date); s.setHours(sh, sm, 0, 0);
    const e = parseISO(d.date); e.setHours(eh, em, 0, 0);
    if (e <= s) e.setTime(s.getTime() + 60 * 60 * 1000);
    b.start = { dateTime: s.toISOString(), timeZone: TZ }; b.end = { dateTime: e.toISOString(), timeZone: TZ };
  }
  if (d.noteId !== undefined) b.extendedProperties = { private: { scrNote: d.noteId || '' } };
  return b;
}

export async function createEvent(calendarId, d) {
  const r = await call(`/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(d)) });
  cache.clear();
  return { id: r.id, calendarId, htmlLink: r.htmlLink };
}

export async function updateEvent(calendarId, id, d) {
  const r = await call(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(d)) });
  cache.clear();
  return { id: r.id, calendarId, htmlLink: r.htmlLink };
}

export async function deleteEvent(calendarId, id) {
  await call(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
  cache.clear();
}

export async function getEvent(calendarId, id) {
  const r = await call(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`);
  const cal = cachedCalendars().find(c => c.id === calendarId) || { id: calendarId, name: '' };
  return normalize(r, cal);
}

export function hhmm(d) { return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
export function timeLabel(e) {
  if (e.allDay) return 'Todo el día';
  const f = (d) => d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  return `${f(e.start)} – ${f(e.end)}`;
}
