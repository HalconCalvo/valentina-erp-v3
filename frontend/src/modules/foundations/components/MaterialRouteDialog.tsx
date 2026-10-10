import React, { useEffect, useState } from 'react';

import Modal from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/VToast';
import axiosClient from '../../../api/axios-client';
import type { Material } from '@/types/foundations';

export type RouteDialogRequest =
    | { kind: 'ROUTE'; materialId: number; fromRoute: string; toRoute: string; stock: number; usageCost: number }
    | { kind: 'WRITE_OFF'; materialId: number; route: string; stock: number; usageCost: number };

interface MaterialRouteDialogProps {
    request: RouteDialogRequest | null;
    onClose: () => void;
    onDone: (material: Material) => void;
}

const money = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
const qty = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 4 });

/** Route change (only MATERIAL holds stock) and stock sent to expense, always with a reason. */
export const MaterialRouteDialog: React.FC<MaterialRouteDialogProps> = ({ request, onClose, onDone }) => {
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => { setReason(''); }, [request]);
    if (!request) return null;

    const hasStock = Math.abs(request.stock) > 0.0001;
    const sendsToExpense = request.kind === 'WRITE_OFF' || (request.fromRoute === 'MATERIAL' && request.toRoute !== 'MATERIAL' && hasStock);

    const confirm = async () => {
        setSaving(true);
        try {
            const res = request.kind === 'ROUTE'
                ? await axiosClient.patch(`/foundations/materials/${request.materialId}/route`, { production_route: request.toRoute, reason: reason.trim() })
                : await axiosClient.post(`/foundations/materials/${request.materialId}/write-off`, { reason: reason.trim() });
            toast.success(sendsToExpense ? 'Listo: la existencia se envió a gasto.' : 'Ruta actualizada.');
            onDone(res.data);
            onClose();
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'No se pudo completar.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen onClose={() => !saving && onClose()} size="sm" overlayZIndex={80}
            title={request.kind === 'ROUTE' ? `Cambiar ruta: ${request.fromRoute} → ${request.toRoute}` : 'Enviar existencia a gasto'}>
            <div className="space-y-3">
                <p className="text-sm text-slate-600">Solo la ruta MATERIAL lleva existencia, se cuenta en el inventario físico y se reserva en producción.</p>
                {sendsToExpense && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
                        <p className="font-bold">Existencia {qty(request.stock)} · valor {money(request.stock * request.usageCost)} se manda a gasto.</p>
                        <p>Si el material está en una sesión de inventario abierta, sale de la sesión sin diferencia y el envío se fecha al corte. Solo Dirección o Gerencia.</p>
                    </div>
                )}
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo obligatorio..." />
                <div className="flex justify-between gap-3 pt-2">
                    <button type="button" disabled={saving} onClick={onClose}
                        className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-black rounded-lg disabled:opacity-50">Cerrar</button>
                    <button type="button" disabled={saving || !reason.trim()} onClick={() => void confirm()}
                        className="px-5 py-2 font-bold rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50">
                        {saving ? 'Procesando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default MaterialRouteDialog;
