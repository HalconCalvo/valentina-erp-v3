import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useNewVersionAvailable } from '@/hooks/useNewVersionAvailable';

/** Shown when a newer version of the app was deployed while this tab was open. */
export default function NewVersionBanner() {
  const available = useNewVersionAvailable();
  if (!available) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-900">
      <span className="font-bold">Hay una versión nueva del sistema. Guarda lo que estés capturando y recarga.</span>
      <Button size="sm" onClick={() => window.location.reload()}>
        <RefreshCw size={14} /> Recargar
      </Button>
    </div>
  );
}
