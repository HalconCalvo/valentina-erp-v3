import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMyWorkday,
  scanBundleQR,
  previewBundleScan,
  type WorkdayAssignment as WorkdayAssignmentRow,
} from '../../../api/logistics-service';
import QRScanner from '../components/QRScanner';
import { getLocalTodayDateKey } from '../../planning/hooks/usePlanning';
import { groupByCrew, isLate } from '../utils/loadGroups';
import { Input } from '@/components/ui/Input';

/** "Hoy" for today's work; otherwise the weekday and date (D32: the next business day is also listed). */
function workDayLabel(iso: string): string {
  const day = new Date(iso);
  const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  if (key === getLocalTodayDateKey()) return 'Hoy';
  return day.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
}

/** Campo → Carga del camión: the leader loads the truck scanning a bundle of the house (Gabriel, 12/10: Logística
 *  is no longer a module; Planning decides, Field executes). Evidence, finished work and signature: Campo home. */
type View = 'list' | 'detail' | 'qr' | 'confirm';

/** H37: iPhone Safari can reload the page when the camera opens; remember the open house and view so the
 *  leader comes back to the scanner (with the manual code field), never to the list. */
const OPEN_KEY = 'field_load_open';

function rememberOpen(assignmentId: number | null, view: View): void {
  try {
    if (assignmentId == null || view === 'list') sessionStorage.removeItem(OPEN_KEY);
    else sessionStorage.setItem(OPEN_KEY, JSON.stringify({ assignmentId, view: view === 'confirm' ? 'qr' : view }));
  } catch {
    // storage unavailable (private mode): nothing to remember
  }
}

