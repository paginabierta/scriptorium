// Almacenamiento local (IndexedDB). Todo vive aquí primero; Drive es la copia en la nube.
// Store "records": registros de la app (espacios, notas, libros, capítulos…), se sincronizan como JSON.
// Store "files": archivos binarios (EPUB). Viajan a Drive como archivos aparte.

const DB_NAME = 'scriptorium';
const STORE = 'records';
const FILES = 'files';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    const r = fn(store);
    if (r && typeof r.then === 'function') r.then(v => { result = v; });
    else if (r instanceof IDBRequest) r.onsuccess = () => { result = r.result; };
    else result = r;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const getAll = () => run(STORE, 'readonly', s => s.getAll());
export const get = (id) => run(STORE, 'readonly', s => s.get(id));
export const put = (record) => run(STORE, 'readwrite', s => { s.put(record); return record; });
export const putMany = (records) => run(STORE, 'readwrite', s => { records.forEach(r => s.put(r)); return records.length; });
export const removeMany = (ids) => run(STORE, 'readwrite', s => { ids.forEach(id => s.delete(id)); return ids.length; });
export const clearAll = () => run(STORE, 'readwrite', s => { s.clear(); });

export const getFile = (key) => run(FILES, 'readonly', s => s.get(key));
export const putFile = (key, blob) => run(FILES, 'readwrite', s => { s.put(blob, key); return key; });
export const deleteFile = (key) => run(FILES, 'readwrite', s => { s.delete(key); });

export function uid(prefix = '') {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return prefix + Date.now().toString(36) + rnd[0].toString(36) + rnd[1].toString(36).slice(0, 4);
}
