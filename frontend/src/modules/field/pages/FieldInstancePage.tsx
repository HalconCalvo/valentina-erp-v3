import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { Camera, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { VPageHeader } from '@/components/ui/VPageHeader';
import { VTextarea } from '@/components/ui/VTextarea';
import { toast } from '@/components/ui/VToast';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { useOfflineSync } from '@/field/useOfflineSync';
import {
  markLaneInstalled,
  queueSync,
  syncInstance,
  type FieldAssignment,
  type SyncPayload,
} from '@/field/field-service';
import { readDraft, saveDraft } from '@/field/field-db';
import { formatDateTime } from '@/utils/format';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

type TabId = 'empaque' | 'herrajes' | 'plano' | 'fotos' | 'terminado' | 'firma';

const LANE_LABEL: Record<string, string> = { IM: 'Muebles (MDF)', IP: 'Piedra' };
const INSTALL_TYPE: Record<string, string> = { MDF: 'Muebles', STONE: 'Piedra', BOTH: 'Muebles y piedra' };
const SUPERVISOR_ROLES = ['DIRECTOR', 'MANAGER'];
const LANE_STATUS: Record<string, string> = {
  UNASSIGNED: 'Sin cuadrilla asignada (Planeación)',
  SCHEDULED: 'Por cargar (Carga del camión)',
  IN_PROGRESS: 'Cargado: en obra',
  INSTALLED: 'Trabajo terminado',
  COMPLETED: 'Firmado',
};

function resolveBlueprintUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const base = API_URL.replace('/api/v1', '');
  return `${base}/${path.replace(/^\//, '')}`;
}

