import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Search } from 'lucide-react';
import axiosClient from '../../../api/axios-client';
import { Button } from "@/components/ui/Button";
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VTable, VTableColumn } from '@/components/ui/VTable';
import Modal from '@/components/ui/Modal';
import { ModalFooter } from '@/components/ui/ModalFooter';
import { VTextarea } from '@/components/ui/VTextarea';
import { formatDate, formatMoney } from '@/utils/format';
import { poAuthorizedNote, poCreatedNote } from '../utils/poNotes';
import { openApiPdf } from '@/utils/openPdf';
import { toast } from '@/components/ui/VToast';

const STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Borrador', AUTORIZADA: 'Autorizada', ENVIADA: 'Enviada', EN_ESPERA_ANTICIPO: 'En espera de anticipo',
    RECIBIDA_PARCIAL: 'Recibida parcial', RECIBIDA_TOTAL: 'Recibida total', CANCELADA: 'Cancelada',
};
const statusLabel = (status: string) => STATUS_LABELS[status] ?? status;
const STATUS_TONES: Record<string, string> = {
    DRAFT: 'bg-slate-50 text-slate-700 border-slate-200',
    AUTORIZADA: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    ENVIADA: 'bg-blue-50 text-blue-700 border-blue-200',
    EN_ESPERA_ANTICIPO: 'bg-amber-50 text-amber-700 border-amber-200',
    RECIBIDA_PARCIAL: 'bg-amber-50 text-amber-700 border-amber-200',
    RECIBIDA_TOTAL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    CANCELADA: 'bg-red-50 text-red-700 border-red-200',
};

