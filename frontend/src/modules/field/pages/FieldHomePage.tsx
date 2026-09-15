import { useNavigate } from 'react-router-dom';
import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { useOfflineSync } from '@/field/useOfflineSync';
import type { FieldAssignment } from '@/field/field-service';

function statusBadge(row: FieldAssignment): { label: string; className: string } {
  if (row.signed_received_at) {
    return { label: 'Completada', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  }
  if (row.production_status === 'INSTALLED' || row.production_status === 'CLOSED') {
    return { label: 'En proceso', className: 'bg-amber-100 text-amber-900 border-amber-200' };
  }
  return { label: 'Pendiente', className: 'bg-slate-100 text-slate-700 border-slate-200' };
}

function formatAddress(row: FieldAssignment): string {
  const parts = [row.street, row.lot].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Sin dirección';
}

export default function FieldHomePage() {
  const navigate = useNavigate();
  const userName = localStorage.getItem('user_name') || localStorage.getItem('full_name') || 'Instalador';
  const { isOnline, isSyncing, pendingCount, assignments, workday, refresh, flushQueue } = useOfflineSync();

  return (
    <div className="max-w-lg mx-auto pb-24">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-orange-600">Valentina Campo</p>
          <h1 className="text-2xl font-black text-slate-900">{userName}</h1>
          <p className="text-sm text-slate-500">{workday ? `Jornada ${workday}` : 'Mis asignaciones'}</p>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
            isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}
        >
          {isOnline ? <Wifi size={14} /> : <CloudOff size={14} />}
          {isOnline ? 'En línea' : 'Sin conexión'}
        </div>
      </header>

      {!isOnline && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Modo sin conexión — {pendingCount} pendiente{pendingCount === 1 ? '' : 's'}
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          disabled={isSyncing}
          onClick={() => void refresh()}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 active:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
          Actualizar
        </button>
        {isOnline && pendingCount > 0 && (
          <button
            type="button"
            disabled={isSyncing}
            onClick={() => void flushQueue()}
            className="min-h-12 flex-1 rounded-xl bg-orange-600 text-sm font-bold text-white active:bg-orange-700 disabled:opacity-50"
          >
            Sincronizar ({pendingCount})
          </button>
        )}
      </div>

      {assignments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center text-slate-500">
          No hay instancias programadas para hoy.
        </p>
      ) : (
        <ul className="space-y-3">
          {assignments.map((row) => {
            const badge = statusBadge(row);
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/field/instance/${row.id}`)}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold text-slate-900">{row.custom_name}</p>
                      <p className="text-sm text-slate-600">{row.client.business_name || 'Cliente'}</p>
                    </div>
                    <span className={`shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{formatAddress(row)}</p>
                  <p className="mt-1 text-xs font-bold uppercase text-orange-600">{row.type}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
