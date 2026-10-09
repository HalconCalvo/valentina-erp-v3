import React, { useEffect, useState } from 'react';
import axiosClient from '../../../api/axios-client';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VToggle } from '@/components/ui/VToggle';
import Modal from '@/components/ui/Modal';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { Material } from '@/types/foundations';
import { RecordHistoryButton } from '@/components/audit/RecordHistoryButton';
import { toast } from '@/components/ui/VToast';

interface MaterialFormProps {
    initialSku?: string;
    initialProviderId?: number;
    materialId?: number;
    onCreated: (material: Material) => void;
    onCancel: () => void;
}

const ROUTES = [
    { value: 'MATERIAL', label: 'MATERIAL (Inventariable)' },
    { value: 'PROCESO', label: 'PROCESO (Interno)' },
    { value: 'CONSUMIBLE', label: 'CONSUMIBLE (Gasto)' },
    { value: 'SERVICIO', label: 'SERVICIO (Externo)' },
];

const emptyForm = (initialSku = '', initialProviderId = 0) => ({
    sku: initialSku,
    name: '',
    category: '',
    production_route: 'MATERIAL' as Material['production_route'],
    purchase_unit: '',
    usage_unit: '',
    conversion_factor: 1,
    current_cost: 0,
    min_stock: 0,
    max_stock: 0,
    is_resale: false,
    sale_price: 0,
    associated_element_sku: '',
    provider_id: initialProviderId,
});

