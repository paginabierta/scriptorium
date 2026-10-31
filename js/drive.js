// Conexión con Google (inicio de sesión) y Google Drive (copia en la nube).
// Permiso usado: drive.file → la app solo ve los archivos que ella misma crea.

import { GOOGLE_CLIENT_ID, DRIVE_FOLDER_NAME, DRIVE_DATA_FILE } from './config.js';

// Permisos: drive.file (solo los archivos que crea la app) + eventos de Google Calendar.
const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
export const SCOPE_CAL = 'https://www.googleapis.com/auth/calendar.events';
const SCOPE_CAL_LIST = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const SCOPE = [SCOPE_DRIVE, SCOPE_CAL, SCOPE_CAL_LIST].join(' ');
const LS = {
  token: 'scr.token', expiry: 'scr.tokenExpiry', connected: 'scr.connected',
  email: 'scr.email', name: 'scr.name', folderId: 'scr.folderId', fileId: 'scr.fileId', scopes: 'scr.scopes'
};
export function hasScope(scope) { return (localStorage.getItem(LS.scopes) || '').split(' ').includes(scope); }

let tokenClient = null;
let gisPromise = null;

export function isConfigured() { return !!GOOGLE_CLIENT_ID; }
export function isConnected() { return localStorage.getItem(LS.connected) === '1'; }
export function account() {
  return { email: localStorage.getItem(LS.email) || '', name: localStorage.getItem(LS.name) || '' };
}

function validToken() {
  const t = localStorage.getItem(LS.token);
  const exp = Number(localStorage.getItem(LS.expiry) || 0);
  return t && Date.now() < exp - 60000 ? t : null;
}
export function hasValidToken() { return !!validToken(); }

function loadGIS() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; reject(new Error('No se pudo cargar el inicio de sesión de Google. ¿Hay internet?')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

// Pide (o renueva) el permiso. Debe llamarse desde un toque o clic del usuario.
export async function signIn({ silent = false, consent = false } = {}) {
  if (!isConfigured()) throw new Error('Falta el ID de cliente de Google en js/config.js');
  await loadGIS();
  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      hint: localStorage.getItem(LS.email) || undefined,
      include_granted_scopes: true,
      callback: async (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        localStorage.setItem(LS.token, resp.access_token);
        localStorage.setItem(LS.expiry, String(Date.now() + Number(resp.expires_in || 3600) * 1000));
        localStorage.setItem(LS.connected, '1');
        if (resp.scope) localStorage.setItem(LS.scopes, resp.scope);
        try {
          const about = await api('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)');
          localStorage.setItem(LS.email, about.user.emailAddress || '');
          localStorage.setItem(LS.name, about.user.displayName || '');
        } catch (e) { /* no es grave */ }
        resolve();
      },
      error_callback: (err) => reject(new Error(err?.message || 'Se cerró la ventana de Google')),
    });
    tokenClient.requestAccessToken({ prompt: consent ? 'consent' : (silent || isConnected() ? '' : 'consent') });
  });
}

export function signOut() {
  const t = localStorage.getItem(LS.token);
  if (t && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t, () => {});
  Object.values(LS).forEach(k => localStorage.removeItem(k));
  Object.keys(localStorage).filter(k => k.startsWith('scr.sub.')).forEach(k => localStorage.removeItem(k));
}

export async function api(url, opts = {}) {
  const token = validToken();
  if (!token) { const e = new Error('Sesión de Google vencida'); e.code = 'AUTH'; throw e; }
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (res.status === 401) {
    localStorage.removeItem(LS.token);
    const e = new Error('Sesión de Google vencida'); e.code = 'AUTH'; throw e;
  }
  if (res.status === 403 && opts.calendar) { const e = new Error('Falta el permiso del calendario'); e.code = 'SCOPE'; throw e; }
  if (!res.ok) { const e = new Error(`${opts.calendar ? 'Google Calendar' : 'Drive'} respondió ${res.status}`); e.status = res.status; throw e; }
  if (res.status === 204) return null;
  if (opts.blob) return res.blob();
  const type = res.headers.get('content-type') || '';
  return type.includes('application/json') ? res.json() : res.text();
}

async function ensureFolder() {
  let id = localStorage.getItem(LS.folderId);
  if (id) return id;
  const q = encodeURIComponent(`name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
  if (found.files?.length) id = found.files[0].id;
  else {
    const created = await api('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    });
    id = created.id;
  }
  localStorage.setItem(LS.folderId, id);
  return id;
}

async function findDataFile(folderId) {
  let id = localStorage.getItem(LS.fileId);
  if (id) return id;
  const q = encodeURIComponent(`name='${DRIVE_DATA_FILE}' and '${folderId}' in parents and trashed=false`);
  const found = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
  if (found.files?.length) { id = found.files[0].id; localStorage.setItem(LS.fileId, id); return id; }
  return null;
}

// Descarga los datos guardados en Drive (o null si aún no hay archivo).
export async function download() {
  const folderId = await ensureFolder();
  const fileId = await findDataFile(folderId);
  if (!fileId) return null;
  try {
    const text = await api(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    return typeof text === 'string' ? JSON.parse(text) : text;
  } catch (e) {
    if (String(e.message).includes('404')) { localStorage.removeItem(LS.fileId); return null; }
    throw e;
  }
}

// Sube los datos completos a Drive (crea el archivo la primera vez).
export async function upload(data) {
  const folderId = await ensureFolder();
  let fileId = await findDataFile(folderId);
  const body = JSON.stringify(data);
  if (!fileId) {
    const created = await api('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_DATA_FILE, parents: [folderId], mimeType: 'application/json' })
    });
    fileId = created.id;
    localStorage.setItem(LS.fileId, fileId);
  }
  await api(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body
  });
}

// ---------- Archivos aparte (libros EPUB) en la subcarpeta "Libros" ----------
async function ensureSubfolder(name) {
  const key = 'scr.sub.' + name;
  let id = localStorage.getItem(key);
  if (id) return id;
  const parent = await ensureFolder();
  const q = encodeURIComponent(`name='${name}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
  if (found.files?.length) id = found.files[0].id;
  else {
    const created = await api('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [parent], mimeType: 'application/vnd.google-apps.folder' })
    });
    id = created.id;
  }
  localStorage.setItem(key, id);
  return id;
}

export async function uploadFile(name, blob, subfolder = 'Libros') {
  const folder = await ensureSubfolder(subfolder);
  const boundary = 'scr' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: [folder] });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`
  ]);
  const res = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
  });
  return res.id;
}

export async function downloadFile(fileId) {
  return api(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { blob: true });
}

export async function trashFile(fileId) {
  try {
    await api(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true })
    });
  } catch (e) { /* si ya no existe, no importa */ }
}
