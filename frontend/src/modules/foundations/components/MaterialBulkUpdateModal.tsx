import { useState } from 'react';
import { Download } from 'lucide-react';
import {
    materialImportService, type MaterialChangeRow, type MaterialImportIssue, type MaterialImportPreview,
} from '@/api/material-import-service';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { VReasonDialog } from '@/components/ui/VReasonDialog';
import { VSummaryCard } from '@/components/ui/VSummaryCard';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { toast } from '@/components/ui/VToast';

const changeColumns: VTableColumn<MaterialChangeRow>[] = [
    { key: 'row', label: 'Fila', render: (r) => r.row, width: '60px' },
    { key: 'sku', label: 'SKU', render: (r) => r.sku },
    { key: 'name', label: 'Material', render: (r) => r.name },
    {
        key: 'changes', label: 'Cambios',
        render: (r) => (
            <div className="space-y-0.5 text-xs">
                {r.changes.map((c) => <div key={c.field}><b>{c.label}:</b> {c.old ?? '—'} → {c.new ?? '—'}</div>)}
            </div>
        ),
    },
];

const issueColumns: VTableColumn<MaterialImportIssue>[] = [
    { key: 'row', label: 'Fila', render: (r) => r.row, width: '60px' },
    { key: 'sku', label: 'SKU', render: (r) => r.sku ?? '—' },
    { key: 'message', label: 'Detalle', render: (r) => r.message },
];

/** Sanitation tool 4 (docs/SANEAMIENTO.md §5.3): complete the catalog from Excel, all or nothing, with a reason. */
export function MaterialBulkUpdateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<MaterialImportPreview | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const downloadTemplate = async () => {
        setBusy(true);
        try {
            const url = URL.createObjectURL(await materialImportService.downloadTemplate());
            const link = document.createElement('a');
            link.href = url;
            link.download = 'actualizacion_materiales.xlsx';
            link.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('No se pudo descargar la plantilla.');
        } finally {
            setBusy(false);
        }
    };

    const validate = async () => {
        if (!file) return;
        setBusy(true);
        try {
            setPreview(await materialImportService.validate(file));
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'No se pudo validar el archivo.');
        } finally {
            setBusy(false);
        }
    };

    const apply = async (reason: string): Promise<boolean> => {
        if (!file) return false;
        try {
            const result = await materialImportService.apply(file, reason);
            toast.success(`Materiales actualizados: ${result.updated}.`);
            onDone();
            onClose();
            return true;
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'No se pudieron aplicar los cambios.');
            return false;
        }
    };

    const canApply = Boolean(preview && preview.rows.length > 0 && preview.errors.length === 0);

    return (
        <Modal isOpen onClose={onClose} title="Actualización masiva de materiales" size="xl">
            <div className="space-y-4">
                <p className="text-sm text-slate-600">
                    1. Descarga la plantilla (trae los materiales activos sin proveedor, sin unidades o con costo cero).
                    2. Llena proveedor, unidades, factor o costo; celda vacía = sin cambio. 3. Valida y aplica con motivo.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                    <Button variant="outline" onClick={downloadTemplate} disabled={busy}>
                        <Download size={16} className="mr-2" /> Descargar plantilla
                    </Button>
                    <div className="flex-1 min-w-[240px]">
                        <Input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} />
                    </div>
                    <Button onClick={validate} disabled={busy || !file}>Validar</Button>
                </div>

                {preview && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <VSummaryCard label="Materiales con cambios" value={preview.rows.length} tone="indigo" />
                            <VSummaryCard label="Sin cambios" value={preview.unchanged} tone="slate" />
                            <VSummaryCard label="Errores" value={preview.errors.length} tone={preview.errors.length ? 'rose' : 'emerald'} />
                        </div>
                        {preview.errors.length > 0 && (
                            <VTable columns={issueColumns} data={preview.errors} />
                        )}
                        <VTable columns={changeColumns} data={preview.rows}
                            emptyState={{ title: 'Sin cambios', description: 'El archivo no cambia ningún material.' }} />
                        <div className="flex justify-end">
                            <Button onClick={() => setConfirming(true)} disabled={!canApply}>
                                Aplicar cambios ({preview.rows.length})
                            </Button>
                        </div>
                    </>
                )}
            </div>

            {confirming && preview && (
                <VReasonDialog
                    title="Aplicar actualización del catálogo"
                    description={`Se actualizarán ${preview.rows.length} materiales tal como muestra la vista previa.`}
                    warning="El costo nuevo se usa desde ahora en cotizaciones y valuación. Se aplica todo o nada y cada cambio queda en la bitácora con el motivo."
                    label="Motivo"
                    placeholder="Ej. Catálogo completado por compras (proveedores y unidades)"
                    requiredMessage="El motivo es obligatorio."
                    confirmLabel="Aplicar cambios"
                    onConfirm={apply}
                    onClose={() => setConfirming(false)}
                />
            )}
        </Modal>
    );
}
