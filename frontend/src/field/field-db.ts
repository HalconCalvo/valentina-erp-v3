const DB_NAME = 'valentina-field-v1';
const DB_VERSION = 1;

export type FieldAssignment = {
  id: number;
  custom_name: string;
  street?: string | null;
  lot?: string | null;
  production_status: string;
  sales_order: { folio: string; project_name?: string | null };
  client: { business_name?: string | null };
  type: string;
  blueprint_path?: string | null;
  components: {
    empaque: Array<{ quantity: number; unit: string; name: string; type: string }>;
    herrajes: Array<{ quantity: number; unit: string; name: string; type: string }>;
  };
  evidence_photos_urls: string[];
  signed_received_at?: string | null;
};

type AssignmentsCache = {
  id: 'latest';
  workday: string;
  assignments: FieldAssignment[];
  cachedAt: string;
};

export type PendingSyncItem = {
  id: string;
  instanceId: number;
  kind: 'sync' | 'scan';
  payload: Record<string, unknown>;
  createdAt: string;
};

export type InstanceDraft = {
  instanceId: number;
  photos: string[];
  signatureBase64: string | null;
  notes: string;
  scannedPackages: string[];
  updatedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('assignments')) {
        db.createObjectStore('assignments', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pending')) {
        db.createObjectStore('pending', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'instanceId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function cacheAssignments(workday: string, assignments: FieldAssignment[]): Promise<void> {
  const row: AssignmentsCache = {
    id: 'latest',
    workday,
    assignments,
    cachedAt: new Date().toISOString(),
  };
  await txStore('assignments', 'readwrite', (s) => s.put(row));
}

export async function readCachedAssignments(): Promise<AssignmentsCache | null> {
  return txStore<AssignmentsCache | undefined>('assignments', 'readonly', (s) => s.get('latest')).then(
    (row) => row ?? null,
  );
}

export async function enqueuePending(item: Omit<PendingSyncItem, 'id' | 'createdAt'> & { id?: string }): Promise<void> {
  const row: PendingSyncItem = {
    id: item.id ?? `${item.kind}-${item.instanceId}-${Date.now()}`,
    instanceId: item.instanceId,
    kind: item.kind,
    payload: item.payload,
    createdAt: new Date().toISOString(),
  };
  await txStore('pending', 'readwrite', (s) => s.put(row));
}

export async function listPending(): Promise<PendingSyncItem[]> {
  return txStore<PendingSyncItem[]>('pending', 'readonly', (s) => s.getAll());
}

export async function removePending(id: string): Promise<void> {
  await txStore('pending', 'readwrite', (s) => s.delete(id));
}

export async function saveDraft(draft: InstanceDraft): Promise<void> {
  await txStore('drafts', 'readwrite', (s) => s.put({ ...draft, updatedAt: new Date().toISOString() }));
}

export async function readDraft(instanceId: number): Promise<InstanceDraft | null> {
  return txStore<InstanceDraft | undefined>('drafts', 'readonly', (s) => s.get(instanceId)).then(
    (row) => row ?? null,
  );
}
