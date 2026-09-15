import axiosClient from '@/api/axios-client';
import {
  cacheAssignments,
  enqueuePending,
  listPending,
  readCachedAssignments,
  removePending,
  type FieldAssignment,
  type PendingSyncItem,
} from './field-db';

export type { FieldAssignment };

export type MyAssignmentsResponse = {
  workday: string;
  assignments: FieldAssignment[];
};

export type SyncPayload = {
  photos: string[];
  signature_base64: string | null;
  notes: string;
  scanned_packages: string[];
  incidents: string[];
};

export async function getMyAssignments(): Promise<MyAssignmentsResponse> {
  const { data } = await axiosClient.get<MyAssignmentsResponse>('/field/my-assignments');
  await cacheAssignments(data.workday, data.assignments);
  return data;
}

export async function getMyAssignmentsCached(): Promise<MyAssignmentsResponse | null> {
  const cached = await readCachedAssignments();
  if (!cached) return null;
  return { workday: cached.workday, assignments: cached.assignments };
}

export async function syncInstance(instanceId: number, payload: SyncPayload) {
  const { data } = await axiosClient.post(`/field/instances/${instanceId}/sync`, payload);
  return data as { success: boolean; signed_at?: string | null; photo_urls: string[] };
}

export async function scanPackage(instanceId: number, barcode: string) {
  const { data } = await axiosClient.post(`/field/instances/${instanceId}/scan-package`, { barcode });
  return data as { success: boolean; barcode: string; scanned_at: string };
}

export async function queueSync(instanceId: number, payload: SyncPayload): Promise<void> {
  await enqueuePending({ instanceId, kind: 'sync', payload: payload as unknown as Record<string, unknown> });
}

export async function queueScan(instanceId: number, barcode: string): Promise<void> {
  await enqueuePending({
    instanceId,
    kind: 'scan',
    payload: { barcode },
  });
}

export async function flushPendingQueue(): Promise<number> {
  const pending = await listPending();
  let done = 0;
  for (const item of pending) {
    try {
      await applyPendingItem(item);
      await removePending(item.id);
      done += 1;
    } catch {
      break;
    }
  }
  return done;
}

async function applyPendingItem(item: PendingSyncItem): Promise<void> {
  if (item.kind === 'scan') {
    const barcode = String(item.payload.barcode ?? '');
    await scanPackage(item.instanceId, barcode);
    return;
  }
  const p = item.payload as unknown as SyncPayload;
  await syncInstance(item.instanceId, {
    photos: p.photos ?? [],
    signature_base64: p.signature_base64 ?? null,
    notes: p.notes ?? '',
    scanned_packages: p.scanned_packages ?? [],
    incidents: p.incidents ?? [],
  });
}

export async function countPending(): Promise<number> {
  const rows = await listPending();
  return rows.length;
}
