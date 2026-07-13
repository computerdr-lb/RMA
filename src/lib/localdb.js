/* Minimal promise-based IndexedDB wrapper. No dependency, no build step.
   This is the app's local database — every screen reads from here, never
   directly from Supabase. That's what makes offline possible. */

const DB_NAME = "computer-doctor";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("clients")) db.createObjectStore("clients", { keyPath: "id" });
      if (!db.objectStoreNames.contains("tickets")) db.createObjectStore("tickets", { keyPath: "id" });
      if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "key" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "qid", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbp;
const db = () => (dbp ||= openDB());

export async function getAll(store) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(store, "readonly").objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function getOne(store, key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(store, "readonly").objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function put(store, value) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, "readwrite");
    t.objectStore(store).put(value);
    t.oncomplete = () => resolve(value);
    t.onerror = () => reject(t.error);
  });
}

export async function remove(store, key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, "readwrite");
    t.objectStore(store).delete(key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/* --- the sync queue: every offline write waits here until the network returns --- */
export async function addToQueue(entry) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("queue", "readwrite");
    const r = t.objectStore("queue").add({ ...entry, ts: Date.now() });
    r.onsuccess = () => resolve(r.result);
    t.onerror = () => reject(t.error);
  });
}
export const getQueue = () => getAll("queue");
export const removeFromQueue = (qid) => remove("queue", qid);
