import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyWorkday } from '@/api/logistics-service';
import { CloudOff, HardHat, RefreshCw, Truck, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { useOfflineSync } from '@/field/useOfflineSync';
import type { FieldAssignment } from '@/field/field-service';
import { crewTeamNames, ROLE_NAMES } from '@/modules/field/utils/crew';

function statusBadge(row: FieldAssignment): { label: string; className: string } {
  if (row.signed_received_at) {
    return { label: 'Completada', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (row.can_sign) {
    return { label: 'Lista para firma', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (row.production_status === 'CARGADO') {
    return { label: 'En obra', className: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  return { label: 'Por cargar', className: 'bg-slate-50 text-slate-700 border-slate-200' };
}

const INSTALL_TYPE: Record<string, string> = { MDF: 'Muebles', STONE: 'Piedra', BOTH: 'Muebles y piedra' };

/** "2026-10-19" → "19/10/2026" (the workday is a plain date; no time zone shift). */
function formatWorkday(day: string): string {
  const [y, m, d] = day.split('-');
  return d && m && y ? `${d}/${m}/${y}` : day;
}

function formatAddress(row: FieldAssignment): string {
  const parts = [row.street, row.lot].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Sin dirección';
}

export default function FieldHomePage() {
  const navigate = useNavigate();
  const userName = localStorage.getItem('user_name') || localStorage.getItem('full_name') || 'Instalador';
  const role = (localStorage.getItem('user_role') || '').toUpperCase().trim();
  const isLeader = role === 'LOGISTICS';
  const { isOnline, isSyncing, pendingCount, assignments, workday, refresh, flushQueue } = useOfflineSync();
  // H59: how many loads are still waiting (same list as Carga del camión); null = unknown (offline)
  const [loadsPending, setLoadsPending] = useState<number | null>(null);
  // Helpers of the leader's houses of the day (empty when offline or not a leader)
  const [team, setTeam] = useState<string[]>([]);

  useEffect(() => {
    if (!isOnline) {
      setLoadsPending(null);
      return;
    }
    let cancelled = false;
    getMyWorkday()
      .then((data) => {
        if (cancelled) return;
        setLoadsPending(data.items.filter((a) => a.assignment_status === 'SCHEDULED').length);
        setTeam(isLeader ? crewTeamNames(data.items as Parameters<typeof crewTeamNames>[0]) : []);
      })
      .catch(() => {
        if (!cancelled) setLoadsPending(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isOnline, assignments, isLeader]);

  // Third-wave pilot (guide v2, field screens): max-w-lg container, standard header in text-2xl, Button, VEmptyState
  return (
    <div className="max-w-lg mx-auto p-4 pb-24 space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
        {/* Pilot 4/4 (Gabriel 19/10): the leader's name is the title, so the crew feels proud of the team */}
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-slate-900 truncate">{userName}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-700">
            <HardHat className="text-amber-500 shrink-0" size={18} /> {ROLE_NAMES[role] ?? role}
          </p>
          {team.length > 0 && (
            <p className="mt-0.5 text-xs text-slate-500 truncate">Tu equipo: {team.join(', ')}</p>
          )}
          <p className="mt-1 text-sm text-slate-500 font-medium">
            Mi jornada{workday ? ` · ${formatWorkday(workday)}` : ''}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 text-xs font-bold px-2 py-1 rounded border ${
            isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'
          }`}
        >
          {isOnline ? <Wifi size={14} /> : <CloudOff size={14} />}
          {isOnline ? 'En línea' : 'Sin conexión'}
        </span>
      </div>

      {!isOnline && (
        <p className="text-sm font-bold text-amber-700">
          Sin conexión: {pendingCount} pendiente{pendingCount === 1 ? '' : 's'} por enviar.
        </p>
      )}

      <Button
        type="button"
        variant={loadsPending === 0 ? 'outline' : 'default'}
        onClick={() => navigate('/field/load')}
        className="h-12 w-full text-sm font-bold"
      >
        <Truck size={18} />
        {loadsPending === null
          ? 'Carga del camión (escanear bultos)'
          : loadsPending === 0
            ? 'Carga del camión · sin cargas pendientes'
            : `Carga del camión · ${loadsPending} por cargar`}
      </Button>

      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={isSyncing} onClick={() => void refresh()}
          className="h-12 flex-1 text-sm font-bold">
          <RefreshCw size={18} /> {isSyncing ? 'Procesando...' : 'Actualizar'}
        </Button>
        {isOnline && pendingCount > 0 && (
          <Button type="button" disabled={isSyncing} onClick={() => void flushQueue()}
            className="h-12 flex-1 text-sm font-bold bg-emerald-600 hover:bg-emerald-700">
            Sincronizar ({pendingCount})
          </Button>
        )}
      </div>

      {assignments.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <VEmptyState icon={<HardHat />} title="No hay casas programadas para hoy ni para el siguiente día hábil." />
        </div>
      ) : (
        <ul className="space-y-3">
          {assignments.map((row) => {
            const badge = statusBadge(row);
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/field/instance/${row.id}`)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-slate-800">{row.custom_name}</p>
                      <p className="text-sm text-slate-600">{row.client.business_name || 'Cliente'}</p>
                    </div>
                    <span className={`shrink-0 inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{formatAddress(row)}</p>
                  <p className="mt-1 text-xs font-bold text-indigo-700">{INSTALL_TYPE[row.type] ?? row.type}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
