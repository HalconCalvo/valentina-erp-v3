import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
    sanitationService, type BalanceRecalcPreview, type InvoiceStatusFix, type OrderBalanceFix, type RecalcAnomaly,
    type UnpaidAdvance,
} from '@/api/sanitation-service';
import { Button } from '@/components/ui/Button';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { VReasonDialog } from '@/components/ui/VReasonDialog';
import { VSummaryCard } from '@/components/ui/VSummaryCard';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { VToggle } from '@/components/ui/VToggle';
import { toast } from '@/components/ui/VToast';
import { formatDate, formatMoney } from '@/utils/format';

const STATUS_LABELS: Record<string, string> = {
    PAID: 'Pagada', PENDING: 'Pendiente', SOLD: 'Vendida', FINISHED: 'Pagada (saldo cero)',
    IN_PRODUCTION: 'En producción', WAITING_ADVANCE: 'Esperando anticipo', COMPLETED: 'Completada',
};
const TYPE_LABELS: Record<string, string> = { ADVANCE: 'Anticipo', PROGRESS: 'Avance', FULL: '100%', SETTLEMENT: 'Finiquito' };

const label = (status: string) => STATUS_LABELS[status] ?? status;
const change = (before: string, after: string) => before === after ? label(before) : `${label(before)} → ${label(after)}`;

const toggleId = (ids: number[], id: number, on: boolean) => on ? [...ids, id] : ids.filter((x) => x !== id);

