import type { HistoryItem } from '../types';

const DB_NAME = 'werkaholic-db';
const STORE = 'history';
const VERSION = 1;
const LEGACY_LS_KEY = 'werkaholic_history';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const req = fn(store) as IDBRequest<T>;
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
        t.onerror = () => reject(t.error);
      }),
  );
}

function readFallback(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem('werkaholic_history_fallback') || '[]') as HistoryItem[];
  } catch {
    return [];
  }
}

async function migrateLegacyOnce(): Promise<void> {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      localStorage.removeItem(LEGACY_LS_KEY);
      return;
    }
    if (Array.isArray(parsed) && parsed.length > 0) {
      for (const item of parsed as HistoryItem[]) {
        try {
          await tx('readwrite', (s) => s.put(item));
        } catch {
          // weiter mit nächstem Item
        }
      }
    }
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    // Migration darf nie werfen
  }
}

let migrationDone = false;

export async function getHistory(): Promise<HistoryItem[]> {
  try {
    if (!migrationDone) {
      migrationDone = true;
      await migrateLegacyOnce();
    }
    const all = await tx<HistoryItem[]>('readonly', (s) => s.getAll());
    const items = (all as unknown as HistoryItem[]) || [];
    return items.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  } catch {
    // Fallback localStorage (z. B. Tests ohne IndexedDB)
    try {
      return readFallback();
    } catch {
      return [];
    }
  }
}

export async function saveHistoryItem(item: HistoryItem): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(item));
  } catch {
    const prev = readFallback();
    localStorage.setItem('werkaholic_history_fallback', JSON.stringify([item, ...prev]));
  }
}

export async function deleteHistoryItem(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    const prev = readFallback();
    localStorage.setItem('werkaholic_history_fallback', JSON.stringify(prev.filter((p) => p.id !== id)));
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.clear());
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem('werkaholic_history_fallback');
  } catch {
    // ignore
  }
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
