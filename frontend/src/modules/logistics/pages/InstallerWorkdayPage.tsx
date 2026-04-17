import { useState, useEffect, useRef } from 'react';
import {
  getMyWorkday,
  scanBundleQR,
  uploadEvidencePhotos,
  submitClientSignature,
  type WorkdayAssignment as WorkdayAssignmentRow,
} from '../../../api/logistics-service';
import QRScanner from '../components/QRScanner';
import SignaturePad from '../components/SignaturePad';

type View = 'list' | 'detail' | 'qr' | 'photos' | 'signature';

/** Fila del feed; incluye leader_name devuelto por el backend para DIRECTOR/GERENCIA. */
type WorkdayAssignment = WorkdayAssignmentRow & {
  leader_name?: string | null;
  lane: string | null;
  assignment_date: string | null;
};

export default function InstallerWorkdayPage() {
  const [assignments, setAssignments] = useState<WorkdayAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WorkdayAssignment | null>(null);
  const [view, setView] = useState<View>('list');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userRole =
    JSON.parse(localStorage.getItem('user') || '{}')?.role ??
    localStorage.getItem('user_role');
  const pageTitle =
    String(userRole ?? '').toUpperCase() === 'LOGISTICS'
      ? 'Mis Instalaciones'
      : 'Jornada de Instalación';

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
    void load();
  }, []);

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
      await scanBundleQR(assignmentId, uuid);
      showMessage('🔵🔵 Bulto confirmado. Instancia en tránsito.');
      setView('detail');
      const list = await load({ silent: true });
      setSelected((prev) => {
        if (!prev) return null;
        return list.find((a) => a.assignment_id === assignmentId) ?? prev;
      });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showError(err?.response?.data?.detail || 'Error al escanear el QR.');
      setView('detail');
    }
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files?.length || !selected) return;
    const photoArray = Array.from(files);
    const instanceId = selected.instance_id;
    const assignmentId = selected.assignment_id;
    setUploading(true);
    try {
      const result = await uploadEvidencePhotos(instanceId, photoArray);
      showMessage(
        `✅ ${result.uploaded_count} foto(s) subida(s). ` +
          `Total evidencia: ${result.total_evidence_photos}`
      );
      const list = await load({ silent: true });
      setSelected((prev) => {
        if (!prev) return null;
        return list.find((a) => a.assignment_id === assignmentId) ?? prev;
      });
      setView('detail');
    } catch {
      showError('Error al subir las fotos. Intenta de nuevo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSignature = async (dataUrl: string) => {
    if (!selected) return;
    try {
      await submitClientSignature(selected.assignment_id, dataUrl);
      showMessage('🟢🟢 Firma recabada. Instancia cerrada. Nómina liberada.');
      setView('list');
      setSelected(null);
      await load({ silent: true });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showError(err?.response?.data?.detail || 'Error al guardar la firma.');
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      SCHEDULED: { label: 'Programado', color: 'bg-gray-200 text-gray-700' },
      IN_PROGRESS: { label: 'En tránsito', color: 'bg-blue-100 text-blue-700' },
      READY: { label: 'Listo', color: 'bg-blue-100 text-blue-700' },
      CARGADO: { label: '🔵🔵 Cargado', color: 'bg-blue-200 text-blue-800' },
      INSTALLED: { label: '🟢 Instalado', color: 'bg-green-100 text-green-700' },
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
            Asignaciones activas (programadas y en tránsito).
          </p>
          {assignments.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              No hay trabajos pendientes para hoy.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {assignments.map((a) => (
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
                        <p className="text-xs text-gray-500">
                          {new Date(a.assignment_date).toLocaleDateString('es-MX', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
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
              ))}
            </ul>
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
              <button
                type="button"
                onClick={() => setView('qr')}
                className="w-full py-4 rounded-2xl bg-blue-600 text-white font-semibold active:bg-blue-700"
              >
                Escanear QR del bulto
              </button>
              <button
                type="button"
                onClick={() => setView('photos')}
                disabled={uploading}
                className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-semibold active:bg-indigo-700 disabled:opacity-50"
              >
                Subir fotos de evidencia
              </button>
              <button
                type="button"
                onClick={() => setView('signature')}
                className="w-full py-4 rounded-2xl bg-green-600 text-white font-semibold active:bg-green-700"
              >
                Firma del cliente
              </button>
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
          <QRScanner
            onScan={(text) => void handleQRScan(text)}
            onError={() => {}}
          />
        </>
      )}

      {/* FOTOS */}
      {view === 'photos' && selected && (
        <>
          <Header
            title="Evidencia fotográfica"
            onBack={() => setView('detail')}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void handlePhotoUpload(e.target.files)}
          />
          <div className="flex flex-col gap-4 px-1">
            <p className="text-sm text-gray-600">
              Selecciona una o varias fotos de la instalación terminada.
            </p>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="py-4 rounded-2xl bg-indigo-600 text-white font-semibold disabled:opacity-50"
            >
              {uploading ? 'Subiendo…' : 'Elegir fotos'}
            </button>
          </div>
        </>
      )}

      {/* FIRMA */}
      {view === 'signature' && selected && (
        <>
          <Header
            title="Firma de conformidad"
            onBack={() => setView('detail')}
          />
          <SignaturePad
            onSave={(dataUrl) => void handleSignature(dataUrl)}
            onCancel={() => setView('detail')}
          />
        </>
      )}
    </div>
  );
}