/** Sanitation tool 1 (docs/SANEAMIENTO.md §6.1): invoice states and OV balances recalculated from the money. */
export default function BalanceSanitationPage() {
    const navigate = useNavigate();
    const [preview, setPreview] = useState<BalanceRecalcPreview | null>(null);
    const [loading, setLoading] = useState(true);
    const [invoiceIds, setInvoiceIds] = useState<number[]>([]);
    const [orderIds, setOrderIds] = useState<number[]>([]);
    const [confirming, setConfirming] = useState(false);
    const [advances, setAdvances] = useState<UnpaidAdvance[]>([]);
    const [advanceIds, setAdvanceIds] = useState<number[]>([]);
    const [confirmingAdvances, setConfirmingAdvances] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [balances, unpaid] = await Promise.all([
                sanitationService.previewBalances(), sanitationService.previewSupplierAdvances(),
            ]);
            setPreview(balances);
            setAdvances(unpaid);
            setInvoiceIds([]);
            setOrderIds([]);
            setAdvanceIds([]);
        } catch {
            toast.error('No se pudo calcular la vista previa.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const apply = async (reason: string): Promise<boolean> => {
        try {
            const result = await sanitationService.applyBalances(invoiceIds, orderIds, reason);
            toast.success(`Corregidas: ${result.invoices_updated} facturas y ${result.orders_updated} OVs.`);
            result.skipped.forEach((msg) => toast.warning(msg));
            await load();
            return true;
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'No se pudieron aplicar las correcciones.');
            return false;
        }
    };

    const applyAdvances = async (reason: string): Promise<boolean> => {
        try {
            const result = await sanitationService.applySupplierAdvances(advanceIds, reason);
            toast.success(`Anticipos absorbidos: ${result.updated}.`);
            result.skipped.forEach((msg) => toast.warning(msg));
            await load();
            return true;
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'No se pudieron corregir los anticipos.');
            return false;
        }
    };

    const advanceColumns: VTableColumn<UnpaidAdvance>[] = [
        {
            key: 'select', label: '', width: '60px',
            render: (r) => <VToggle checked={advanceIds.includes(r.invoice_id)} label=""
                onCheckedChange={(on) => setAdvanceIds((ids) => toggleId(ids, r.invoice_id, on))} />,
        },
        { key: 'invoice_number', label: 'Factura de anticipo', render: (r) => r.invoice_number },
        { key: 'provider_name', label: 'Proveedor', render: (r) => r.provider_name ?? '—' },
        { key: 'issue_date', label: 'Fecha', render: (r) => formatDate(r.issue_date) },
        { key: 'total_amount', label: 'Monto', render: (r) => formatMoney(r.total_amount) },
        { key: 'open_payments', label: 'Solicitudes abiertas', render: (r) => r.open_payments || '—' },
    ];

    const invoiceColumns: VTableColumn<InvoiceStatusFix>[] = [
        {
            key: 'select', label: '', width: '60px',
            render: (r) => <VToggle checked={invoiceIds.includes(r.cxc_id)} label=""
                onCheckedChange={(on) => setInvoiceIds((ids) => toggleId(ids, r.cxc_id, on))} />,
        },
        { key: 'order_folio', label: 'OV', render: (r) => r.order_folio },
        { key: 'invoice_folio', label: 'Factura', render: (r) => r.invoice_folio || `#${r.cxc_id}` },
        { key: 'payment_type', label: 'Tipo', render: (r) => TYPE_LABELS[r.payment_type] ?? r.payment_type },
        { key: 'amount', label: 'Monto', render: (r) => formatMoney(r.amount) },
        { key: 'amortized_advance', label: 'Anticipo amortizado', render: (r) => formatMoney(r.amortized_advance) },
        { key: 'collected', label: 'Cobrado', render: (r) => formatMoney(r.collected) },
        { key: 'balance', label: 'Saldo', render: (r) => formatMoney(r.balance) },
        { key: 'new_status', label: 'Estado', render: (r) => <span className="font-bold">{change(r.status, r.new_status)}</span> },
    ];

    const orderColumns: VTableColumn<OrderBalanceFix>[] = [
        {
            key: 'select', label: '', width: '60px',
            render: (r) => <VToggle checked={orderIds.includes(r.sales_order_id)} label=""
                onCheckedChange={(on) => setOrderIds((ids) => toggleId(ids, r.sales_order_id, on))} />,
        },
        { key: 'order_folio', label: 'OV', render: (r) => `${r.order_folio}${r.is_legacy ? ' (legacy)' : ''}` },
        { key: 'project_name', label: 'Proyecto', render: (r) => r.project_name },
        { key: 'client_name', label: 'Cliente', render: (r) => r.client_name ?? '—' },
        { key: 'total_price', label: 'Total', render: (r) => formatMoney(r.total_price) },
        { key: 'collected', label: 'Cobrado', render: (r) => formatMoney(r.collected) },
        { key: 'stored_balance', label: 'Saldo guardado', render: (r) => formatMoney(r.stored_balance) },
        { key: 'computed_balance', label: 'Saldo correcto', render: (r) => <span className="font-bold">{formatMoney(r.computed_balance)}</span> },
        { key: 'new_status', label: 'Estado', render: (r) => <span className="font-bold">{change(r.status, r.new_status)}</span> },
    ];

    const anomalyColumns: VTableColumn<RecalcAnomaly>[] = [
        { key: 'order_folio', label: 'OV', render: (r) => r.order_folio, width: '110px' },
        { key: 'message', label: 'Detalle', render: (r) => r.message },
    ];

    const invoices = preview?.invoices ?? [];
    const orders = preview?.orders ?? [];
    const anomalies = preview?.anomalies ?? [];
    const selected = invoiceIds.length + orderIds.length;

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={() => navigate('/management')} title="Regresar a Gerencia"><ArrowLeft size={16} /></Button>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800">Saneamiento de saldos</h1>
                        <p className="text-sm text-slate-500">Estado de facturas y saldo de OVs recalculados con lo cobrado. Elige qué corregir; todo queda en bitácora.</p>
                    </div>
                </div>
                <Button onClick={() => setConfirming(true)} disabled={loading || selected === 0}>
                    Aplicar correcciones ({selected})
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <VSummaryCard label="Facturas con estado distinto" value={invoices.length} tone="amber" />
                <VSummaryCard label="OVs con saldo o estado distinto" value={orders.length} tone="indigo" />
                <VSummaryCard label="Anomalías (corregir a mano)" value={anomalies.length} tone="rose" />
            </div>

            <section className="space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-black text-slate-700">Facturas de cliente</h2>
                    <VToggle label="Seleccionar todas" checked={invoices.length > 0 && invoiceIds.length === invoices.length}
                        onCheckedChange={(on) => setInvoiceIds(on ? invoices.map((r) => r.cxc_id) : [])} disabled={invoices.length === 0} />
                </div>
                <p className="text-xs text-slate-500">Pagada cuando lo cobrado, las notas de crédito y el anticipo amortizado cubren la factura.</p>
                <VTable columns={invoiceColumns} data={invoices} isLoading={loading}
                    emptyState={{ title: 'Sin facturas por corregir', description: 'El estado de todas las facturas coincide con lo cobrado.' }} />
            </section>

            <section className="space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-black text-slate-700">Órdenes de venta</h2>
                    <VToggle label="Seleccionar todas" checked={orders.length > 0 && orderIds.length === orders.length}
                        onCheckedChange={(on) => setOrderIds(on ? orders.map((r) => r.sales_order_id) : [])} disabled={orders.length === 0} />
                </div>
                <p className="text-xs text-slate-500">Saldo correcto = total − abonos vigentes. Con saldo cero pasa a "Pagada (saldo cero)"; con saldo regresa a "Vendida".</p>
                <VTable columns={orderColumns} data={orders} isLoading={loading}
                    emptyState={{ title: 'Sin OVs por corregir', description: 'El saldo de todas las OVs coincide con lo cobrado.' }} />
            </section>

            <section className="space-y-2">
                <h2 className="text-lg font-black text-slate-700">Anomalías</h2>
                {anomalies.length === 0 && !loading
                    ? <VEmptyState title="Sin anomalías" description="No hay facturas con datos imposibles." />
                    : <VTable columns={anomalyColumns} data={anomalies} isLoading={loading} />}
            </section>

            <section className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                    <h2 className="text-lg font-black text-slate-700">Anticipos a proveedor "pagados" sin pago</h2>
                    <div className="flex items-center gap-4">
                        <VToggle label="Seleccionar todos" checked={advances.length > 0 && advanceIds.length === advances.length}
                            onCheckedChange={(on) => setAdvanceIds(on ? advances.map((r) => r.invoice_id) : [])} disabled={advances.length === 0} />
                        <Button onClick={() => setConfirmingAdvances(true)} disabled={loading || advanceIds.length === 0}>
                            Absorber anticipos ({advanceIds.length})
                        </Button>
                    </div>
                </div>
                <p className="text-xs text-slate-500">Al recibir la OC, la factura de la recepción ya cobró el monto completo; estos anticipos nunca se pagaron. Se marcan cancelados (absorbidos).</p>
                <VTable columns={advanceColumns} data={advances} isLoading={loading}
                    emptyState={{ title: 'Sin anticipos por corregir', description: 'Todos los anticipos pagados tienen su pago registrado.' }} />
            </section>

            {confirmingAdvances && (
                <VReasonDialog
                    title="Absorber anticipos sin pago"
                    description={`Se marcarán como canceladas (absorbidas en la recepción) ${advanceIds.length} facturas de anticipo.`}
                    warning="Sus solicitudes de pago pendientes o autorizadas se rechazan para que nunca se paguen. No se mueve dinero; queda en bitácora con el motivo."
                    label="Motivo"
                    placeholder="Ej. Anticipos nunca pagados; la factura de recepción cobró el total (revisado con contabilidad)"
                    requiredMessage="El motivo es obligatorio."
                    confirmLabel="Absorber anticipos"
                    danger
                    onConfirm={applyAdvances}
                    onClose={() => setConfirmingAdvances(false)}
                />
            )}

            {confirming && (
                <VReasonDialog
                    title="Aplicar correcciones de saldo"
                    description={`Se cambiará el estado de ${invoiceIds.length} facturas y el saldo y estado de ${orderIds.length} OVs.`}
                    warning="No se crean abonos, movimientos bancarios ni comisiones. Cada cambio queda en la bitácora con el motivo; para revertir, corrige el dato de origen (abono o factura) y vuelve a aplicar."
                    label="Motivo"
                    placeholder="Ej. Facturas legacy cobradas netas de anticipo (revisado con contabilidad)"
                    requiredMessage="El motivo es obligatorio."
                    confirmLabel="Aplicar correcciones"
                    onConfirm={apply}
                    onClose={() => setConfirming(false)}
                />
            )}
        </div>
    );
}
