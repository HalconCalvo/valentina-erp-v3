import React, { useState, useEffect, useMemo } from 'react';
import {
    Truck, CheckCircle2, Save, PackageCheck, Ban, AlertTriangle, Plus, X,
} from 'lucide-react';
import axiosClient from '../../../api/axios-client';
import { MaterialForm } from '../components/MaterialForm';
import { Button } from "@/components/ui/Button";
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { toast } from '@/components/ui/VToast';
import { formatDate, formatMoney } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import { ModalFooter } from '@/components/ui/ModalFooter';
import { VPageHeader } from '@/components/ui/VPageHeader';

type PendingConfirm =
    | { kind: 'cancel' }
    | { kind: 'declareSatisfied' }
    | { kind: 'submitDuplicateFolio' }
    | { kind: 'submitFinancialMismatch' };

type ReceptionRow = { idx: number; item: any };

/** Total with VAT of a PO (same formula the list always used). */
const poTotalWithTax = (po: any): number => (po?.total_estimated_amount || 0) * (1 + Number(po?.tax_rate ?? 0.16));

interface InventoryReceptionPageProps {
    /** Inside the Compras hub: the hub draws the section header, so the list hides its own. */
    embedded?: boolean;
    /** Tells the hub when a PO is open, so it hides its section header (the reception has its own). */
    onSubSectionChange?: (isActive: boolean) => void;
}

const TAX_RATE_OPTIONS = [
    { value: '0.16', label: '16%' },
    { value: '0.08', label: '8%' },
    { value: '0', label: 'Exento (0%)' },
];

// Utilidades seguras
const formatCurrency = (amount: any): string => formatMoney(Number(amount));