function recallOpen(): { assignmentId: number; view: View } | null {
  try {
    const raw = sessionStorage.getItem(OPEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Fila del feed; incluye leader_name devuelto por el backend para DIRECTOR/GERENCIA. */
type WorkdayAssignment = WorkdayAssignmentRow & {
  leader_name?: string | null;
  lane: string | null;
  assignment_date: string | null;
};

export default function FieldLoadPage() {
  const [assignments, setAssignments] = useState<WorkdayAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WorkdayAssignment | null>(null);
  const [view, setView] = useState<View>('list');
  const [preview, setPreview] = useState<any | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const userRole =
    JSON.parse(localStorage.getItem('user') || '{}')?.role ??
    localStorage.getItem('user_role');
  const isLeader = String(userRole ?? '').toUpperCase() === 'LOGISTICS';
  const [search, setSearch] = useState('');
  const pageTitle =
    String(userRole ?? '').toUpperCase() === 'LOGISTICS'
      ? 'Carga del camión'
      : 'Carga del camión (todas las cuadrillas)';

  const load = async (opts?: { silent?: boolean }): Promise<WorkdayAssignment[]> => {
    try {
      if (!opts?.silent) setLoading(true);
      const data = await getMyWorkday();
      const pending = data.items
        .filter((a) => a.assignment_status !== 'COMPLETED')
        .sort((a, b) => {
          const dateA = a.assignment_date
            ? new Date(a.assignment_date).getTime()
            : Number.MAX_SAFE_INTEGER;
          const dateB = b.assignment_date
            ? new Date(b.assignment_date).getTime()
            : Number.MAX_SAFE_INTEGER;
          return dateA - dateB;
        });
      setAssignments(pending);
      return pending;
    } catch {
      setError('No se pudo cargar la jornada. Verifica tu conexión.');
      return [];
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load().then((list) => {
      const open = recallOpen();
      const house = open && list.find((a) => a.assignment_id === open.assignmentId);
      if (open && house) {
        setSelected(house);
        setView(open.view);
      }
    });
  }, []);

  useEffect(() => {
    rememberOpen(selected?.assignment_id ?? null, view);
  }, [selected, view]);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3500);
  };

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  };

  const handleQRScan = async (uuid: string) => {
    if (!selected) return;
    const assignmentId = selected.assignment_id;
    try {
      const data = await previewBundleScan(assignmentId, uuid);
      setPreview({ ...data, bundle_qr_uuid: uuid });
      setView('confirm');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showError(err?.response?.data?.detail || 'Error al escanear el QR.');
      setView('detail');
    }
  };

  const handleConfirmarCarga = async () => {
    if (!selected || !preview) return;
    const assignmentId = selected.assignment_id;
    setConfirming(true);
    try {
      await scanBundleQR(assignmentId, preview.bundle_qr_uuid);
      showMessage('🔵🔵 Carga confirmada. Fotos, trabajo terminado y firma: en tus asignaciones de Campo.');
      setPreview(null);
      setView('detail');
      const list = await load({ silent: true });
      setSelected((prev) => {
        if (!prev) return null;
        return list.find((a) => a.assignment_id === assignmentId) ?? prev;
      });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showError(err?.response?.data?.detail || 'Error al confirmar la carga.');
    } finally {
      setConfirming(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      SCHEDULED: { label: 'Programado', color: 'bg-gray-200 text-gray-700' },
      IN_PROGRESS: { label: '🔵🔵 Cargada', color: 'bg-blue-100 text-blue-700' },
      READY: { label: 'Listo', color: 'bg-blue-100 text-blue-700' },
      CARGADO: { label: '🔵🔵 Cargado', color: 'bg-blue-200 text-blue-800' },
      INSTALLED: { label: '🟢 Trabajo Terminado', color: 'bg-green-200 text-green-800' },
    };
    const s = map[status] || {
      label: status,
      color: 'bg-gray-100 text-gray-600',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${s.color}`}>
        {s.label}
      </span>
    );
  };

  const Header = ({ title, onBack }: { title: string; onBack?: () => void }) => (
    <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-200 sticky top-0 z-10 -mx-6 -mt-6 mb-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center 
                     rounded-full bg-gray-100 active:bg-gray-200 text-xl"
        >
          ←
        </button>
      )}
      <h1 className="text-lg font-bold text-gray-900 flex-1">{title}</h1>
      <img
        src="/logo.png"
        alt="Valentina"
        className="h-7 opacity-60"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    </div>
  );

  const renderCard = (a: WorkdayAssignment) => (
    <li key={a.assignment_id}>
      <button
        type="button"
        onClick={() => {
          setSelected(a);
          setView('detail');
        }}
        className="w-full text-left p-4 rounded-2xl bg-white border border-gray-200 shadow-sm active:bg-gray-50"
      >
        <div className="flex justify-between items-start gap-2 mb-2">
          <span className="font-semibold text-gray-900">
            {a.instance_name}
          </span>
          {statusBadge(a.assignment_status)}
        </div>
        <p className="text-sm text-gray-600 line-clamp-2">
          {a.project_name || '—'} · {a.client_name || '—'}
        </p>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-indigo-600">
            {laneLabel(a.lane)}
          </p>
          {a.assignment_date && (
            <p className="text-xs font-semibold text-gray-600 capitalize">
              {isLate(a, getLocalTodayDateKey()) ? 'Atrasada · ' : ''}{workDayLabel(a.assignment_date)}
            </p>
          )}
        </div>
        {String(userRole ?? '').toUpperCase() !== 'LOGISTICS' &&
          a.leader_name && (
            <p className="text-xs text-indigo-600 font-medium mt-1">
              👷 {a.leader_name}
            </p>
          )}
        {(a.team.helper_1 || a.team.helper_2) && (
          <div className="flex flex-col gap-0.5">
            {a.team.helper_1 && (
              <p className="text-xs text-gray-500">
                🔧 Ayudante: {a.team.helper_1.name}
              </p>
            )}
            {a.team.helper_2 && (
              <p className="text-xs text-gray-500">
                🔧 Ayudante: {a.team.helper_2.name}
              </p>
            )}
          </div>
        )}
      </button>
    </li>
  );

  if (loading && view === 'list' && assignments.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-gray-500">
        Cargando jornada…
      </div>
    );
  }

  const laneLabel = (lane: string | null) => {
    if (lane === 'IM') return '🪵 Instalación MDF';
    if (lane === 'IP') return '🪨 Instalación Piedra';
    return lane ?? '—';
  };

  return (
    <div className="max-w-lg mx-auto pb-12">
      {message && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-emerald-50 text-emerald-900 text-sm border border-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-red-50 text-red-800 text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* LISTA */}
      {view === 'list' && (
        <>
          <Header title={pageTitle} />
          <p className="text-sm text-gray-500 mb-4 px-1">
            Carga del camión: escanea el QR de un bulto de cada casa.{' '}
            {isLeader
              ? 'Salen los trabajos de hoy y del siguiente día hábil.'
              : 'Por cuadrilla, de la fecha más próxima a la más lejana; las atrasadas al final.'}
          </p>
          {assignments.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              No hay trabajos pendientes para hoy ni para el siguiente día hábil.
            </div>
          ) : (
            isLeader ? (
              <ul className="flex flex-col gap-3">{assignments.map(renderCard)}</ul>
            ) : (
              <>
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar casa, OV, cliente o líder..."
                  className="mb-4"
                />
                {groupByCrew(assignments, getLocalTodayDateKey(), search).map((group) => (
                  <section key={group.leader} className="mb-6">
                    <h2 className="text-sm font-bold text-gray-700 mb-2 px-1">
                      👷 {group.leader} · {group.rows.length}
                    </h2>
                    <ul className="flex flex-col gap-3">{group.rows.map(renderCard)}</ul>
                  </section>
                ))}
              </>
            )
          )}
        </>
      )}

      {/* DETALLE */}
      {view === 'detail' && selected && (
        <>
          <Header
            title={selected.instance_name}
            onBack={() => {
              setSelected(null);
              setView('list');
            }}
          />
          <div className="space-y-4 px-1">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-500">Asignación:</span>
              {statusBadge(selected.assignment_status)}
              <span className="text-xs text-gray-500 ml-2">Instancia:</span>
              {statusBadge(selected.instance_status)}
            </div>
            <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-2 text-sm">
              <p>
                <span className="text-gray-500">Pedido:</span>{' '}
                <span className="font-medium">{selected.order_folio || '—'}</span>
              </p>
              <p>
                <span className="text-gray-500">Proyecto:</span>{' '}
                {selected.project_name || '—'}
              </p>
              <p>
                <span className="text-gray-500">Cliente:</span>{' '}
                {selected.client_name || '—'}
              </p>
              <p>
                <span className="text-gray-500">Dirección:</span>{' '}
                {selected.client_address || '—'}
              </p>
              <p>
                <span className="text-gray-500">Evidencia:</span>{' '}
                {selected.evidence_photos_count} foto(s)
              </p>
              <p>
                <span className="text-gray-500">Firma cliente:</span>{' '}
                {selected.has_signature ? 'Sí' : 'Pendiente'}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm">
              <p className="text-sm font-bold text-indigo-600 mb-2">
                {laneLabel(selected.lane)}
              </p>
              <p className="font-medium text-gray-700 mb-2">Equipo</p>
              <p>Líder: {selected.team.leader.name}</p>
              {selected.team.helper_1 && (
                <p>Ayudante 1: {selected.team.helper_1.name}</p>
              )}
              {selected.team.helper_2 && (
                <p>Ayudante 2: {selected.team.helper_2.name}</p>
              )}
            </div>
            <div className="flex flex-col gap-3 pt-2">
              {selected.assignment_status === 'SCHEDULED' ? (
                <button
                  type="button"
                  onClick={() => setView('qr')}
                  className="w-full py-4 rounded-2xl bg-blue-600 text-white font-semibold active:bg-blue-700"
                >
                  Escanear QR del bulto
                </button>
              ) : (
                <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
                  <p className="font-semibold">Ya está cargada.</p>
                  <p className="mt-1">Las fotos, el trabajo terminado y la firma del cliente se registran en la casa, en Campo.</p>
                  <button
                    type="button"
                    onClick={() => navigate('/field')}
                    className="mt-3 w-full py-3 rounded-xl bg-blue-600 text-white font-semibold active:bg-blue-700"
                  >
                    Ir a mis asignaciones
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* QR */}
      {view === 'qr' && selected && (
        <>
          <Header
            title="Escanear bulto"
            onBack={() => setView('detail')}
          />
          <QRScanner onScan={(text) => void handleQRScan(text)} />
        </>
      )}

      {view === 'confirm' && selected && preview && (
        <>
          <Header
            title="Confirmar carga"
            onBack={() => { setPreview(null); setView('detail'); }}
          />
          <div className="p-4 flex flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 p-4 bg-white">
              <p className="text-lg font-bold text-slate-800 leading-tight">{preview.instance_name}</p>
              {preview.cliente && <p className="text-sm text-slate-500 mt-1">{preview.cliente}</p>}
              {preview.proyecto && <p className="text-sm text-slate-500">{preview.proyecto}</p>}
            </div>

            <div className="rounded-2xl bg-blue-50 border border-blue-200 p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-500">Debes cargar</p>
              {preview.lane === 'IP' ? (
                <p className="text-4xl font-black text-blue-700 mt-2">{preview.piezas_piedra} piezas de piedra</p>
              ) : (
                <>
                  <p className="text-4xl font-black text-blue-700 mt-2">{preview.bultos_total} bultos</p>
                  <p className="text-sm font-semibold text-blue-600 mt-1">
                    {preview.bultos_mdf} MDF + {preview.bultos_herrajes} Herrajes
                  </p>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 p-4 bg-white">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Equipo asignado</p>
              <p className="text-sm font-semibold text-slate-700 mt-1">
                {(preview.equipo_asignado || []).join(' · ') || '—'}
              </p>
            </div>

            {preview.bloqueo && (
              <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm font-semibold">
                ⛔ {preview.bloqueo}
              </div>
            )}

            {preview.requiere_autorizacion && !preview.bloqueo && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-amber-800 text-sm font-semibold">
                ⚠ Esta instancia está asignada a {(preview.equipo_asignado || []).join(' y ')}.
                <span className="block font-normal mt-1">
                  Solo su líder confirma la carga; si cambió el equipo, Planeación lo reasigna.
                </span>
              </div>
            )}

            {preview.puede_confirmar && !preview.requiere_autorizacion && (
              <button
                type="button"
                disabled={confirming}
                onClick={() => void handleConfirmarCarga()}
                className="w-full py-5 rounded-2xl bg-green-600 text-white text-lg font-bold active:bg-green-700 disabled:opacity-50"
              >
                {confirming ? 'Confirmando...' : '✅ Confirmar carga'}
              </button>
            )}
          </div>
        </>
      )}

    </div>
  );
}
