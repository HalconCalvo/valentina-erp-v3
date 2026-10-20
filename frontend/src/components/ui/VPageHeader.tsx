import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Standard screen header (guide v2 §2, model: Cobranza): icon inside the title, one-line subtitle and, on the right,
 * loading notice, the screen's own actions, Actualizar and "Regresar a <origen>". Hubs use it for their sections (§12).
 */
interface VPageHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  /** Shows "Cargando..." while true. */
  loading?: boolean;
  /** Shows Actualizar; it says "Procesando..." and is disabled while refreshing (or loading). */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** "Regresar a <origen>" on the right. */
  onBack?: () => void;
  backLabel?: string;
  /** Actions of the whole screen (Exportar, Nuevo…), left of Actualizar. */
  actions?: React.ReactNode;
  /** 'field': phone screens (h1 text-2xl, icon 28). */
  variant?: 'page' | 'field';
}

export const VPageHeader: React.FC<VPageHeaderProps> = ({
  icon: Icon, title, subtitle, loading = false, onRefresh, refreshing = false, onBack, backLabel = 'Regresar',
  actions, variant = 'page',
}) => {
  const field = variant === 'field';
  const busy = refreshing || loading;
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
      <div className="min-w-0">
        <h1 className={`${field ? 'text-2xl' : 'text-3xl'} font-black tracking-tight flex items-center gap-3 text-slate-800`}>
          {Icon && <Icon className="text-indigo-600 shrink-0" size={field ? 28 : 32} />}
          {title}
        </h1>
        {subtitle && <p className="text-slate-500 mt-1 font-medium">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {loading && <span className="text-xs text-slate-400 font-bold animate-pulse">Cargando...</span>}
        {actions}
        {onRefresh && (
          <Button type="button" variant="outline" onClick={onRefresh} disabled={busy}>
            <RefreshCw size={16} /> {busy ? 'Procesando...' : 'Actualizar'}
          </Button>
        )}
        {onBack && (
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft size={16} /> {backLabel}
          </Button>
        )}
      </div>
    </div>
  );
};

export default VPageHeader;
