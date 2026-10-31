// Almacenamiento local (IndexedDB). Todo vive aquí primero; Drive es la copia en la nube.
// Cada registro: { id, type: 'space' | 'note' | 'settings', updated, deleted?, ... }

const DB_NAME = 'scriptorium';
const STORE = 'records';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('type', 'type');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll() {
  return tx('readonly', store => reqToPromise(store.getAll()));
}

export async function get(id) {
  return tx('readonly', store => reqToPromise(store.get(id)));
}

export async function put(record) {
  return tx('readwrite', store => { store.put(record); return record; });
}

export async function putMany(records) {
  return tx('readwrite', store => { records.forEach(r => store.put(r)); return records.length; });
}

export async function clearAll() {
  return tx('readwrite', store => { store.clear(); });
}

export function uid(prefix = '') {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return prefix + Date.now().toString(36) + rnd[0].toString(36) + rnd[1].toString(36).slice(0, 4);
}