export const MaterialForm: React.FC<MaterialFormProps> = ({
    initialSku = '',
    initialProviderId = 0,
    materialId,
    onCreated,
    onCancel,
}) => {
    const isEditing = materialId != null;
    const [form, setForm] = useState(() => emptyForm(initialSku, initialProviderId));
    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
    const [deactivating, setDeactivating] = useState(false);
    // Inventariable yes/no: changed only with a reason (DIRECTOR/MANAGER/ADMIN); stock goes to expense
    const role = (localStorage.getItem('user_role') || '').toUpperCase();
    const canChangeInventoriable = ['DIRECTOR', 'MANAGER', 'ADMIN'].includes(role);
    const [stockInfo, setStockInfo] = useState<{ inventoriable: boolean; stock: number; usageCost: number }>({ inventoriable: true, stock: 0, usageCost: 0 });
    const [inventoriableDialog, setInventoriableDialog] = useState(false);
    const [inventoriableReason, setInventoriableReason] = useState('');
    const [changingInventoriable, setChangingInventoriable] = useState(false);

    useEffect(() => {
        if (!materialId) return;
        const loadMaterial = async () => {
            setLoading(true);
            setError('');
            try {
                const res = await axiosClient.get('/foundations/materials', {
                    params: { include_inactive: true },
                });
                const rows = Array.isArray(res.data) ? res.data : [];
                const mat = rows.find((m: Material) => m.id === materialId);
                if (!mat) {
                    setError('Material no encontrado.');
                    return;
                }
                setStockInfo({
                    inventoriable: mat.is_inventoriable !== false,
                    stock: Number((mat as Material & { physical_stock?: number }).physical_stock) || 0,
                    usageCost: (Number(mat.current_cost) || 0) / (Number(mat.conversion_factor) || 1),
                });
                setForm({
                    sku: mat.sku,
                    name: mat.name,
                    category: mat.category,
                    production_route: mat.production_route,
                    purchase_unit: mat.purchase_unit,
                    usage_unit: mat.usage_unit,
                    conversion_factor: mat.conversion_factor ?? 1,
                    current_cost: mat.current_cost ?? 0,
                    min_stock: (mat as Material & { min_stock?: number }).min_stock ?? 0,
                    max_stock: (mat as Material & { max_stock?: number }).max_stock ?? 0,
                    is_resale: mat.is_resale ?? false,
                    sale_price: mat.sale_price ?? 0,
                    associated_element_sku: mat.associated_element_sku ?? '',
                    provider_id: mat.provider_id ?? 0,
                });
            } catch {
                setError('No se pudo cargar el material.');
            } finally {
                setLoading(false);
            }
        };
        void loadMaterial();
    }, [materialId]);

    const handleInventoriable = async () => {
        if (!materialId) return;
        setChangingInventoriable(true);
        try {
            const res = await axiosClient.patch(`/foundations/materials/${materialId}/inventoriable`, {
                is_inventoriable: !stockInfo.inventoriable,
                reason: inventoriableReason.trim(),
            });
            setStockInfo({ ...stockInfo, inventoriable: res.data.is_inventoriable !== false, stock: Number(res.data.physical_stock) || 0 });
            setInventoriableDialog(false);
            toast.success(res.data.is_inventoriable === false ? 'Material no inventariable; su existencia se envió a gasto.' : 'Material inventariable.');
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'No se pudo cambiar.');
        } finally {
            setChangingInventoriable(false);
        }
    };

    const upd = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

    const buildPayload = () => ({
        ...form,
        sku: form.sku.trim(),
        name: form.name.trim(),
        associated_element_sku: form.associated_element_sku?.trim() === '' ? null : form.associated_element_sku,
        provider_id: form.provider_id === 0 ? null : form.provider_id,
        is_resale: form.is_resale,
        sale_price: form.is_resale ? Number(form.sale_price) : 0,
        min_stock: Number(form.min_stock) || 0,
        max_stock: Number(form.max_stock) || 0,
    });

    const handleSave = async () => {
        if (!form.sku?.trim() || !form.name?.trim() || !form.category?.trim()) {
            setError('SKU, Nombre y Categoría son obligatorios.');
            return;
        }
        if (!form.purchase_unit?.trim() || !form.usage_unit?.trim()) {
            setError('Unidad de compra y de uso son obligatorias.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const payload = buildPayload();
            if (isEditing && materialId) {
                const res = await axiosClient.put(`/foundations/materials/${materialId}`, payload);
                onCreated(res.data);
            } else {
                const res = await axiosClient.post('/foundations/materials', payload);
                onCreated(res.data);
            }
        } catch (err: unknown) {
            const detail =
                err && typeof err === 'object' && 'response' in err
                    ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                    : undefined;
            setError(typeof detail === 'string' ? detail : 'No se pudo guardar el material.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeactivate = async () => {
        if (!materialId) return;
        setDeactivating(true);
        try {
            await axiosClient.delete(`/foundations/materials/${materialId}`);
            onCreated({ ...form, id: materialId, is_active: false } as Material);
        } catch (err: unknown) {
            const detail =
                err && typeof err === 'object' && 'response' in err
                    ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                    : undefined;
            setError(typeof detail === 'string' ? detail : 'No se pudo dar de baja el material.');
        } finally {
            setDeactivating(false);
            setShowDeactivateConfirm(false);
        }
    };

    const inputCls = 'w-full text-xs border border-slate-200 rounded px-2 py-2 outline-none focus:border-indigo-500';
    const labelCls = 'text-[10px] font-black text-slate-400 uppercase block mb-1';

    return (
        <>
            <Modal
                isOpen
                onClose={onCancel}
                title={isEditing ? 'Editar material' : 'Alta de material nuevo'}
                size="lg"
            >
                {loading ? (
                    <p className="text-sm text-slate-500 py-8 text-center">Cargando material...</p>
                ) : (
                    <>
                        {isEditing && (
                            <div className="flex justify-end -mt-2 mb-2 items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                                Historial de cambios
                                <RecordHistoryButton tableName="materials" recordId={materialId} label={form.sku || `Material #${materialId}`} />
                            </div>
                        )}
                        {error && (
                            <div className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">
                                {error}
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>SKU (único) *</label>
                                <Input
                                    className={inputCls}
                                    value={form.sku}
                                    onChange={(e) => upd({ sku: e.target.value })}
                                    placeholder="Ej. TAB-BL-15"
                                    disabled={isEditing}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Nombre / Descripción *</label>
                                <Input
                                    className={inputCls}
                                    value={form.name}
                                    onChange={(e) => upd({ name: e.target.value })}
                                    placeholder="Ej. MDF Blanco 15mm"
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Categoría *</label>
                                <Input
                                    className={inputCls}
                                    value={form.category}
                                    onChange={(e) => upd({ category: e.target.value })}
                                    placeholder="Ej. Tableros"
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Ruta Producción *</label>
                                <SearchableSelect
                                    items={ROUTES}
                                    value={form.production_route}
                                    onChange={(v) => upd({ production_route: v as Material['production_route'] })}
                                    getLabel={(r) => r.label}
                                    getValue={(r) => r.value}
                                    placeholder="Seleccionar ruta..."
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Unidad Compra *</label>
                                <Input
                                    className={inputCls}
                                    value={form.purchase_unit}
                                    onChange={(e) =>
                                        upd({
                                            purchase_unit: e.target.value,
                                            usage_unit: form.usage_unit || e.target.value,
                                        })
                                    }
                                    placeholder="Ej. Hoja"
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Unidad Uso *</label>
                                <Input
                                    className={inputCls}
                                    value={form.usage_unit}
                                    onChange={(e) => upd({ usage_unit: e.target.value })}
                                    placeholder="Ej. m2"
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Factor Conversión</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    className={inputCls}
                                    value={form.conversion_factor}
                                    onChange={(e) => upd({ conversion_factor: parseFloat(e.target.value) || 1 })}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Costo Unitario</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    className={inputCls}
                                    value={form.current_cost}
                                    onChange={(e) => upd({ current_cost: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Stock Mínimo</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    className={inputCls}
                                    value={form.min_stock}
                                    onChange={(e) => upd({ min_stock: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Stock Máximo</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    className={inputCls}
                                    value={form.max_stock}
                                    onChange={(e) => upd({ max_stock: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            {isEditing && (
                                <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                    <span className="text-sm text-slate-700">
                                        Inventariable: <b>{stockInfo.inventoriable ? 'Sí' : 'No (va a gasto)'}</b>
                                        {stockInfo.inventoriable && ` · existencia ${stockInfo.stock.toLocaleString('en-US', { maximumFractionDigits: 4 })}`}
                                    </span>
                                    {canChangeInventoriable && (
                                        <button type="button" onClick={() => { setInventoriableReason(''); setInventoriableDialog(true); }}
                                            className="px-3 py-1 text-xs font-bold rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50">
                                            {stockInfo.inventoriable ? 'Marcar no inventariable' : 'Marcar inventariable'}
                                        </button>
                                    )}
                                </div>
                            )}
                            <div className="col-span-2">
                                <VToggle
                                    checked={Boolean(form.is_resale)}
                                    onCheckedChange={(checked) => upd({ is_resale: checked })}
                                    label="Es producto de reventa (se vende directo, sin receta)"
                                />
                            </div>
                            {form.is_resale && (
                                <div>
                                    <label className={labelCls}>Precio de venta</label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        className={inputCls}
                                        value={form.sale_price}
                                        onChange={(e) => upd({ sale_price: parseFloat(e.target.value) || 0 })}
                                        placeholder="Ej. 850.00"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="flex justify-between gap-3 mt-5">
                            {isEditing ? (
                                <button
                                    type="button"
                                    onClick={() => setShowDeactivateConfirm(true)}
                                    disabled={saving || deactivating}
                                    className="text-xs font-black uppercase px-4 py-2 text-red-600 hover:text-red-800 disabled:opacity-50"
                                >
                                    Dar de baja
                                </button>
                            ) : (
                                <span />
                            )}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    disabled={saving || deactivating}
                                    className="text-xs font-black uppercase px-4 py-2 text-slate-500 hover:text-slate-700 disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleSave()}
                                    disabled={saving || deactivating}
                                    className="text-xs font-black uppercase px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                                >
                                    {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear y usar'}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </Modal>

            <Modal isOpen={inventoriableDialog} onClose={() => !changingInventoriable && setInventoriableDialog(false)}
                title={stockInfo.inventoriable ? 'Marcar como no inventariable' : 'Marcar como inventariable'} size="sm" overlayZIndex={70}>
                <div className="space-y-3">
                    {stockInfo.inventoriable ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
                            <p>Deja de contarse en el inventario físico (sale de la sesión abierta sin diferencia), no se reserva en producción y al recibirse va a gasto.</p>
                            {Math.abs(stockInfo.stock) > 0.0001 && (
                                <p className="font-bold">
                                    Su existencia ({stockInfo.stock.toLocaleString('en-US', { maximumFractionDigits: 4 })}, valor{' '}
                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(stockInfo.stock * stockInfo.usageCost)})
                                    se manda a gasto. Solo Dirección o Gerencia pueden hacerlo.
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-600">Vuelve a contarse y a tener existencia desde cero.</p>
                    )}
                    <Input value={inventoriableReason} onChange={(e) => setInventoriableReason(e.target.value)} placeholder="Motivo obligatorio..." />
                    <div className="flex justify-between gap-3 pt-2">
                        <button type="button" disabled={changingInventoriable} onClick={() => setInventoriableDialog(false)}
                            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-black rounded-lg disabled:opacity-50">Cerrar</button>
                        <button type="button" disabled={changingInventoriable || !inventoriableReason.trim()} onClick={() => void handleInventoriable()}
                            className="px-5 py-2 font-bold rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50">
                            {changingInventoriable ? 'Procesando...' : 'Confirmar'}
                        </button>
                    </div>
                </div>
            </Modal>

            <VConfirmDialog
                isOpen={showDeactivateConfirm}
                title="Dar de baja material"
                message="¿Estás seguro de dar de baja este material?"
                consequence="El material quedará inactivo (is_active = false) y no estará disponible para nuevas operaciones."
                variant="danger"
                confirmLabel="Sí, dar de baja"
                onConfirm={() => void handleDeactivate()}
                onCancel={() => setShowDeactivateConfirm(false)}
            />
        </>
    );
};
