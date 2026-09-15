import { useCallback, useEffect, useState } from 'react';
import {
  countPending,
  flushPendingQueue,
  getMyAssignments,
  getMyAssignmentsCached,
  type FieldAssignment,
  type MyAssignmentsResponse,
} from './field-service';

export type OfflineSyncState = {
  isOnline: boolean;
  isSyncing: boolean;
  lastSync: string | null;
  pendingCount: number;
  assignments: FieldAssignment[];
  workday: string | null;
  refresh: () => Promise<void>;
  flushQueue: () => Promise<void>;
};

export function useOfflineSync(): OfflineSyncState {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [assignments, setAssignments] = useState<FieldAssignment[]>([]);
  const [workday, setWorkday] = useState<string | null>(null);

  const applyResponse = useCallback((data: MyAssignmentsResponse) => {
    setAssignments(data.assignments);
    setWorkday(data.workday);
    setLastSync(new Date().toISOString());
  }, []);

  const refreshPending = useCallback(async () => {
    setPendingCount(await countPending());
  }, []);

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    try {
      if (navigator.onLine) {
        const data = await getMyAssignments();
        applyResponse(data);
      } else {
        const cached = await getMyAssignmentsCached();
        if (cached) applyResponse(cached);
      }
    } catch {
      const cached = await getMyAssignmentsCached();
      if (cached) applyResponse(cached);
    } finally {
      await refreshPending();
      setIsSyncing(false);
    }
  }, [applyResponse, refreshPending]);

  const flushQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    setIsSyncing(true);
    try {
      await flushPendingQueue();
      await refresh();
    } finally {
      setIsSyncing(false);
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void flushQueue();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushQueue]);

  return {
    isOnline,
    isSyncing,
    lastSync,
    pendingCount,
    assignments,
    workday,
    refresh,
    flushQueue,
  };
}