const formatInitialAmount = (num: any): string => {
    const val = Number(num);
    if (isNaN(val)) return '';
    const [integerPart, decimalPart] = val.toFixed(2).split('.');
    return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimalPart}`;
};

/** Today's date (YYYY-MM-DD) in local business time; the receipt date can never be in the future. */
const todayIso = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const InventoryReceptionPage: React.FC<InventoryReceptionPageProps> = ({ embedded = false, onSubSectionChange }) => {
    const [incomingPOs, setIncomingPOs] = useState<any[]>([]);
    const [isLoadingPOs, setIsLoadingPOs] = useState(false);
    
    const [selectedPO, setSelectedPO] = useState<any | null>(null);
    const [invoiceFolio, setInvoiceFolio] = useState('');
    const [receivedAt, setReceivedAt] = useState<string>(todayIso());
    const [folioWarning, setFolioWarning] = useState<any[] | null>(null);
    const [invoiceTotal, setInvoiceTotal] = useState<number | ''>('');
    const [displayTotal, setDisplayTotal] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false); // NUEVO ESTADO
    const [declaringSatisfied, setDeclaringSatisfied] = useState(false);
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const canDeclare = ['ADMIN', 'ADMINISTRACION', 'ADMINISTRADOR', 'MANAGER', 'DIRECTOR'].includes(userRole);
    
    const [receivedItems, setReceivedItems] = useState<Record<number, string>>({});
    const [editedPrices, setEditedPrices] = useState<Record<number, string>>({});
    const [editedDescriptions, setEditedDescriptions] = useState<Record<number, string>>({});
    const [taxRate, setTaxRate] = useState<number>(0.16);
    const [itemsToClose, setItemsToClose] = useState<Record<number, boolean>>({});

    const [advanceModal, setAdvanceModal] = useState<{open: boolean, po: any | null}>({open: false, po: null});
    const [advanceAmount, setAdvanceAmount] = useState('');
    const [advanceLoading, setAdvanceLoading] = useState(false);
    const [materialsList, setMaterialsList] = useState<any[]>([]);
    const [addedRows, setAddedRows] = useState<Array<{ material_id: number | null; sku: string; name: string; received_qty: string; unit_cost: string; search: string }>>([]);
    const [showMaterialForm, setShowMaterialForm] = useState<{ rowIndex: number; sku: string } | null>(null);
    const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

    useEffect(() => {
        onSubSectionChange?.(selectedPO !== null);
    }, [selectedPO, onSubSectionChange]);

    useEffect(() => {
        fetchIncomingPOs();
        axiosClient.get('/foundations/materials')
            .then(res => setMaterialsList(Array.isArray(res.data) ? res.data : (res.data?.materials || res.data?.items || [])))
            .catch(() => setMaterialsList([]));
    }, []);

    const fetchIncomingPOs = async () => {
        setIsLoadingPOs(true);
        try {
            const [resEnviada, resParcial] = await Promise.all([
                axiosClient.get('/purchases/orders/?status=ENVIADA'),
                axiosClient.get('/purchases/orders/?status=RECIBIDA_PARCIAL')
            ]);
            const allPOs = [...(resEnviada.data || []), ...(resParcial.data || [])];
            setIncomingPOs(allPOs);
        } catch {
            toast.error('Error al cargar OCs en tránsito.');
            setIncomingPOs([]);
        } finally {
            setIsLoadingPOs(false);
        }
    };

    const handleRequestAdvance = async () => {
        if (!advanceModal.po) return;
        const amount = parseFloat(advanceAmount.replace(/,/g, ''));
        if (!amount || amount <= 0) {
            toast.warning('Ingresa un monto válido mayor a $0.');
            return;
        }
        setAdvanceLoading(true);
        try {
            await axiosClient.post(`/purchases/orders/${advanceModal.po.id}/request-advance`, { amount });
            toast.success(`Anticipo de ${formatCurrency(amount)} registrado. Tesorería lo procesará.`);
            setAdvanceModal({ open: false, po: null });
            setAdvanceAmount('');
            fetchIncomingPOs();
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Error al registrar el anticipo.');
        } finally {
            setAdvanceLoading(false);
        }
    };

    // Total RECIBIDO con IVA a partir de un mapa de cantidades (misma fórmula de price del archivo).
    const calcTotalRecibidoConIva = (po: any, received: Record<number, string>) => {
        const subtotal = (po?.items || []).reduce((sum: number, item: any, idx: number) => {
            const price = item.unit_price || item.expected_cost || item.price || 0;
            const qty = Number(received[idx]) || 0;
            return sum + (qty * price);
        }, 0);
        return subtotal * (1 + Number(po?.tax_rate ?? 0.16));
    };

    const handleSelectPO = (po: any) => {
        if (!po) return;
        setSelectedPO(po);
        setTaxRate(Number(po.tax_rate ?? 0.16));  // the PO's rate (D4); the invoice may still differ
        setInvoiceFolio('');
        setReceivedAt(todayIso());

        const initialReceived: Record<number, string> = {};
        (po.items || []).forEach((item: any, idx: number) => {
            const alreadyReceived = Number(item.quantity_received || 0);
            const pending = Math.max((item.qty || 0) - alreadyReceived, 0);
            initialReceived[idx] = String(pending);
        });
        setReceivedItems(initialReceived);
        setItemsToClose({});
        setAddedRows([]);
        setFolioWarning(null);

        // El total inicial refleja lo que se va a RECIBIR, no el total de la OC completa.
        const totalRecibido = calcTotalRecibidoConIva(po, initialReceived);
        setInvoiceTotal(totalRecibido);
        setDisplayTotal(formatInitialAmount(totalRecibido));
    };

    const handleAmountInput = (val: string) => {
        let cleanVal = val.replace(/[^0-9.]/g, '');
        if ((cleanVal.match(/\./g) || []).length > 1) cleanVal = cleanVal.substring(0, cleanVal.lastIndexOf('.'));
        if (cleanVal.includes('.')) {
            const parts = cleanVal.split('.');
            if (parts[1].length > 2) cleanVal = `${parts[0]}.${parts[1].substring(0, 2)}`;
        }
        if (cleanVal === '') {
            setDisplayTotal('');
            setInvoiceTotal('');
            return;
        }
        setInvoiceTotal(parseFloat(cleanVal));
        const parts = cleanVal.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        setDisplayTotal(parts.join('.'));
    };

    const handleBlur = () => {
        if (typeof invoiceTotal === 'number' && invoiceTotal > 0) {
            setDisplayTotal(formatInitialAmount(invoiceTotal));
        }
    };

    const handleReceivedQtyChange = (idx: number, val: string) => {
        setReceivedItems(prev => {
            const next = { ...prev, [idx]: val };
            const nuevoTotal = calcTotalRecibidoConIva(selectedPO, next);
            setInvoiceTotal(nuevoTotal);
            setDisplayTotal(formatInitialAmount(nuevoTotal));
            return next;
        });
    };

    const handlePriceChange = (idx: number, value: string) => {
        setEditedPrices(prev => ({ ...prev, [idx]: value }));
    };

    const handleDescriptionChange = (idx: number, value: string) => {
        setEditedDescriptions(prev => ({ ...prev, [idx]: value }));
    };

    const addNewRow = () => {
        setAddedRows(prev => [...prev, { material_id: null, sku: '', name: '', received_qty: '', unit_cost: '', search: '' }]);
    };
    const removeAddedRow = (i: number) => {
        setAddedRows(prev => prev.filter((_, idx) => idx !== i));
    };
    const updateAddedRow = (i: number, patch: Partial<{ material_id: number | null; sku: string; name: string; received_qty: string; unit_cost: string; search: string }>) => {
        setAddedRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
    };
    const selectMaterialForRow = (i: number, mat: any) => {
        updateAddedRow(i, { material_id: mat.id, sku: mat.sku, name: mat.name, search: `${mat.sku} — ${mat.name}` });
    };

    const checkFolioDuplicado = async () => {
        if (!selectedPO || !invoiceFolio || !invoiceFolio.trim()) { setFolioWarning(null); return; }
        try {
            const res = await axiosClient.get(
                `/purchases/orders/${selectedPO.id}/check-invoice-folio?folio=${encodeURIComponent(invoiceFolio.trim())}`
            );
            setFolioWarning(res.data?.duplicado ? (res.data.coincidencias || []) : null);
        } catch {
            setFolioWarning(null);   // si falla la consulta, no estorbamos la captura
        }
    };

    const executeReceiveSubmit = async () => {
        if (!selectedPO) return;

        setIsSubmitting(true);
        try {
            const payload = {
                invoice_folio: invoiceFolio,
                invoice_total: Number(invoiceTotal),
                received_at: receivedAt,
                tax_rate: taxRate,
                received_items: [
                    ...(selectedPO.items || []).map((item: any, idx: number) => ({
                        item_id: item.id,
                        sku: item.sku,
                        expected_qty: item.qty,
                        received_qty: Number(receivedItems[idx]) || 0,
                        unit_cost: editedPrices[idx] !== undefined ? Number(editedPrices[idx]) : (item.unit_price || item.expected_cost || item.price || 0),
                        description: editedDescriptions[idx] !== undefined ? editedDescriptions[idx] : (item.name || ''),
                    })),
                    ...addedRows
                        .filter(r => r.material_id && Number(r.received_qty) > 0)
                        .map(r => ({
                            sku: r.sku,
                            expected_qty: 0,
                            received_qty: Number(r.received_qty) || 0,
                            unit_cost: Number(r.unit_cost) || 0,
                            description: r.name,
                            is_new: true,
                            material_id: r.material_id,
                        })),
                ],
                items_to_close: (selectedPO.items || [])
                    .map((it: any, idx: number) => (itemsToClose[idx] ? it.id : null))
                    .filter((id: any) => id !== null),
            };

            await axiosClient.put(`/purchases/orders/${selectedPO.id}/receive`, payload);

            toast.success('Recepción completada. Inventario actualizado.');
            setSelectedPO(null);
            fetchIncomingPOs();
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Error al procesar la recepción.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- NUEVA FUNCIÓN: CANCELAR ENTREGA ---
    const executeCancelOrder = async () => {
        if (!selectedPO) return;

        setIsCancelling(true);
        try {
            await axiosClient.put(`/purchases/orders/${selectedPO.id}/cancel`);
            toast.success('Orden cancelada exitosamente. Los materiales están libres de nuevo.');
            setSelectedPO(null);
            fetchIncomingPOs();
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Error al cancelar la orden.');
        } finally {
            setIsCancelling(false);
        }
    };

    const executeDeclareSatisfied = async () => {
        if (!selectedPO) return;
        setDeclaringSatisfied(true);
        try {
            await axiosClient.put(`/purchases/orders/${selectedPO.id}/declare-satisfied`);
            toast.success('OC declarada como Satisfecha.');
            setSelectedPO(null);
            fetchIncomingPOs();
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Error al declarar la OC como satisfecha.');
        } finally {
            setDeclaringSatisfied(false);
        }
    };

    const receptionRows = useMemo((): ReceptionRow[] => (
        (selectedPO?.items || []).map((item: any, idx: number) => ({ idx, item }))
    ), [selectedPO?.items]);

    const receptionColumns = useMemo((): VTableColumn<ReceptionRow>[] => [
        {
            key: 'sku',
            label: 'SKU',
            width: '8rem',
            render: ({ item }) => (
                <span className="font-mono text-xs font-semibold text-indigo-600">{item.sku || 'S/SKU'}</span>
            ),
        },
        {
            key: 'description',
            label: 'Descripción',
            render: ({ idx, item }) => {
                const ordered = item.qty || 0;
                const alreadyReceived = Number(item.quantity_received || 0);
                const isComplete = alreadyReceived >= ordered;
                return (
                    <Input
                        type="text"
                        disabled={isComplete}
                        title={editedDescriptions[idx] !== undefined ? editedDescriptions[idx] : (item.name || '')}
                        className="w-full min-w-[18rem] font-semibold text-sm text-slate-700 bg-transparent border-b border-transparent hover:border-slate-200 focus-visible:border-indigo-500 disabled:text-slate-400 h-7 shadow-none"
                        value={editedDescriptions[idx] !== undefined ? editedDescriptions[idx] : (item.name || '')}
                        onChange={(e) => !isComplete && handleDescriptionChange(idx, e.target.value)}
                    />
                );
            },
        },
        {
            key: 'ordered',
            label: 'Ordenadas',
            align: 'right',
            render: ({ item }) => (
                <span className="block text-right tabular-nums font-semibold text-slate-700">{item.qty || 0}</span>
            ),
        },
        {
            key: 'already_received',
            label: 'Ya recibidas',
            align: 'right',
            render: ({ item }) => {
                const alreadyReceived = Number(item.quantity_received || 0);
                return (
                    <span className="block text-right tabular-nums font-semibold text-emerald-700">
                        {alreadyReceived > 0 ? alreadyReceived : '—'}
                    </span>
                );
            },
        },
        {
            key: 'pending',
            label: 'Pendientes',
            align: 'right',
            render: ({ item }) => {
                const ordered = item.qty || 0;
                const alreadyReceived = Number(item.quantity_received || 0);
                const pending = Math.max(ordered - alreadyReceived, 0);
                const isComplete = alreadyReceived >= ordered;
                return (
                    <span className="block text-right tabular-nums font-bold">
                        {isComplete
                            ? <span className="text-emerald-700">Completo</span>
                            : <span className="text-amber-700">{pending}</span>}
                    </span>
                );
            },
        },
        {
            key: 'this_delivery',
            label: 'Esta entrega',
            align: 'center',
            width: '8rem',
            render: ({ idx, item }) => {
                const ordered = item.qty || 0;
                const alreadyReceived = Number(item.quantity_received || 0);
                const pending = Math.max(ordered - alreadyReceived, 0);
                const thisDelivery = Number(receivedItems[idx]) || 0;
                const isComplete = alreadyReceived >= ordered;
                const hasDiscrepancy = thisDelivery > pending;
                return (
                    <Input
                        type="number"
                        min="0"
                        disabled={isComplete}
                        className={`h-6 w-14 mx-auto text-center font-black text-xs ${
                            isComplete
                                ? 'bg-slate-100 border-slate-200 text-slate-400'
                                : hasDiscrepancy
                                ? 'bg-amber-100 border-amber-300 text-amber-800'
                                : 'border-slate-200 text-emerald-600 focus-visible:ring-emerald-500'
                        }`}
                        value={receivedItems[idx] ?? ''}
                        onChange={(e) => !isComplete && handleReceivedQtyChange(idx, e.target.value)}
                    />
                );
            },
        },
        {
            key: 'unit_price',
            label: 'P. unit.',
            align: 'center',
            width: '8rem',
            render: ({ idx, item }) => {
                const price = item.unit_price || item.expected_cost || item.price || 0;
                const ordered = item.qty || 0;
                const alreadyReceived = Number(item.quantity_received || 0);
                const isComplete = alreadyReceived >= ordered;
                return (
                    <Input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={isComplete}
                        className="h-7 w-28 ml-auto text-right tabular-nums font-bold text-xs text-slate-700 focus-visible:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                        value={editedPrices[idx] !== undefined ? editedPrices[idx] : String(price)}
                        onChange={(e) => !isComplete && handlePriceChange(idx, e.target.value)}
                    />
                );
            },
        },
        {
            key: 'project',
            label: 'Proyecto',
            render: ({ item }) => (
                <span className={`text-xs font-semibold ${item.project_name ? 'text-slate-700' : 'text-slate-400'}`}>
                    {item.project_name || 'Sin OV'}
                </span>
            ),
        },
        {
            key: 'close',
            label: 'Cerrar',
            width: '6rem',
            render: ({ idx, item }) => (
                (item.is_cancelled || item.is_fulfilled) ? (
                    <span className="text-xs font-semibold text-slate-400">
                        {item.is_cancelled ? 'Cancelado' : 'Cerrado'}
                    </span>
                ) : (
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                        <Input
                            type="checkbox"
                            checked={!!itemsToClose[idx]}
                            onChange={(e) => setItemsToClose(prev => ({ ...prev, [idx]: e.target.checked }))}
                            className="h-4 w-4 accent-rose-600"
                        />
                        <span className={`text-xs font-semibold whitespace-nowrap ${itemsToClose[idx] ? 'text-red-600' : 'text-slate-500'}`}>
                            No llegará más
                        </span>
                    </label>
                )
            ),
        },
        {
            key: 'importe',
            label: 'Importe',
            width: '10rem',
            align: 'right',
            render: ({ idx, item }) => {
                const price = item.unit_price || item.expected_cost || item.price || 0;
                const ordered = item.qty || 0;
                const thisDelivery = Number(receivedItems[idx]) || 0;
                const effectivePrice = editedPrices[idx] !== undefined ? Number(editedPrices[idx]) : price;
                const total = (thisDelivery > 0 ? thisDelivery : ordered) * effectivePrice;
                return (
                    <span className="block text-right tabular-nums font-bold text-slate-800">
                        {formatMoney(total)}
                    </span>
                );
            },
        },
    ], [receivedItems, editedPrices, editedDescriptions, itemsToClose]);

    // Guide v2 (tanda 1, Andén): the list is a report table; clicking a row or its folio opens the reception
    const poColumns: VTableColumn<any>[] = [
        {
            key: 'folio',
            label: 'Folio',
            sortable: true,
            render: (po) => (
                <Button type="button" variant="link" onClick={(e) => { e.stopPropagation(); handleSelectPO(po); }}
                    className="h-auto p-0 font-semibold text-indigo-600 hover:text-indigo-800" title="Abrir la recepción">
                    {po.folio || 'S/F'}
                </Button>
            ),
        },
        {
            key: 'provider_name',
            label: 'Proveedor',
            sortable: true,
            render: (po) => <span className="font-bold text-slate-800">{po.provider_name || 'Proveedor desconocido'}</span>,
        },
        {
            key: 'items',
            label: 'Partidas',
            sortable: true,
            align: 'right',
            sortValue: (po) => (po.items || []).length,
            render: (po) => <span className="block text-right tabular-nums text-slate-600">{(po.items || []).length}</span>,
        },
        {
            key: 'status',
            label: 'Estado',
            sortable: true,
            render: (po) => (
                <div className="flex flex-wrap gap-1">
                    {po.status === 'RECIBIDA_PARCIAL' ? (
                        <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">Entrega parcial</span>
                    ) : (
                        <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">En tránsito</span>
                    )}
                    {po.is_advance && (
                        <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">Prepagada</span>
                    )}
                </div>
            ),
        },
        {
            key: 'total',
            label: 'Total con IVA',
            sortable: true,
            align: 'right',
            sortValue: (po) => poTotalWithTax(po),
            render: (po) => <span className="block text-right tabular-nums font-bold text-slate-800">{formatCurrency(poTotalWithTax(po))}</span>,
        },
        {
            key: 'advance',
            label: 'Acción',
            align: 'center',
            render: (po) => (
                /* H25: an action (ask Tesorería for an advance payment), not a label of the PO */
                <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                        e.stopPropagation();
                        setAdvanceAmount(formatInitialAmount(poTotalWithTax(po)));
                        setAdvanceModal({ open: true, po });
                    }}
                    className="whitespace-nowrap"
                    title="El proveedor pide anticipo: solicitarlo a Tesorería"
                >
                    Solicitar anticipo
                </Button>
            ),
        },
    ];

    if (!selectedPO) {
        return (
            <>
            <div className={embedded ? 'space-y-6 animate-fadeIn' : 'p-8 w-full pb-24 space-y-6 animate-fadeIn'}>
                {!embedded && (
                    <VPageHeader
                        icon={Truck}
                        title="Andén de descarga"
                        subtitle="Selecciona la orden de compra que acaba de llegar para verificarla."
                        loading={isLoadingPOs}
                        onRefresh={fetchIncomingPOs}
                    />
                )}

                <VTable
                    columns={poColumns as unknown as VTableColumn<Record<string, unknown>>[]}
                    data={incomingPOs as Record<string, unknown>[]}
                    isLoading={isLoadingPOs}
                    onRowClick={(po) => handleSelectPO(po)}
                    headerStyle="report"
                    className="shadow-sm"
                    maxHeight="75vh"
                    emptyState={{
                        icon: <CheckCircle2 size={48} />,
                        title: 'Andén despejado',
                        description: 'No hay órdenes de compra en tránsito en este momento.',
                    }}
                />
            </div>

            {/* Registrar anticipo */}
            {advanceModal.open && advanceModal.po && (
                <Modal
                    isOpen
                    size="sm"
                    overlayZIndex={200}
                    onClose={() => setAdvanceModal({ open: false, po: null })}
                    title="Registrar anticipo"
                    subtitle={`${advanceModal.po.folio} — ${advanceModal.po.provider_name}`}
                    footer={
                        <ModalFooter
                            onCancel={() => { setAdvanceModal({ open: false, po: null }); setAdvanceAmount(''); }}
                            onConfirm={handleRequestAdvance}
                            confirmLabel="Solicitar anticipo"
                            busy={advanceLoading}
                        />
                    }
                >
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600">
                            Se generará una factura proforma <strong>ANT-{advanceModal.po.folio}</strong> en Cuentas por Pagar para que Tesorería ejecute el pago.
                        </p>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Monto del anticipo (con IVA) *</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">$</span>
                                <Input
                                    type="text"
                                    value={advanceAmount}
                                    onChange={e => setAdvanceAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="pl-7 font-bold tabular-nums text-slate-800"
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Total OC con IVA: <span className="tabular-nums font-semibold">{formatCurrency(poTotalWithTax(advanceModal.po))}</span>
                            </p>
                        </div>
                    </div>
                </Modal>
            )}

            </>
        );
    }

    // Calcular el total basado en las cantidades REALMENTE recibidas
    const subtotalRecibido = (selectedPO?.items || []).reduce((sum: number, item: any, idx: number) => {
        const basePrice = item.unit_price || item.expected_cost || item.price || 0;
        const price = editedPrices[idx] !== undefined ? Number(editedPrices[idx]) : basePrice;
        const received = Number(receivedItems[idx]) || 0;
        return sum + (received * price);
    }, 0)
    + addedRows.reduce((sum, r) => sum + ((Number(r.received_qty) || 0) * (Number(r.unit_cost) || 0)), 0);
    const subtotalCalc = subtotalRecibido;
    const ivaCalc = subtotalRecibido * taxRate;
    const expectedTotal = subtotalRecibido + ivaCalc;

    const diff = Math.abs(expectedTotal - Number(invoiceTotal));
    const tolerancia = Math.max(expectedTotal * 0.005, 1.00);
    // Permitir recibir más cantidad de la ordenada (ej. rollos de chapacinta)
    // Solo bloquear si el monto de la factura es MENOR al esperado (falta mercancía)
    // Si es mayor, solo advertir pero no bloquear
    const invoiceTotalNum = Number(invoiceTotal);
    const isFinancialBlocked = false;
    const hasFinancialWarning = invoiceTotal !== '' && invoiceTotalNum > 0 && expectedTotal > 0 && diff > tolerancia;
    const advancePaid = Number(selectedPO?.advance_paid || 0);
    const hasAdvance = advancePaid > 0;
    const saldoConAnticipo = Math.max(0, invoiceTotalNum - advancePaid);
    const overpaid = hasAdvance && invoiceTotalNum > 0 && advancePaid > invoiceTotalNum;
    const overpaidAmount = overpaid ? Math.round((advancePaid - invoiceTotalNum) * 100) / 100 : 0;

    const initiateSubmit = () => {
        if (!selectedPO) return;

        if (!invoiceFolio || invoiceTotal === '') {
            toast.warning('Por favor ingresa el folio de la factura que trajo el chofer y el total exacto.');
            return;
        }

        if (folioWarning && folioWarning.length > 0) {
            setPendingConfirm({ kind: 'submitDuplicateFolio' });
            return;
        }

        if (hasFinancialWarning) {
            setPendingConfirm({ kind: 'submitFinancialMismatch' });
            return;
        }

        void executeReceiveSubmit();
    };

    const getConfirmDialogProps = () => {
        if (!pendingConfirm || !selectedPO) return null;

        switch (pendingConfirm.kind) {
            case 'cancel':
                return {
                    title: 'Rechazar y cancelar recepción',
                    message: `¿Rechazar la entrega y cancelar la orden ${selectedPO.folio}?`,
                    consequence: 'Esta acción no se puede deshacer. Los materiales regresarán a la mesa de compras para pedirse a otro proveedor.',
                    variant: 'danger' as const,
                    confirmLabel: 'Sí, cancelar OC',
                };
            case 'declareSatisfied':
                return {
                    title: 'Declarar OC satisfecha',
                    message: `¿Declarar la OC ${selectedPO.folio} como Satisfecha?`,
                    consequence: 'Esto cerrará la orden aunque falten productos. Los faltantes deberán pedirse en una nueva OC.',
                    variant: 'default' as const,
                    confirmLabel: 'Declarar satisfecha',
                };
            case 'submitDuplicateFolio': {
                const coincidencias = (folioWarning || [])
                    .map((c: any) => `OC #${c.purchase_order_id} — ${formatCurrency(c.total)} (${c.status})`)
                    .join(', ');
                return {
                    title: 'Factura con folio duplicado',
                    message: `La factura "${invoiceFolio.trim()}" ya está registrada para este proveedor: ${coincidencias}.`,
                    consequence: 'Esto puede ser una OC duplicada. Confirma solo si es una factura distinta con el mismo folio.',
                    variant: 'default' as const,
                    confirmLabel: 'Confirmar ingreso',
                };
            }
            case 'submitFinancialMismatch':
                return {
                    title: 'Discrepancia en el monto',
                    message: `El monto de la factura (${formatCurrency(Number(invoiceTotal))}) no coincide con el calculado (${formatCurrency(expectedTotal)}).`,
                    consequence: 'Administración revisará la diferencia si confirmas el ingreso de todas formas.',
                    variant: 'default' as const,
                    confirmLabel: 'Confirmar ingreso',
                };
            default:
                return null;
        }
    };

    const handleConfirmDialog = async () => {
        if (!pendingConfirm) return;

        try {
            switch (pendingConfirm.kind) {
                case 'cancel':
                    await executeCancelOrder();
                    setPendingConfirm(null);
                    break;
                case 'declareSatisfied':
                    await executeDeclareSatisfied();
                    setPendingConfirm(null);
                    break;
                case 'submitDuplicateFolio':
                    if (hasFinancialWarning) {
                        setPendingConfirm({ kind: 'submitFinancialMismatch' });
                    } else {
                        await executeReceiveSubmit();
                        setPendingConfirm(null);
                    }
                    break;
                case 'submitFinancialMismatch':
                    await executeReceiveSubmit();
                    setPendingConfirm(null);
                    break;
            }
        } catch {
            // Errors handled inside execute* functions via toast
        }
    };

    const confirmDialogProps = getConfirmDialogProps();

    const labelClass = 'block text-xs font-bold text-slate-500 mb-1';
    return (
        <>
        <div className={embedded ? 'space-y-6 animate-fadeIn pb-10' : 'p-8 w-full pb-24 space-y-6 animate-fadeIn'}>
            <VPageHeader
                icon={PackageCheck}
                title={selectedPO.provider_name || 'Proveedor desconocido'}
                subtitle={`OC ${selectedPO.folio} · verifica que la factura física sea de este proveedor`}
                onBack={() => setSelectedPO(null)}
                backLabel="Regresar al Andén"
            />

            {/* Datos de la llegada */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className={labelClass}>Fecha real de llegada *</label>
                        <Input
                            type="date"
                            value={receivedAt}
                            max={todayIso()}
                            onChange={(e) => setReceivedAt(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Factura que trajo el chofer *</label>
                        <Input
                            placeholder="Folio"
                            value={invoiceFolio}
                            onChange={(e) => { setInvoiceFolio(e.target.value); setFolioWarning(null); }}
                            onBlur={checkFolioDuplicado}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Monto de la factura (con IVA) *</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">$</span>
                            <Input
                                className={`pl-7 font-bold tabular-nums ${isFinancialBlocked ? 'border-red-400 text-red-600' : 'text-slate-800'}`}
                                placeholder="0.00"
                                value={displayTotal}
                                onChange={(e) => handleAmountInput(e.target.value)}
                                onBlur={handleBlur}
                                onFocus={() => {
                                    if (invoiceTotal === 0 || invoiceTotal === '') {
                                        setDisplayTotal('');
                                        setInvoiceTotal('');
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
                {folioWarning && folioWarning.length > 0 && (
                    <div className="flex items-start gap-2 text-sm text-amber-700 border-t border-slate-100 pt-3">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        <div>
                            <p className="font-bold">
                                Este proveedor ya tiene {folioWarning.length === 1 ? 'una factura' : `${folioWarning.length} facturas`} con ese folio
                            </p>
                            {folioWarning.map((c: any, i: number) => (
                                <p key={i} className="text-xs text-amber-800 tabular-nums">
                                    {formatMoney(Number(c.total || 0))} · {c.status}
                                    {c.fecha ? ` · ${formatDate(c.fecha)}` : ''}
                                </p>
                            ))}
                            <p className="text-xs text-amber-600">Verifica que no sea un duplicado. Puedes continuar si es correcto.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Partidas de la OC y renglones agregados */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <VTable
                    columns={receptionColumns as unknown as VTableColumn<Record<string, unknown>>[]}
                    data={receptionRows as unknown as Record<string, unknown>[]}
                    headerStyle="report"
                    className="border-0 rounded-none shadow-none"
                    stickyHeader={false}
                />

                <div className="px-4 py-4 border-t border-slate-100 space-y-2">
                    {addedRows.map((row, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="relative flex-1">
                                <Input
                                    type="text"
                                    value={row.search}
                                    onChange={(e) => updateAddedRow(i, { search: e.target.value, material_id: null })}
                                    placeholder="Buscar material por SKU o nombre..."
                                />
                                {row.search && !row.material_id && (
                                    <div className="absolute z-20 bg-white border border-slate-200 rounded-lg shadow-lg w-full max-h-48 overflow-auto mt-1">
                                        {materialsList
                                            .filter((m: any) => {
                                                const q = row.search.toLowerCase();
                                                return (m.sku || '').toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q);
                                            })
                                            .slice(0, 8)
                                            .map((m: any) => (
                                                <Button
                                                    key={m.id}
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => selectMaterialForRow(i, m)}
                                                    className="w-full h-auto justify-start rounded-none text-left text-sm font-normal px-3 py-2 whitespace-normal"
                                                >
                                                    <span className="font-mono text-xs font-semibold text-indigo-600">{m.sku}</span> — {m.name}
                                                </Button>
                                            ))}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setShowMaterialForm({ rowIndex: i, sku: row.search })}
                                            className="w-full h-auto justify-start rounded-none border-t border-slate-100 text-left text-sm font-semibold text-indigo-700 px-3 py-2"
                                        >
                                            <Plus size={14} /> Dar de alta material nuevo…
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <Input
                                type="number" min="0" placeholder="Cant."
                                value={row.received_qty}
                                onChange={(e) => updateAddedRow(i, { received_qty: e.target.value })}
                                className="w-24 text-right tabular-nums"
                            />
                            <Input
                                type="number" min="0" step="0.01" placeholder="P. unit."
                                value={row.unit_cost}
                                onChange={(e) => updateAddedRow(i, { unit_cost: e.target.value })}
                                className="w-28 text-right tabular-nums"
                            />
                            <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeAddedRow(i)}
                                title="Quitar renglón" aria-label="Quitar renglón" className="text-red-600 hover:text-red-700">
                                <X size={16} />
                            </Button>
                        </div>
                    ))}
                    <Button type="button" variant="ghost" size="sm" onClick={addNewRow}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold">
                        <Plus size={14} /> Agregar renglón
                    </Button>
                </div>
            </div>

            {hasAdvance && invoiceTotalNum > 0 && invoiceFolio.trim() !== '' && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-start gap-3">
                    <AlertTriangle size={20} className={`shrink-0 mt-0.5 ${overpaid ? 'text-red-600' : 'text-amber-600'}`} />
                    <div>
                        <p className={`text-sm font-bold ${overpaid ? 'text-red-600' : 'text-amber-700'}`}>
                            {overpaid
                                ? `La factura (${formatCurrency(invoiceTotalNum)}) es menor al anticipo pagado (${formatCurrency(advancePaid)})`
                                : saldoConAnticipo <= 0.01
                                    ? 'Anticipo aplicado: esta factura quedará pagada'
                                    : `Anticipo aplicado: saldo por pagar ${formatCurrency(saldoConAnticipo)}`
                            }
                        </p>
                        <p className="text-xs text-slate-500 tabular-nums">
                            {overpaid
                                ? `Diferencia a tu favor: ${formatCurrency(overpaidAmount)}. Verifica antes de confirmar.`
                                : `Anticipo pagado: ${formatCurrency(advancePaid)} · Factura: ${formatCurrency(invoiceTotalNum)}`
                            }
                        </p>
                    </div>
                </div>
            )}

            {/* Acciones y totales */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
                <div className="flex flex-wrap gap-3">
                    <Button
                        onClick={initiateSubmit}
                        disabled={isSubmitting || isCancelling}
                    >
                        <Save size={16} /> {isSubmitting ? 'Procesando...' : 'Confirmar ingreso'}
                    </Button>
                    <Button
                        onClick={() => setPendingConfirm({ kind: 'cancel' })}
                        disabled={isSubmitting || isCancelling}
                        variant="outline"
                    >
                        <Ban size={16} /> Rechazar y cancelar OC
                    </Button>
                    {canDeclare && selectedPO?.status === 'RECIBIDA_PARCIAL' && (
                        <Button
                            onClick={() => setPendingConfirm({ kind: 'declareSatisfied' })}
                            disabled={isSubmitting || declaringSatisfied}
                            variant="outline"
                        >
                            <CheckCircle2 size={16} /> OC satisfecha
                        </Button>
                    )}
                </div>
                <div className="w-full lg:w-96 space-y-2 text-sm">
                    <div className="flex justify-between items-center text-slate-600">
                        <span className="font-semibold">Subtotal</span>
                        <span className="font-bold tabular-nums">{formatMoney(subtotalCalc)}</span>
                    </div>
                    <div className="flex justify-between items-center gap-3 text-slate-600 border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold whitespace-nowrap">Tasa de IVA</span>
                            <SearchableSelect
                                items={TAX_RATE_OPTIONS}
                                value={String(taxRate)}
                                onChange={(v) => setTaxRate(Number(v))}
                                getLabel={(o) => o.label}
                                getValue={(o) => o.value}
                                className="text-xs font-bold w-32"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="font-semibold whitespace-nowrap">IVA ({(taxRate * 100).toFixed(0)}%)</span>
                            <span className="font-bold tabular-nums">{formatMoney(ivaCalc)}</span>
                        </div>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                        <span className="font-black text-slate-700">Total esperado (con IVA)</span>
                        <span className="text-2xl font-black text-slate-900 tabular-nums">{formatMoney(expectedTotal)}</span>
                    </div>
                </div>
            </div>
        </div>

        {showMaterialForm && (
            <MaterialForm
                initialSku={showMaterialForm.sku}
                initialProviderId={selectedPO?.provider_id || 0}
                onCancel={() => setShowMaterialForm(null)}
                onCreated={(mat) => {
                    setMaterialsList(prev => [mat, ...prev]);
                    selectMaterialForRow(showMaterialForm.rowIndex, mat);
                    setShowMaterialForm(null);
                }}
            />
        )}

        {confirmDialogProps && (
            <VConfirmDialog
                isOpen={pendingConfirm !== null}
                title={confirmDialogProps.title}
                message={confirmDialogProps.message}
                consequence={confirmDialogProps.consequence}
                variant={confirmDialogProps.variant}
                confirmLabel={confirmDialogProps.confirmLabel}
                onConfirm={handleConfirmDialog}
                onCancel={() => setPendingConfirm(null)}
            />
        )}
        </>
    );
};

export default InventoryReceptionPage;