export default function FieldInstancePage() {
  const { id } = useParams();
  const instanceId = Number(id);
  const navigate = useNavigate();
  const { assignments, isOnline, pendingCount, flushQueue, refresh } = useOfflineSync();
  const [tab, setTab] = useState<TabId>('empaque');
  const [finishingLane, setFinishingLane] = useState<number | null>(null);
  const isSupervisor = SUPERVISOR_ROLES.includes((localStorage.getItem('user_role') || '').toUpperCase());
  const [photos, setPhotos] = useState<string[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  // H60: what happened with the last sync, shown on screen (not only as a toast)
  const [syncStatus, setSyncStatus] = useState<{ kind: 'ok' | 'error' | 'queued'; text: string } | null>(null);
  const sigRef = useRef<SignatureCanvas>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const row: FieldAssignment | undefined = useMemo(
    () => assignments.find((a) => a.id === instanceId),
    [assignments, instanceId],
  );

  useEffect(() => {
    if (!instanceId) return;
    void readDraft(instanceId).then((draft) => {
      if (!draft) return;
      setPhotos(draft.photos);
      setSignature(draft.signatureBase64);
      setNotes(draft.notes);
    });
  }, [instanceId]);

  const persistDraft = useCallback(async () => {
    if (!instanceId) return;
    await saveDraft({
      instanceId,
      photos,
      signatureBase64: signature,
      notes,
      scannedPackages: [],
      updatedAt: new Date().toISOString(),
    });
  }, [instanceId, notes, photos, signature]);

  useEffect(() => {
    void persistDraft();
  }, [persistDraft]);

  const hasLocalPending = photos.length > 0 || Boolean(signature);

  const handleLaneFinished = async () => {
    if (finishingLane == null) return;
    try {
      await markLaneInstalled(finishingLane);
      toast.success('Trabajo terminado registrado.');
      await refresh();
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'No se pudo marcar el trabajo terminado (requiere conexión).');
    } finally {
      setFinishingLane(null);
    }
  };

  const buildPayload = (): SyncPayload => ({
    photos,
    // H60: a signed house never sends a second signature
    signature_base64: row?.signed_received_at ? null : signature,
    notes,
    scanned_packages: [],
    incidents: [],
  });

  const handleSync = async () => {
    if (!hasLocalPending && pendingCount === 0) {
      toast.warning('No hay datos pendientes.');
      return;
    }
    if (busy) return;
    setBusy(true);
    setSyncStatus(null);
    try {
      if (!isOnline) {
        await queueSync(instanceId, buildPayload());
        setPhotos([]);
        setSignature(null);
        setSyncStatus({ kind: 'queued', text: 'Sin conexión: guardado en el teléfono; se enviará al volver la señal.' });
        toast.info('Sincronización en cola offline.');
        await refresh();
        return;
      }
      if (pendingCount > 0) await flushQueue();
      if (hasLocalPending) {
        await syncInstance(instanceId, buildPayload());
        setPhotos([]);
        setSignature(null);
      }
      setSyncStatus({ kind: 'ok', text: `Sincronizado ${formatDateTime(new Date())}` });
      toast.success('Sincronizado con el servidor.');
      await refresh();
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      await queueSync(instanceId, buildPayload());
      setPhotos([]);
      setSignature(null);
      setSyncStatus({ kind: 'error', text: `No se pudo sincronizar${detail ? `: ${detail}` : ''}. Quedó en cola en el teléfono.` });
      toast.error('Falló la sync; guardado en cola offline.');
    } finally {
      setBusy(false);
    }
  };

  const onPhotoSelected = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) setPhotos((prev) => [...prev, result]);
    };
    reader.readAsDataURL(file);
  };

  if (!row) {
    return (
      <div className="max-w-lg mx-auto p-4 pb-24 space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <VEmptyState icon={<Home />} title="Instancia no encontrada en la jornada." />
          <div className="px-6 pb-8 -mt-6 flex justify-center">
            <Button type="button" variant="outline" onClick={() => navigate('/field')} className="h-12">
              Regresar a Mi jornada
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'empaque', label: 'Empaque' },
    { id: 'herrajes', label: 'Herrajes' },
    { id: 'plano', label: 'Plano' },
    { id: 'fotos', label: 'Fotos' },
    { id: 'terminado', label: 'Trabajo terminado' },
    { id: 'firma', label: 'Firma' },
  ];

  const blueprintUrl = resolveBlueprintUrl(row.blueprint_path);

  return (
    // Guide v2 (field screens): max-w-lg container, standard header with "Regresar a Mi jornada" on the right,
    // Button and VTextarea; same data, camera, signature and offline queue.
    <div className="max-w-lg mx-auto p-4 pb-40 space-y-4">
      <VPageHeader
        variant="field"
        icon={Home}
        title={row.custom_name}
        subtitle={INSTALL_TYPE[row.type] ?? row.type}
        onBack={() => navigate('/field')}
        backLabel="Regresar a Mi jornada"
      />

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-sm text-slate-700 space-y-1">
        <p>
          <span className="font-bold">OV:</span> {row.sales_order.folio}
        </p>
        <p>
          <span className="font-bold">Cliente:</span> {row.client.business_name || '—'}
        </p>
        <p>
          <span className="font-bold">Proyecto:</span> {row.sales_order.project_name || '—'}
        </p>
        <p>
          <span className="font-bold">Dirección:</span> {[row.street, row.lot].filter(Boolean).join(' · ') || '—'}
        </p>
      </section>

      {(row.lanes ?? []).length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm space-y-1">
          {(row.lanes ?? []).map((lane) => (
            <p key={`${lane.lane}-${lane.assignment_id}`} className="text-xs text-slate-600">
              <span className="font-bold text-slate-800">{LANE_LABEL[lane.lane] ?? lane.lane}:</span>{' '}
              {LANE_STATUS[lane.status] ?? lane.status}{lane.leader_name ? ` · ${lane.leader_name}` : ''}
            </p>
          ))}
        </section>
      )}

      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant="outline"
            onClick={() => setTab(t.id)}
            className={`h-12 shrink-0 px-4 text-sm font-bold ${
              tab === t.id ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-700' : 'text-slate-600'
            }`}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm min-h-[200px]">
        {tab === 'empaque' && (
          <ul className="space-y-2">
            {row.components.empaque.map((m, i) => (
              <li key={`e-${i}`} className="flex justify-between gap-2 text-sm">
                <span className="font-medium text-slate-800">{m.name}</span>
                <span className="shrink-0 font-bold text-slate-600 tabular-nums">
                  {m.quantity} {m.unit}
                </span>
              </li>
            ))}
            {row.components.empaque.length === 0 && (
              <p className="text-slate-400 text-sm">Sin materiales de empaque.</p>
            )}
          </ul>
        )}
        {tab === 'herrajes' && (
          <ul className="space-y-2">
            {row.components.herrajes.map((m, i) => (
              <li key={`h-${i}`} className="flex justify-between gap-2 text-sm">
                <span className="font-medium text-slate-800">{m.name}</span>
                <span className="shrink-0 font-bold text-slate-600 tabular-nums">
                  {m.quantity} {m.unit}
                </span>
              </li>
            ))}
            {row.components.herrajes.length === 0 && (
              <p className="text-slate-400 text-sm">Sin herrajes en receta.</p>
            )}
          </ul>
        )}
        {tab === 'plano' && (
          blueprintUrl ? (
            <iframe title="Plano" src={blueprintUrl} className="h-[420px] w-full rounded-lg border border-slate-100" />
          ) : (
            <p className="text-slate-400 text-sm">Plano no disponible.</p>
          )
        )}
        {tab === 'fotos' && (
          <div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {photos.map((src, idx) => (
                <img key={idx} src={src} alt="" className="aspect-square rounded-lg object-cover border border-slate-200" />
              ))}
              {row.evidence_photos_urls.map((url, idx) => (
                <img key={`srv-${idx}`} src={url} alt="" className="aspect-square rounded-lg object-cover border border-emerald-200" />
              ))}
            </div>
            {/* Excepción PWA: capture nativo para cámara en iPad/Android */}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPhotoSelected(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => photoInputRef.current?.click()}
              className="h-12 w-full text-sm font-bold"
            >
              <Camera size={18} /> Tomar foto
            </Button>
          </div>
        )}
        {/* H41: step between the photos and the signature, one button per loaded lane. */}
        {tab === 'terminado' && (
          <div className="space-y-3">
            {(row.lanes ?? []).length === 0 && (
              <p className="text-slate-400 text-sm">Sin carriles de instalación.</p>
            )}
            {(row.lanes ?? []).map((lane) => (
              <div key={`${lane.lane}-${lane.assignment_id}`} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">{LANE_LABEL[lane.lane] ?? lane.lane}</p>
                  <p className="text-xs text-slate-500">
                    {LANE_STATUS[lane.status] ?? lane.status}{lane.leader_name ? ` · ${lane.leader_name}` : ''}
                  </p>
                </div>
                {lane.status === 'IN_PROGRESS' && (lane.is_mine || isSupervisor) && (
                  <Button
                    type="button"
                    disabled={!isOnline}
                    onClick={() => setFinishingLane(lane.assignment_id)}
                    className="h-12 shrink-0 px-4 text-sm font-bold bg-emerald-600 hover:bg-emerald-700"
                  >
                    Trabajo terminado
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {tab === 'firma' && (
          <div className="space-y-3">
            {row.signed_received_at ? (
              <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-800">
                Firmado: {formatDateTime(row.signed_received_at)}
              </p>
            ) : !row.can_sign ? (
              <div className="space-y-2">
                <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm font-medium text-amber-800">
                  La firma del cliente va después de marcar el trabajo terminado en cada carril de la casa.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTab('terminado')}
                  className="h-12 w-full text-sm font-bold"
                >
                  Ir a Trabajo terminado
                </Button>
              </div>
            ) : signature ? (
              <div className="space-y-2">
                {/* H60: confirmed once; the canvas goes away until it is synced or redone */}
                <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-800">
                  Firma guardada en el teléfono. Falta Sincronizar para cerrar la casa.
                </p>
                <img src={signature} alt="Firma del cliente" className="max-h-32 rounded-lg border border-slate-200 bg-white" />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setSignature(null)}
                  className="h-12 w-full text-sm font-bold"
                >
                  Volver a firmar
                </Button>
              </div>
            ) : (
              <>
                <div className="rounded-xl border-2 border-slate-200 bg-white overflow-hidden">
                  <SignatureCanvas
                    ref={sigRef}
                    penColor="black"
                    canvasProps={{ className: 'w-full', style: { height: 200, touchAction: 'none' } }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => sigRef.current?.clear()}
                    className="h-12 flex-1 text-sm font-bold"
                  >
                    Limpiar
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (!sigRef.current || sigRef.current.isEmpty()) {
                        toast.warning('Dibuja la firma antes de confirmar.');
                        return;
                      }
                      setSignature(sigRef.current.getTrimmedCanvas().toDataURL('image/png'));
                      toast.success('Firma guardada localmente.');
                    }}
                    className="h-12 flex-1 text-sm font-bold"
                  >
                    Confirmar firma
                  </Button>
                </div>
              </>
            )}
            <div>
              <label className="block mb-1 text-xs font-bold text-slate-500">Notas de obra</label>
              <VTextarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones..."
              />
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur p-4 ml-0 md:ml-64">
        <div className="max-w-lg mx-auto space-y-2">
          {(busy || syncStatus) && (
            <p className={`text-center text-sm font-bold ${
              busy ? 'text-slate-600' : syncStatus?.kind === 'ok' ? 'text-emerald-700'
                : syncStatus?.kind === 'error' ? 'text-red-700' : 'text-amber-700'}`}
            >
              {busy ? 'Procesando...' : syncStatus?.text}
            </p>
          )}
          {/* Gabriel 23/10: "Confirmar firma" is the colored button; Sincronizar goes without fill */}
          <Button
            type="button"
            variant="outline"
            disabled={busy || (!isOnline && !hasLocalPending && pendingCount === 0)}
            onClick={() => void handleSync()}
            className="h-12 w-full text-base font-bold"
          >
            {busy ? 'Procesando...' : 'Sincronizar'}
            {!busy && !isOnline && pendingCount + (hasLocalPending ? 1 : 0) > 0 ? ` (${pendingCount + (hasLocalPending ? 1 : 0)})` : ''}
          </Button>
        </div>
      </div>
      <VConfirmDialog
        isOpen={finishingLane != null}
        title="Trabajo terminado"
        message="¿La cuadrilla terminó este carril en la obra?"
        consequence="Después solo falta la firma del cliente, que cierra la casa y libera la nómina de la cuadrilla."
        confirmLabel="Sí, terminado"
        onConfirm={handleLaneFinished}
        onCancel={() => setFinishingLane(null)}
      />
    </div>
  );
}
