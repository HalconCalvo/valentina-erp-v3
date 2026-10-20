import { useState, useEffect, useRef, type ReactNode } from 'react';
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
import { Button } from '@/components/ui/Button';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { VPageHeader } from '@/components/ui/VPageHeader';
import { formatDate } from '@/utils/format';
import { AlertTriangle, Ban, HardHat, Layers, Mountain, QrCode, Truck, Wrench } from 'lucide-react';

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** "Hoy" for today's work; otherwise the weekday and DD/MM/AAAA (D32: the next business day is also listed).
 *  The assignment date is a calendar day: only its YYYY-MM-DD part counts. */
function workDayLabel(iso: string): string {
  const key = iso.slice(0, 10);
  if (key === getLocalTodayDateKey()) return 'Hoy';
  const [y, m, d] = key.split('-').map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${formatDate(key)}`;
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
  // H40: each view opens at the top; the list scroll would leave the first rows under the sticky header.
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pageRef.current?.closest('main')?.scrollTo({ top: 0 });
  }, [view, selected?.assignment_id]);
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
      showMessage('Carga confirmada. Fotos, trabajo terminado y firma: en tus asignaciones de Campo.');
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

  // Guide v2 §6: status labels with border, no emojis
  const statusBadge = (status: string) => {
    const tone = {
      slate: 'bg-slate-50 text-slate-700 border-slate-200',
      indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      blue: 'bg-blue-50 text-blue-700 border-blue-200',
      emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
    const map: Record<string, { label: string; color: string }> = {
      SCHEDULED: { label: 'Programado', color: tone.slate },
      PENDING: { label: 'Por producir', color: tone.slate },
      IN_PRODUCTION: { label: 'En producción', color: tone.indigo },
      CLOSED: { label: 'Firmado', color: tone.emerald },
      COMPLETED: { label: 'Firmado', color: tone.emerald },
      IN_PROGRESS: { label: 'Cargada', color: tone.blue },
      READY: { label: 'Listo', color: tone.blue },
      CARGADO: { label: 'Cargado', color: tone.blue },
      INSTALLED: { label: 'Trabajo terminado', color: tone.emerald },
    };
    const s = map[status] || { label: status, color: tone.slate };
    return (
      <span className={`shrink-0 inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border ${s.color}`}>
        {s.label}
      </span>
    );
  };

  const goToList = () => {
    setSelected(null);
    setView('list');
  };

  const renderCard = (a: WorkdayAssignment) => (
    <li key={a.assignment_id}>
      <button
        type="button"
        onClick={() => {
          setSelected(a);
          setView('detail');
        }}
        className="w-full text-left p-4 rounded-xl bg-white border border-slate-200 shadow-sm active:bg-slate-50"
      >
        <div className="flex justify-between items-start gap-2 mb-1">
          <span className="text-base font-bold text-slate-800">{a.instance_name}</span>
          {statusBadge(a.assignment_status)}
        </div>
        <p className="text-sm text-slate-600 line-clamp-2">
          {a.project_name || '—'} · {a.client_name || '—'}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-indigo-700">{laneLabel(a.lane)}</p>
          {a.assignment_date && (
            <p className={`text-xs font-bold ${isLate(a, getLocalTodayDateKey()) ? 'text-red-600' : 'text-slate-600'}`}>
              {isLate(a, getLocalTodayDateKey()) ? 'Atrasada · ' : ''}{workDayLabel(a.assignment_date)}
            </p>
          )}
        </div>
        {String(userRole ?? '').toUpperCase() !== 'LOGISTICS' && a.leader_name && (
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-700">
            <HardHat size={14} className="text-amber-500" /> {a.leader_name}
          </p>
        )}
        {(a.team.helper_1 || a.team.helper_2) && (
          <div className="mt-0.5 flex flex-col gap-0.5">
            {[a.team.helper_1, a.team.helper_2].filter(Boolean).map((h) => (
              <p key={h!.name} className="flex items-center gap-1 text-xs text-slate-500">
                <Wrench size={12} /> Ayudante: {h!.name}
              </p>
            ))}
          </div>
        )}
      </button>
    </li>
  );

  const laneLabel = (lane: string | null) => {
    if (lane === 'IM') return <span className="inline-flex items-center gap-1"><Layers size={14} /> Instalación MDF</span>;
    if (lane === 'IP') return <span className="inline-flex items-center gap-1"><Mountain size={14} /> Instalación Piedra</span>;
    return lane ?? '—';
  };

  const fieldRow = (label: string, value: ReactNode) => (
    <p className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </p>
  );

  // Guide v2 (field screens): max-w-lg container, standard header with "Regresar a …" on the right, Button,
  // VEmptyState, status labels; same data, scanner and handlers.
  return (
    <div ref={pageRef} className="max-w-lg mx-auto p-4 pb-24 space-y-4">
      {message && (
        <div className="px-4 py-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm font-medium border border-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm font-medium border border-red-200">
          {error}
        </div>
      )}

      {/* LISTA */}
      {view === 'list' && (
        <>
          <VPageHeader
            variant="field"
            icon={Truck}
            title={pageTitle}
            subtitle={isLeader ? 'Trabajos de hoy y del siguiente día hábil.' : 'Por cuadrilla; las atrasadas al final.'}
            loading={loading}
            onBack={() => navigate('/field')}
            backLabel="Regresar a Mi jornada"
          />
          <p className="text-sm text-slate-500">Escanea el QR de un bulto de cada casa.</p>
          {loading && assignments.length === 0 ? null : assignments.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
              <VEmptyState icon={<Truck />} title="No hay trabajos pendientes para hoy ni para el siguiente día hábil." />
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
                  className="h-12"
                />
                {groupByCrew(assignments, getLocalTodayDateKey(), search).map((group) => (
                  <section key={group.leader} className="space-y-2">
                    <h2 className="flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 text-sm font-black text-indigo-900">
                      <HardHat size={16} className="text-amber-500" /> {group.leader}
                      <span className="ml-auto font-bold text-indigo-700 tabular-nums">{group.rows.length}</span>
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
          <VPageHeader
            variant="field"
            icon={HardHat}
            title={selected.instance_name}
            subtitle={selected.order_folio || undefined}
            onBack={goToList}
            backLabel="Regresar a Carga del camión"
          />
          <div className="flex flex-wrap gap-2 items-center text-xs text-slate-500">
            <span>Asignación:</span>
            {statusBadge(selected.assignment_status)}
            <span className="ml-2">Instancia:</span>
            {statusBadge(selected.instance_status)}
          </div>
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-4 space-y-2 text-sm">
            {fieldRow('Pedido', selected.order_folio || '—')}
            {fieldRow('Proyecto', selected.project_name || '—')}
            {fieldRow('Cliente', selected.client_name || '—')}
            {fieldRow('Dirección', selected.client_address || '—')}
            {fieldRow('Evidencia', `${selected.evidence_photos_count} foto(s)`)}
            {fieldRow('Firma del cliente', selected.has_signature ? 'Sí' : 'Pendiente')}
          </div>
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-4 space-y-1 text-sm text-slate-700">
            <p className="text-sm font-bold text-indigo-700 mb-2">{laneLabel(selected.lane)}</p>
            <p className="font-bold text-slate-800">Equipo</p>
            <p className="flex items-center gap-1"><HardHat size={14} className="text-amber-500" /> Líder: {selected.team.leader.name}</p>
            {selected.team.helper_1 && (
              <p className="flex items-center gap-1"><Wrench size={14} className="text-slate-400" /> Ayudante 1: {selected.team.helper_1.name}</p>
            )}
            {selected.team.helper_2 && (
              <p className="flex items-center gap-1"><Wrench size={14} className="text-slate-400" /> Ayudante 2: {selected.team.helper_2.name}</p>
            )}
          </div>
          {selected.assignment_status === 'SCHEDULED' ? (
            <Button type="button" onClick={() => setView('qr')} className="h-12 w-full text-sm font-bold">
              <QrCode size={18} /> Escanear QR del bulto
            </Button>
          ) : (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800 space-y-3">
              <div>
                <p className="font-bold">Ya está cargada.</p>
                <p className="mt-1">Las fotos, el trabajo terminado y la firma del cliente se registran en la casa, en Campo.</p>
              </div>
              <Button type="button" onClick={() => navigate('/field')} className="h-12 w-full text-sm font-bold">
                Ir a mis asignaciones
              </Button>
            </div>
          )}
        </>
      )}

      {/* QR */}
      {view === 'qr' && selected && (
        <>
          <VPageHeader
            variant="field"
            icon={QrCode}
            title="Escanear bulto"
            subtitle={selected.instance_name}
            onBack={() => setView('detail')}
            backLabel="Regresar a la casa"
          />
          <QRScanner onScan={(text) => void handleQRScan(text)} />
        </>
      )}

      {view === 'confirm' && selected && preview && (
        <>
          <VPageHeader
            variant="field"
            icon={Truck}
            title="Confirmar carga"
            subtitle={preview.instance_name}
            onBack={() => { setPreview(null); setView('detail'); }}
            backLabel="Regresar a la casa"
          />
          <div className="rounded-xl border border-slate-200 shadow-sm p-4 bg-white">
            <p className="text-lg font-bold text-slate-800 leading-tight">{preview.instance_name}</p>
            {preview.cliente && <p className="text-sm text-slate-500 mt-1">{preview.cliente}</p>}
            {preview.proyecto && <p className="text-sm text-slate-500">{preview.proyecto}</p>}
          </div>

          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5 text-center">
            <p className="text-xs font-bold text-slate-500">Debes cargar</p>
            {preview.lane === 'IP' ? (
              <p className="text-3xl font-black text-indigo-700 mt-2 tabular-nums">{preview.piezas_piedra} piezas de piedra</p>
            ) : (
              <>
                <p className="text-3xl font-black text-indigo-700 mt-2 tabular-nums">{preview.bultos_total} bultos</p>
                <p className="text-sm font-bold text-slate-600 mt-1">
                  {preview.bultos_mdf} MDF + {preview.bultos_herrajes} Herrajes
                </p>
              </>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 shadow-sm p-4 bg-white">
            <p className="text-xs font-bold text-slate-500">Equipo asignado</p>
            <p className="text-sm font-bold text-slate-700 mt-1">
              {(preview.equipo_asignado || []).join(' · ') || '—'}
            </p>
          </div>

          {preview.bloqueo && (
            <div className="flex gap-2 rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm font-bold">
              <Ban size={18} className="shrink-0" /> {preview.bloqueo}
            </div>
          )}

          {preview.requiere_autorizacion && !preview.bloqueo && (
            <div className="flex gap-2 rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-800 text-sm">
              <AlertTriangle size={18} className="shrink-0" />
              <div>
                <p className="font-bold">Esta instancia está asignada a {(preview.equipo_asignado || []).join(' y ')}.</p>
                <p className="mt-1">Solo su líder confirma la carga; si cambió el equipo, Planeación lo reasigna.</p>
              </div>
            </div>
          )}

          {preview.puede_confirmar && !preview.requiere_autorizacion && (
            <Button
              type="button"
              disabled={confirming}
              onClick={() => void handleConfirmarCarga()}
              className="h-12 w-full text-base font-bold bg-emerald-600 hover:bg-emerald-700"
            >
              {confirming ? 'Procesando...' : 'Confirmar carga'}
            </Button>
          )}
        </>
      )}

    </div>
  );
}
