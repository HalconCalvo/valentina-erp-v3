import React, { useMemo, useState } from 'react';
import { AlertTriangle, Save, Truck } from 'lucide-react';
import axiosClient from '../../../api/axios-client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { VPageHeader } from '@/components/ui/VPageHeader';
import { toast } from '@/components/ui/VToast';
import { formatMoney } from '@/utils/format';
import {
    invoiceSummary, lineIsOpen, linePending, linePrice, type ReceptionLine,
} from '../utils/oneInvoiceReception';

/** Gabriel 22/10: one supplier invoice covering several POs of the same provider → one payable. */
interface OneInvoiceReceptionProps {
    orders: any[];
    onBack: () => void;
    onDone: () => void;
}

const TAX_RATE_OPTIONS = [
    { value: '0.16', label: '16%' },
    { value: '0.08', label: '8%' },
    { value: '0', label: 'Exento (0%)' },
];

const todayIso = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const labelClass = 'block text-xs font-bold text-slate-500 mb-1';

export const OneInvoiceReception: React.FC<OneInvoiceReceptionProps> = ({ orders, onBack, onDone }) => {
    const [providerId, setProviderId] = useState('');
    const [chosen, setChosen] = useState<Record<number, boolean>>({});
    const [receivedAt, setReceivedAt] = useState(todayIso());
    const [folio, setFolio] = useState('');
    const [invoiceTotal, setInvoiceTotal] = useState('');
    const [taxRate, setTaxRate] = useState('0.16');
    const [qty, setQty] = useState<Record<number, string>>({});
    const [price, setPrice] = useState<Record<number, string>>({});
    const [toClose, setToClose] = useState<Record<number, boolean>>({});
    const [confirming, setConfirming] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const providers = useMemo(() => {
        const seen = new Map<string, string>();
        orders.forEach((po) => seen.set(String(po.provider_id), po.provider_name || 'Proveedor desconocido'));
        return [...seen.entries()].map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [orders]);

    const providerOrders = orders.filter((po) => String(po.provider_id) === providerId);
    const chosenOrders = providerOrders.filter((po) => chosen[po.id]);

    const lines: ReceptionLine[] = chosenOrders.flatMap((po) => (po.items || [])
        .filter(lineIsOpen)
        .map((item: any) => ({
            po, item,
            qty: qty[item.id] ?? String(linePending(item)),
            price: price[item.id] ?? String(linePrice(item)),
        })));

    const summary = invoiceSummary(lines, Number(taxRate), chosenOrders, Number(invoiceTotal) || 0);

    const choosePo = (poId: number, value: boolean) => setChosen((prev) => ({ ...prev, [poId]: value }));

    const changeProvider = (value: string) => {
        setProviderId(value);
        setChosen({});
        const first = orders.find((po) => String(po.provider_id) === value);
        if (first) setTaxRate(String(Number(first.tax_rate ?? 0.16)));
    };

    const columns: VTableColumn<ReceptionLine>[] = [
        {
            key: 'sku', label: 'SKU', width: '8rem',
            render: ({ item }) => <span className="font-mono text-xs font-semibold text-indigo-600">{item.sku || 'S/SKU'}</span>,
        },
        {
            key: 'name', label: 'Descripción',
            render: ({ item }) => <span className="text-sm font-semibold text-slate-700">{item.name}</span>,
        },
        {
            key: 'pending', label: 'Pendientes', align: 'right',
            render: ({ item }) => <span className="block text-right tabular-nums font-bold text-amber-700">{linePending(item)}</span>,
        },
        {
            key: 'qty', label: 'Esta entrega', align: 'center', width: '8rem',
            render: (line) => (
                <Input type="number" min="0" className="h-7 w-16 mx-auto text-center font-bold text-xs"
                    value={line.qty} onChange={(e) => setQty((prev) => ({ ...prev, [line.item.id]: e.target.value }))} />
            ),
        },
        {
            key: 'price', label: 'P. unit.', align: 'center', width: '8rem',
            render: (line) => (
                <Input type="number" min="0" step="0.01" className="h-7 w-28 ml-auto text-right tabular-nums font-bold text-xs"
                    value={line.price} onChange={(e) => setPrice((prev) => ({ ...prev, [line.item.id]: e.target.value }))} />
            ),
        },
        {
            key: 'close', label: 'Cerrar', width: '7rem',
            render: ({ item }) => (
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <Input type="checkbox" checked={!!toClose[item.id]} className="h-4 w-4 accent-rose-600"
                        onChange={(e) => setToClose((prev) => ({ ...prev, [item.id]: e.target.checked }))} />
                    <span className={`text-xs font-semibold whitespace-nowrap ${toClose[item.id] ? 'text-red-600' : 'text-slate-500'}`}>
                        No llegará más
                    </span>
                </label>
            ),
        },
        {
            key: 'amount', label: 'Importe', align: 'right', width: '9rem',
            render: (line) => (
                <span className="block text-right tabular-nums font-bold text-slate-800">
                    {formatMoney((Number(line.qty) || 0) * (Number(line.price) || 0))}
                </span>
            ),
        },
    ];

    const startConfirm = () => {
        if (chosenOrders.length === 0) { toast.warning('Elige las OCs que ampara la factura.'); return; }
        if (!folio.trim() || invoiceTotal === '') {
            toast.warning('Ingresa el folio de la factura y su monto con IVA.');
            return;
        }
        if (summary.subtotal <= 0) { toast.warning('Captura lo que llegó en esta entrega.'); return; }
        setConfirming(true);
    };

    const submit = async () => {
        setIsSubmitting(true);
        try {
            await axiosClient.post('/purchases/receptions/one-invoice', {
                invoice_folio: folio.trim(),
                invoice_total: Number(invoiceTotal),
                received_at: receivedAt,
                tax_rate: Number(taxRate),
                orders: chosenOrders.map((po) => ({
                    po_id: po.id,
                    received_items: lines.filter((l) => l.po.id === po.id).map((l) => ({
                        item_id: l.item.id, sku: l.item.sku, expected_qty: l.item.qty,
                        received_qty: Number(l.qty) || 0, unit_cost: Number(l.price) || 0, description: l.item.name || '',
                    })),
                    items_to_close: lines.filter((l) => l.po.id === po.id && toClose[l.item.id]).map((l) => l.item.id),
                })),
            });
            toast.success(`Factura ${folio.trim()} recibida en ${chosenOrders.length} OC(s).`);
            setConfirming(false);
            onDone();
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'No se pudo registrar la recepción.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn pb-10">
            <VPageHeader
                icon={Truck}
                title="Recibir con una factura"
                subtitle="Varias OCs del mismo proveedor que llegan con una sola factura"
                onBack={onBack}
                backLabel="Regresar al Andén"
            />

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="lg:col-span-2">
                        <label className={labelClass}>Proveedor *</label>
                        <SearchableSelect items={providers} value={providerId} onChange={changeProvider}
                            getLabel={(o) => o.label} getValue={(o) => o.value} placeholder="Buscar proveedor..." />
                    </div>
                    <div>
                        <label className={labelClass}>Fecha real de llegada *</label>
                        <Input type="date" value={receivedAt} max={todayIso()} onChange={(e) => setReceivedAt(e.target.value)} />
                    </div>
                    <div>
                        <label className={labelClass}>Factura que trajo el chofer *</label>
                        <Input placeholder="Folio" value={folio} onChange={(e) => setFolio(e.target.value)} />
                    </div>
                    <div>
                        <label className={labelClass}>Monto de la factura (con IVA) *</label>
                        <Input type="number" min="0" step="0.01" placeholder="0.00" className="text-right tabular-nums font-bold"
                            value={invoiceTotal} onChange={(e) => setInvoiceTotal(e.target.value)} />
                    </div>
                </div>
                {providerId && (
                    <div className="border-t border-slate-100 pt-3">
                        <p className={labelClass}>OCs que ampara la factura</p>
                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                            {providerOrders.map((po) => (
                                <label key={po.id} className="inline-flex items-center gap-2 cursor-pointer select-none text-sm">
                                    <Input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={!!chosen[po.id]}
                                        onChange={(e) => choosePo(po.id, e.target.checked)} />
                                    <span className="font-semibold text-slate-800">{po.folio}</span>
                                    <span className="text-xs text-slate-500">
                                        {po.status === 'RECIBIDA_PARCIAL' ? 'Entrega parcial' : 'En tránsito'}
                                        {Number(po.advance_paid || 0) > 0 ? ` · anticipo pagado ${formatMoney(Number(po.advance_paid))}` : ''}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <VTable
                columns={columns as unknown as VTableColumn<Record<string, unknown>>[]}
                data={lines as unknown as Record<string, unknown>[]}
                headerStyle="report"
                className="shadow-sm"
                stickyHeader={false}
                groupBy={(row) => String((row as unknown as ReceptionLine).po.folio)}
                renderGroupHeader={(key) => <span className="font-semibold text-indigo-700">{key}</span>}
                emptyState={{ title: providerId ? 'Elige las OCs que ampara la factura.' : 'Elige el proveedor.' }}
            />

            {summary.mismatch && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-start gap-3">
                    <AlertTriangle size={20} className="shrink-0 mt-0.5 text-amber-600" />
                    <p className="text-sm font-bold text-amber-700">
                        El monto de la factura ({formatMoney(Number(invoiceTotal) || 0)}) no coincide con lo recibido
                        ({formatMoney(summary.total)}). Revisa cantidades y precios antes de confirmar.
                    </p>
                </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
                <Button onClick={startConfirm} disabled={isSubmitting}>
                    <Save size={16} /> {isSubmitting ? 'Procesando...' : 'Confirmar ingreso'}
                </Button>
                <div className="w-full lg:w-96 space-y-1 text-sm text-slate-600">
                    <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums font-bold">{formatMoney(summary.subtotal)}</span></div>
                    <div className="w-full">
                        <div className="flex justify-between items-center gap-3">
                            <span className="whitespace-nowrap">IVA</span>
                            <div className="w-32">
                                <SearchableSelect items={TAX_RATE_OPTIONS} value={taxRate} onChange={setTaxRate}
                                    getLabel={(o) => o.label} getValue={(o) => o.value} />
                            </div>
                            <span className="tabular-nums font-bold">{formatMoney(summary.tax)}</span>
                        </div>
                    </div>
                    <div className="flex justify-between"><span>Total recibido (con IVA)</span><span className="tabular-nums font-bold">{formatMoney(summary.total)}</span></div>
                    <div className="flex justify-between"><span>Anticipos pagados de estas OCs</span><span className="tabular-nums font-bold">{formatMoney(-summary.advances)}</span></div>
                    <div className="flex justify-between pt-1 border-t border-slate-100">
                        <span className="font-black text-slate-700">{summary.inFavor > 0 ? 'A favor con el proveedor' : 'Por pagar'}</span>
                        <span className="text-xl font-black text-slate-900 tabular-nums">{formatMoney(summary.inFavor > 0 ? summary.inFavor : summary.toPay)}</span>
                    </div>
                </div>
            </div>

            <VConfirmDialog
                isOpen={confirming}
                title="Confirmar ingreso"
                message={`Factura ${folio.trim()} por ${formatMoney(Number(invoiceTotal) || 0)} en ${chosenOrders.map((po) => po.folio).join(', ')}.`}
                consequence={summary.toPay > 0
                    ? `Se crea una sola cuenta por pagar de ${formatMoney(summary.toPay)} (o se suma a la pendiente de esta factura). El inventario entra con los precios capturados.`
                    : 'Los anticipos cubren la factura: queda pagada. El inventario entra con los precios capturados.'}
                confirmLabel="Confirmar ingreso"
                onConfirm={submit}
                onCancel={() => setConfirming(false)}
            />
        </div>
    );
};

export default OneInvoiceReception;
