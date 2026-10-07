import { useCallback, useEffect, useState } from 'react';
import axiosClient from '@/api/axios-client';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * True when the deployed frontend (/version.json on this same site) is newer than the code running in
 * this tab. Checked every 5 minutes and whenever the tab becomes visible. Disabled in development.
 */
export function useNewVersionAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  const check = useCallback(async () => {
    if (!import.meta.env.PROD || available) return;
    try {
      const response = await axiosClient.get<{ build_id?: string }>(`${window.location.origin}/version.json`, {
        params: { t: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
      });
      const deployed = response.data?.build_id;
      if (deployed && deployed !== __APP_BUILD_ID__) setAvailable(true);
    } catch {
      // Offline or version file missing: keep running the current version silently.
    }
  }, [available]);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  return available;
}
