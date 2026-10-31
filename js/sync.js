// Sincronización: une lo de este aparato con lo que hay en Drive, registro por registro.
// Gana la versión más reciente. Si una misma nota se cambió en dos aparatos desde la última
// sincronización, se conservan las dos: la más vieja queda como "copia en conflicto".

import * as db from './db.js';
import * as drive from './drive.js';

const LAST = 'scr.lastSync';
let running = null;
let timer = null;
const listeners = new Set();

export const state = { status: 'idle', message: '', lastSync: Number(localStorage.getItem(LAST) || 0) };

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(status, message = '') {
  state.status = status; state.message = message;
  listeners.forEach(fn => fn(state));
}

function sameContent(a, b) {
  return a.title === b.title && JSON.stringify(a.content?.blocks || []) === JSON.stringify(b.content?.blocks || []);
}

export function merge(localRecs, remoteRecs, lastSync) {
  const L = new Map(localRecs.map(r => [r.id, r]));
  const R = new Map(remoteRecs.map(r => [r.id, r]));
  const merged = [];
  const changedLocal = [];
  const ids = new Set([...L.keys(), ...R.keys()]);
  for (const id of ids) {
    const l = L.get(id), r = R.get(id);
    if (!r) { merged.push(l); continue; }
    if (!l) { merged.push(r); changedLocal.push(r); continue; }
    if ((l.updated || 0) === (r.updated || 0)) { merged.push(l); continue; }
    const lChanged = (l.updated || 0) > lastSync;
    const rChanged = (r.updated || 0) > lastSync;
    const newer = (l.updated || 0) > (r.updated || 0) ? l : r;
    const older = newer === l ? r : l;
    if (lChanged && rChanged && l.type === 'note' && !l.deleted && !r.deleted && !sameContent(l, r)) {
      const copy = { ...older, id: db.uid('n'), title: `${older.title || 'Sin título'} (copia en conflicto)`, updated: Date.now() };
      merged.push(copy); changedLocal.push(copy);
    }
    merged.push(newer);
    if (newer === r) changedLocal.push(r);
  }
  return { merged, changedLocal };
}

export async function syncNow() {
  if (!drive.isConfigured() || !drive.isConnected()) return;
  if (!navigator.onLine) { emit('offline', 'Sin conexión: se guarda en este aparato'); return; }
  if (!drive.hasValidToken()) { emit('auth', 'Toca para reconectar con Google'); return; }
  if (running) return running;
  running = (async () => {
    emit('syncing', 'Sincronizando…');
    try {
      const startedAt = Date.now();
      const local = await db.getAll();
      const remote = await drive.download();
      const { merged, changedLocal } = merge(local, remote?.records || [], state.lastSync);
      if (changedLocal.length) await db.putMany(changedLocal);
      await drive.upload({ app: 'Scriptorium', version: 1, savedAt: startedAt, records: merged });
      state.lastSync = startedAt;
      localStorage.setItem(LAST, String(startedAt));
      emit('ok', '');
      return changedLocal.length;
    } catch (e) {
      if (e.code === 'AUTH') emit('auth', 'Toca para reconectar con Google');
      else emit('error', e.message || 'No se pudo sincronizar');
    } finally {
      running = null;
    }
  })();
  return running;
}

// Programa una sincronización unos segundos después del último cambio.
export function schedule(delay = 4000) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

export function resetSyncState() {
  localStorage.removeItem(LAST);
  state.lastSync = 0;
  emit('idle', '');
}
