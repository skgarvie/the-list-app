// IndexedDB persistence. Two stores:
//   lists: { id, name, hue, showAge, fadeOld, order }  ordered by `order`
//   items: { id, listId, title, comment, createdAt }   ordered by `createdAt`, indexed by listId
// The in-memory state in app.js stays the source of truth; these functions mirror each change.

const DB_NAME = 'thelist';
const DB_VERSION = 1;
const LEGACY_KEY = 'thelist:v1'; // the localStorage blob used before IndexedDB

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });

function readLegacy() {
  try {
    const data = JSON.parse(localStorage.getItem(LEGACY_KEY));
    return data && Array.isArray(data.lists) ? data.lists : null;
  } catch {
    return null;
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let migrated = false;
    req.onupgradeneeded = () => {
      const db = req.result;
      const lists = db.createObjectStore('lists', { keyPath: 'id' });
      const items = db.createObjectStore('items', { keyPath: 'id' });
      items.createIndex('listId', 'listId');
      // Copy over localStorage data inside the upgrade transaction, so it lands all or nothing
      readLegacy()?.forEach(({ items: listItems = [], ...list }, order) => {
        lists.put({ ...list, order });
        listItems.forEach((item) => items.put({ ...item, listId: list.id }));
        migrated = true;
      });
    };
    req.onsuccess = () => {
      const db = req.result;
      // A newer version opened in another tab: step aside so its upgrade isn't blocked
      db.onversionchange = () => db.close();
      // Success only fires once the upgrade transaction has committed, so the old copy is safe to drop
      if (migrated) localStorage.removeItem(LEGACY_KEY);
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

let db = null;

// Returns the saved lists, each with its items, as [{ id, name, …, order, items: [] }].
// If IndexedDB can't be opened, falls back to any old localStorage data and runs unsaved.
export async function loadLists() {
  try {
    db = await openDB();
  } catch (err) {
    console.error('IndexedDB unavailable; changes will not be saved', err);
    return (readLegacy() ?? []).map((list, order) => ({ ...list, order }));
  }
  const tx = db.transaction(['lists', 'items']);
  const [lists, items] = await Promise.all([
    request(tx.objectStore('lists').getAll()),
    request(tx.objectStore('items').getAll()),
  ]);
  const byList = new Map(lists.map((list) => [list.id, { ...list, items: [] }]));
  items
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .forEach(({ listId, ...item }) => byList.get(listId)?.items.push(item));
  return [...byList.values()].sort((a, b) => a.order - b.order);
}

// Writes are fire-and-forget: transactions on the same store run in the order they're created
function write(stores, fn) {
  if (!db) return;
  const tx = db.transaction(stores, 'readwrite');
  fn(tx);
  done(tx).catch((err) => console.error('Failed to save', err));
}

// Saves the list's own fields; its items are saved separately with putItem
export function putList({ items, ...list }) {
  write('lists', (tx) => tx.objectStore('lists').put(list));
}

export function deleteList(id) {
  write(['lists', 'items'], (tx) => {
    tx.objectStore('lists').delete(id);
    const items = tx.objectStore('items');
    items.index('listId').openKeyCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) return;
      items.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}

export function putItems(listId, items) {
  write('items', (tx) => items.forEach((item) => tx.objectStore('items').put({ ...item, listId })));
}

export const putItem = (listId, item) => putItems(listId, [item]);

export function deleteItem(id) {
  write('items', (tx) => tx.objectStore('items').delete(id));
}

// Ask the browser not to evict our data under storage pressure (granted silently or not at all)
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {});
}