/** Status tag (guide v2 §6). */
const StatusTag: React.FC<{ status: string }> = ({ status }) => (
    <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${STATUS_TONES[status] ?? 'bg-slate-50 text-slate-700 border-slate-200'}`}>
        {statusLabel(status)}
    </span>
);

interface AllPurchaseOrdersModuleProps {
    onDetailChange?: (open: boolean) => void;
    closeSignal?: number;
}

export const AllPurchaseOrdersModule: React.FC<AllPurchaseOrdersModuleProps> = ({ onDetailChange, closeSignal }) => {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('TODOS');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selected, setSelected] = useState<any | null>(null);
    const [correctModal, setCorrectModal] = useState<{ item: any } | null>(null);
    const [realQty, setRealQty] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const id = setTimeout(() => { load(); }, 400);
        return () => clearTimeout(id);
    }, [search, dateFrom, dateTo, statusFilter]);

    useEffect(() => {
        if (onDetailChange) onDetailChange(selected !== null);
    }, [selected]);

    useEffect(() => {
        if (closeSignal !== undefined && closeSignal > 0) setSelected(null);
    }, [closeSignal]);

    const load = async (params?: { search?: string; from?: string; to?: string; status?: string }) => {
        setLoading(true);
        try {
            const qs = new URLSearchParams();
            qs.set('limit', '200');
            const s = params?.search ?? search;
            const f = params?.from ?? dateFrom;
            const t = params?.to ?? dateTo;
            const st = params?.status ?? statusFilter;
            if (s && s.trim()) qs.set('search', s.trim());
            if (f) qs.set('date_from', f);
            if (t) qs.set('date_to', t);
            if (st && st !== 'TODOS') qs.set('status', st);
            const res = await axiosClient.get(`/purchases/orders/?${qs.toString()}`);
            setOrders(Array.isArray(res.data) ? res.data : []);
        } catch { setOrders([]); }
        finally { setLoading(false); }
    };

    const submitCorrection = async () => {
        if (!selected || !correctModal) return;
        const q = Number(realQty);
        if (realQty === '' || isNaN(q) || q < 0) { setError('Indica la cantidad realmente recibida.'); return; }
        if (!reason.trim()) { setError('Indica el motivo de la corrección.'); return; }
        setSaving(true); setError('');
        try {
            await axiosClient.put(
                `/purchases/orders/${selected.id}/items/${correctModal.item.id}/correct-reception`,
                { real_qty: q, reason: reason.trim() }
            );
            setCorrectModal(null); setRealQty(''); setReason('');
            const qs = new URLSearchParams();
            qs.set('limit', '200');
            if (search && search.trim()) qs.set('search', search.trim());
            if (dateFrom) qs.set('date_from', dateFrom);
            if (dateTo) qs.set('date_to', dateTo);
            if (statusFilter && statusFilter !== 'TODOS') qs.set('status', statusFilter);
            const res = await axiosClient.get(`/purchases/orders/?${qs.toString()}`);
            const list = Array.isArray(res.data) ? res.data : [];
            setOrders(list);
            setSelected(list.find((o: any) => o.id === selected.id) || null);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'No se pudo corregir la recepción.');
        } finally { setSaving(false); }
    };

    const filtered = orders;

    const statuses = ['TODOS', 'DRAFT', 'ENVIADA', 'RECIBIDA_PARCIAL', 'RECIBIDA_TOTAL', 'CANCELADA'];
    const statusOptions = statuses.map((s) => ({ code: s, label: s === 'TODOS' ? 'Todos' : statusLabel(s) }));

    const orderItemColumns: VTableColumn<Record<string, unknown>>[] = useMemo(
        () => [
            {
                key: 'sku',
                label: 'SKU',
                render: (row) => (
                    <span className="font-mono text-xs text-indigo-600">{String(row.sku ?? '')}</span>
                ),
            },
            {
                key: 'name',
                label: 'Descripción',
                render: (row) => (
                    <span className="font-medium text-slate-700">{String(row.name ?? '')}</span>
                ),
            },
            {
                key: 'qty',
                label: 'Cant.',
                align: 'right',
                render: (row) => (
                    <span className="block text-right tabular-nums font-bold text-slate-700">
                        {String(row.qty ?? row.quantity_ordered ?? 0)}
                    </span>
                ),
            },
            {
                key: 'quantity_received',
                label: 'Recibidas',
                align: 'right',
                render: (row) => {
                    const rec = Number(row.quantity_received || 0);
                    return rec > 0
                        ? <span className="block text-right tabular-nums font-bold text-emerald-700">{rec}</span>
                        : <span className="block text-right text-slate-300 text-xs">—</span>;
                },
            },
            {
                key: 'expected_cost',
                label: 'P. unit.',
                align: 'right',
                render: (row) => (
                    <span className="block text-right tabular-nums text-slate-600">
                        {formatMoney(Number(row.expected_cost || 0))}
                    </span>
                ),
            },
            {
                key: 'project_name',
                label: 'Proyecto',
                render: (row) => row.project_name
                    ? <span className="text-slate-700">{String(row.project_name)}</span>
                    : <span className="text-slate-400 text-xs">Sin OV</span>,
            },
            {
                key: 'subtotal',
                label: 'Importe (sin IVA)',
                align: 'right',
                render: (row) => (
                    <span className="block text-right tabular-nums font-bold text-slate-800">
                        {formatMoney(Number(row.subtotal || 0))}
                    </span>
                ),
            },
            {
                key: 'action',
                label: 'Acción',
                align: 'center',
                render: (row) => {
                    const rec = Number(row.quantity_received || 0);
                    if (rec > 0) {
                        return (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                title="Corregir recepción"
                                onClick={() => {
                                    setCorrectModal({ item: row });
                                    setRealQty('');
                                    setReason('');
                                    setError('');
                                }}
                            >
                                Corregir
                            </Button>
                        );
                    }
                    return (
                        <span className="text-xs text-slate-400">
                            {row.is_cancelled ? 'Cancelado' : row.is_fulfilled ? 'Cerrado' : '—'}
                        </span>
                    );
                },
            },
        ],
        [],
    );

    const orderListColumns: VTableColumn<Record<string, unknown>>[] = useMemo(
        () => [
            {
                key: 'folio',
                label: 'Folio',
                sortable: true,
                render: (row) => (
                    <span className="font-semibold text-indigo-600 whitespace-nowrap">{String(row.folio ?? '')}</span>
                ),
            },
            {
                key: 'created_at',
                label: 'Creada',
                sortable: true,
                sortValue: (row) => (row.created_at ? new Date(String(row.created_at)).getTime() : null),
                render: (row) => (
                    <span className="text-slate-600 whitespace-nowrap">
                        {row.created_at ? formatDate(String(row.created_at)) : '—'}
                    </span>
                ),
            },
            {
                key: 'authorized_at',
                label: 'Autorizada',
                sortable: true,
                sortValue: (row) => (row.authorized_at ? new Date(String(row.authorized_at)).getTime() : null),
                render: (row) => (
                    row.authorized_at ? (
                        <span className="text-slate-600 whitespace-nowrap"
                            title={row.authorized_by_name ? `Por ${String(row.authorized_by_name)}` : undefined}>
                            {formatDate(String(row.authorized_at))}
                        </span>
                    ) : <span className="text-slate-300 text-xs">—</span>
                ),
            },
            {
                key: 'provider_name',
                label: 'Proveedor',
                sortable: true,
                render: (row) => (
                    <span className="font-medium text-slate-700">{String(row.provider_name ?? '')}</span>
                ),
            },
            {
                key: 'items_count',
                label: 'Partidas',
                align: 'right',
                sortable: true,
                sortValue: (row) => (Array.isArray(row.items) ? row.items.length : 0),
                render: (row) => {
                    const items = Array.isArray(row.items) ? row.items : [];
                    return <span className="block text-right tabular-nums text-slate-600">{items.length}</span>;
                },
            },
            {
                key: 'status',
                label: 'Estado',
                sortable: true,
                render: (row) => <StatusTag status={String(row.status ?? '')} />,
            },
            {
                key: 'invoice_folios',
                label: 'Factura(s)',
                render: (row) => row.invoice_folios
                    ? <span className="font-mono text-xs text-slate-600">{String(row.invoice_folios)}</span>
                    : <span className="text-slate-300 text-xs">—</span>,
            },
            {
                key: 'total_estimated_amount',
                label: 'Total (con IVA)',
                align: 'right',
                sortable: true,
                sortValue: (row) => Number(row.total_estimated_amount || 0) * (1 + Number(row.tax_rate ?? 0.16)),
                render: (row) => (
                    <span className="block text-right tabular-nums font-bold text-slate-800">
                        {formatMoney(Number(row.total_estimated_amount || 0) * (1 + Number(row.tax_rate ?? 0.16)))}
                    </span>
                ),
            },
        ],
        [],
    );

    if (selected) {
        const items = selected.items || [];
        const subtotal = items.reduce((s: number, it: any) => s + Number(it.subtotal || 0), 0);
        const rate = Number(selected.tax_rate ?? 0.16);
        const iva = subtotal * rate;
        const total = subtotal + iva;
        const closeCorrection = () => setCorrectModal(null);
        return (
            <div className="space-y-4">
                <Button type="button" variant="link" className="h-auto p-0 text-slate-500" onClick={() => setSelected(null)}>
                    Volver al listado
                </Button>
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex flex-wrap justify-between items-center gap-3">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-indigo-900">{selected.provider_name}</span>
                                <span className="font-mono text-xs text-slate-600">{selected.folio}</span>
                                <StatusTag status={String(selected.status ?? '')} />
                            </div>
                            {[poCreatedNote(selected), poAuthorizedNote(selected)].filter(Boolean).map((note) => (
                                <p key={note} className="text-xs text-slate-500 mt-0.5">{note}</p>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                openApiPdf(`/purchases/orders/${selected.id}/pdf`, `${selected.folio || 'OC'}.pdf`)
                                    .catch(() => toast.error('No se pudo abrir el PDF de la OC.'));
                            }}
                        >
                            <FileText size={14} /> Ver PDF oficial
                        </Button>
                    </div>
                    <VTable
                        columns={orderItemColumns}
                        data={items.map((item: Record<string, unknown>, i: number) => ({
                            ...item,
                            id: item.id ?? i,
                        }))}
                        headerStyle="report"
                        stickyHeader={false}
                        className="border-0 shadow-none rounded-none"
                    />
                    <div className="p-4 flex justify-end border-t border-slate-100">
                        <div className="w-full sm:w-80 space-y-1 text-sm">
                            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="tabular-nums font-semibold">{formatMoney(subtotal)}</span></div>
                            <div className="flex justify-between text-slate-600"><span>IVA ({Math.round(rate * 100)}%)</span><span className="tabular-nums font-semibold">{formatMoney(iva)}</span></div>
                            <div className="flex justify-between items-baseline pt-2 border-t border-slate-200"><span className="font-bold text-slate-700">Total con IVA</span><span className="text-2xl font-black text-slate-900 tabular-nums">{formatMoney(total)}</span></div>
                        </div>
                    </div>
                </div>

                {correctModal && (
                    <Modal
                        isOpen
                        size="sm"
                        overlayZIndex={50}
                        onClose={closeCorrection}
                        title="Corregir recepción"
                        subtitle={String(correctModal.item.sku ?? '')}
                        footer={(
                            <ModalFooter
                                onCancel={closeCorrection}
                                onConfirm={submitCorrection}
                                confirmLabel="Confirmar corrección"
                                busy={saving}
                            />
                        )}
                    >
                        <div className="space-y-4">
                            <p className="text-sm text-slate-600">
                                Registrado como recibido: <b className="tabular-nums">{Number(correctModal.item.quantity_received || 0)}</b>.
                                Indica cuánto llegó realmente. Se revertirá inventario y se ajustará la cuenta por pagar.
                            </p>
                            {error && <p className="text-sm font-bold text-red-600">{error}</p>}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Cantidad realmente recibida</label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={realQty}
                                    onChange={(e) => setRealQty(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Motivo (obligatorio)</label>
                                <VTextarea
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    rows={3}
                                    placeholder="Ej. Se aceptó de más por error, solo llegaron 30"
                                />
                            </div>
                        </div>
                    </Modal>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Buscar</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search size={18} className="text-slate-400" />
                            </div>
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Folio o proveedor..."
                                className="pl-10 text-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Estado</label>
                        <SearchableSelect
                            items={statusOptions}
                            value={statusFilter}
                            onChange={setStatusFilter}
                            getLabel={(s) => s.label}
                            getValue={(s) => s.code}
                            placeholder="Todos"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Desde</label>
                        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Hasta</label>
                        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
                    <p className="text-sm text-slate-500">
                        {loading ? 'Cargando...' : `${filtered.length} órdenes${filtered.length === 200 ? ' (las 200 más recientes; usa la búsqueda o las fechas para ver más)' : ''}`}
                    </p>
                    {(dateFrom || dateTo) && (
                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-slate-500"
                            onClick={() => { setDateFrom(''); setDateTo(''); }}>
                            Limpiar fechas
                        </Button>
                    )}
                </div>
            </div>
            <VTable
                columns={orderListColumns}
                data={filtered.map((o) => ({ ...o, id: o.id }))}
                isLoading={loading}
                onRowClick={(row) => setSelected(row)}
                emptyState={{ title: 'Sin órdenes que coincidan.' }}
                headerStyle="report"
                className="shadow-sm"
                defaultSortKey="created_at"
                defaultSortDirection="desc"
                maxHeight="75vh"
            />
        </div>
    );
};
