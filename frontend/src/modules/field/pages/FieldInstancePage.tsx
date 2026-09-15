import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { ArrowLeft, Camera, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/VToast';
import { useOfflineSync } from '@/field/useOfflineSync';
import {
  queueScan,
  queueSync,
  scanPackage,
  syncInstance,
  type FieldAssignment,
  type SyncPayload,
} from '@/field/field-service';
import { readDraft, saveDraft } from '@/field/field-db';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

type TabId = 'empaque' | 'herrajes' | 'plano' | 'fotos' | 'firma';

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
  const [barcode, setBarcode] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
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

  const handleScan = async () => {
    const code = barcode.trim();
    if (!code) {
      toast.warning('Ingresa o escanea un código de bulto.');
      return;
    }
    setBusy(true);
    try {
      if (isOnline) {
        await scanPackage(instanceId, code);
        toast.success('Bulto registrado.');
      } else {
        await queueScan(instanceId, code);
        toast.info('Bulto en cola offline.');
      }
      setBarcode('');
      await refresh();
    } catch {
      toast.error('No se pudo registrar el bulto.');
    } finally {
      setBusy(false);
    }
  };

  const buildPayload = (): SyncPayload => ({
    photos,
    signature_base64: signature,
    notes,
    scanned_packages: [],
    incidents: [],
  });

  const handleSync = async () => {
    if (!hasLocalPending && pendingCount === 0) {
      toast.warning('No hay datos pendientes.');
      return;
    }
    if (!isOnline) {
      await queueSync(instanceId, buildPayload());
      toast.info('Sincronización en cola offline.');
      await refresh();
      return;
    }
    setBusy(true);
    try {
      if (pendingCount > 0) await flushQueue();
      if (hasLocalPending) {
        await syncInstance(instanceId, buildPayload());
        setPhotos([]);
        setSignature(null);
      }
      toast.success('Sincronizado con el servidor.');
      await refresh();
    } catch {
      await queueSync(instanceId, buildPayload());
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
      <div className="max-w-lg mx-auto py-12 text-center text-slate-500">
        <p>Instancia no encontrada en la jornada.</p>
        <button
          type="button"
          onClick={() => navigate('/field')}
          className="mt-4 min-h-12 rounded-xl bg-orange-600 px-6 text-sm font-bold text-white"
        >
          Regresar
        </button>
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'empaque', label: 'Empaque' },
    { id: 'herrajes', label: 'Herrajes' },
    { id: 'plano', label: 'Plano' },
    { id: 'fotos', label: 'Fotos' },
    { id: 'firma', label: 'Firma' },
  ];

  const blueprintUrl = resolveBlueprintUrl(row.blueprint_path);

  return (
    <div className="max-w-lg mx-auto pb-28">
      <header className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/field')}
          className="flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-slate-200 bg-white"
          title="Regresar"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-black text-slate-900">{row.custom_name}</h1>
          <p className="text-xs font-bold uppercase text-orange-600">{row.type}</p>
        </div>
      </header>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 space-y-1">
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

      <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-12 shrink-0 rounded-xl px-4 text-sm font-bold ${
              tab === t.id ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 min-h-[200px]">
        {tab === 'empaque' && (
          <ul className="space-y-2">
            {row.components.empaque.map((m, i) => (
              <li key={`e-${i}`} className="flex justify-between gap-2 text-sm">
                <span className="font-medium text-slate-800">{m.name}</span>
                <span className="shrink-0 font-bold text-slate-600">
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
                <span className="shrink-0 font-bold text-slate-600">
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
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white"
            >
              <Camera size={18} /> Tomar foto
            </button>
          </div>
        )}
        {tab === 'firma' && (
          <div className="space-y-3">
            {row.signed_received_at ? (
              <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-800">
                Firmado: {new Date(row.signed_received_at).toLocaleString('es-MX')}
              </p>
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
                  <button
                    type="button"
                    onClick={() => sigRef.current?.clear()}
                    className="min-h-12 flex-1 rounded-xl border border-slate-300 text-sm font-bold text-slate-700"
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!sigRef.current || sigRef.current.isEmpty()) {
                        toast.warning('Dibuja la firma antes de confirmar.');
                        return;
                      }
                      setSignature(sigRef.current.getTrimmedCanvas().toDataURL('image/png'));
                      toast.success('Firma guardada localmente.');
                    }}
                    className="min-h-12 flex-1 rounded-xl bg-orange-600 text-sm font-bold text-white"
                  >
                    Confirmar firma
                  </button>
                </div>
              </>
            )}
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-slate-500">Notas de obra</p>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones..."
                className="min-h-12"
              />
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur p-4 ml-0 md:ml-64">
        <div className="max-w-lg mx-auto space-y-2">
          <div className="flex gap-2">
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Código de bulto / QR"
              className="min-h-12 text-base"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleScan()}
              className="min-h-12 shrink-0 rounded-xl bg-slate-800 px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              Escanear
            </button>
          </div>
          <button
            type="button"
            disabled={busy || (!isOnline && !hasLocalPending && pendingCount === 0)}
            onClick={() => void handleSync()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 text-base font-black text-white disabled:opacity-40"
          >
            {busy && <Loader2 size={18} className="animate-spin" />}
            Sincronizar
            {!isOnline && pendingCount + (hasLocalPending ? 1 : 0) > 0 ? ` (${pendingCount + (hasLocalPending ? 1 : 0)})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
