import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingDown, AlertCircle, Calendar, Layers, FileText } from 'lucide-react';
import { VHubCard } from '@/components/ui/VHubCard';
import { VPageHeader } from '@/components/ui/VPageHeader';
import { ModalFooter } from '@/components/ui/ModalFooter';
import { Button } from '@/components/ui/Button';
import { financeService } from '../../../api/finance-service';
import { treasuryService } from '../../../api/treasury-service';
import axiosClient from '../../../api/axios-client';
import { AccountsPayableStats, PendingInvoice, SupplierPayment, PaymentRequestPayload } from '../../../types/finance';
import { BankAccount } from '../../../types/treasury';

import { PaymentRequestModal } from './PaymentRequestModal';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { toast } from '@/components/ui/VToast';
import Modal from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { TableActionCancelIcon, TableActionEditIcon } from '@/lib/tableActionIcons';
import { formatDate, formatMoney } from '@/utils/format';

type PayableFilter =
 | 'ALL'
    | 'THIS_FRIDAY'
    | 'NEXT_15_DAYS'
    | 'FUTURE'
    | 'DUE_0_7'
    | 'DUE_8_15'
    | 'DUE_GT_15'
    | null;

function invoiceDueDayDiff(inv: PendingInvoice): number | null {
    if (!inv.due_date) return null;
    // Tomamos solo la parte de fecha (YYYY-MM-DD) para evitar
    // problemas de timezone con timestamps completos
    const datePart = inv.due_date.includes('T')
        ? inv.due_date.split('T')[0]
        : inv.due_date.includes(' ')
        ? inv.due_date.split(' ')[0]
        : inv.due_date;
    const [year, month, day] = datePart.split('-').map(Number);
    const due = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

interface PayablesModuleProps {
    onSubSectionChange?: (isActive: boolean) => void;
    /** friday_week: corte viernes (Tesorería). calendar: 0–7 / 8–15 />15 días (Gerencia V4). */
    dueBucketMode?: 'friday_week' | 'calendar';
    /** Incrementar desde el padre para simular «Regresar» al hub de tarjetas. */
    parentBackSignal?: number;
}

export const PayablesModule: React.FC<PayablesModuleProps> = ({
    onSubSectionChange,
    dueBucketMode = 'friday_week',
    parentBackSignal = 0,
}) => {
    const navigate = useNavigate();
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const isChecker = ['DIRECTOR', 'MANAGER'].includes(userRole);
    // D41: money leaves only with DIRECTOR (the server enforces it too)
    const canPay = userRole === 'DIRECTOR';
    // D41: Gerencia does not register supplier payments (neither requests nor payments)
    const canRegisterPayments = userRole !== 'MANAGER';

    const [stats, setStats] = useState<AccountsPayableStats | null>(null);
    const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
    const [sentRequests, setSentRequests] = useState<SupplierPayment[]>([]); 
    const [approvedRequests, setApprovedRequests] = useState<SupplierPayment[]>([]);
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    
    const [activeFilter, setActiveFilter] = useState<PayableFilter>(null);
    const [filterProvider, setFilterProvider] = useState<string>('');
    const [filterDateFrom, setFilterDateFrom] = useState<string>('');
    const [filterDateTo, setFilterDateTo] = useState<string>('');
    const [isFinanceLoading, setIsFinanceLoading] = useState(false);


    const [selectedInvoice, setSelectedInvoice] = useState<PendingInvoice | null>(null);
    const [editingRequest, setEditingRequest] = useState<SupplierPayment | null>(null);

    const [viewingInvoice, setViewingInvoice] = useState<PendingInvoice | null>(null);
    const [cancellingId, setCancellingId] = useState<number | null>(null);
    const [pendingCancelInvoice, setPendingCancelInvoice] = useState<PendingInvoice | null>(null);

    const [editInvoiceModal, setEditInvoiceModal] = useState<{ open: boolean; inv: any | null }>({ open: false, inv: null });
    const [editInvoiceForm, setEditInvoiceForm] = useState<{ invoice_number: string; issue_date: string; due_date: string; total_amount: string }>({
        invoice_number: '', issue_date: '', due_date: '', total_amount: '',
    });
    const [savingInvoiceEdit, setSavingInvoiceEdit] = useState(false);

    const lastParentBackSig = useRef(0);
    useEffect(() => {
        if (parentBackSignal > lastParentBackSig.current) {
            lastParentBackSig.current = parentBackSignal;
            setActiveFilter(null);
            onSubSectionChange?.(false);
        }
    }, [parentBackSignal, onSubSectionChange]);

    const handleFilterChange = (filter: PayableFilter) => {
        setActiveFilter(filter);
        if (onSubSectionChange) {
            onSubSectionChange(filter !== null);
        }
    };

    const loadData = async (showSpinner = true) => {
        if (showSpinner) setIsFinanceLoading(true);
        try {
            const [statsData, invoicesData, pendingReqData, approvedReqData] = await Promise.all([
                financeService.getPayableDashboardStats(),
                financeService.getPendingInvoices(),
                financeService.getPendingApprovals(),
                financeService.getApprovedPayments(),
            ]);
            setStats(statsData);
            setInvoices(invoicesData);
            setSentRequests(pendingReqData);
            setApprovedRequests(approvedReqData);
        } catch {
            toast.error('No se pudieron refrescar los pagos.');
        } finally {
            if (showSpinner) setIsFinanceLoading(false);
        }

        // getAccounts falla para roles sin acceso a bóveda — se carga por separado
        try {
            const accountsData = await treasuryService.getAccounts();
            setAccounts(accountsData);
        } catch {
            // Sin acceso a cuentas bancarias — normal para roles no financieros
        }
    };

    useEffect(() => {
        loadData();
        const intervalId = setInterval(() => loadData(false), 15000);
        return () => clearInterval(intervalId);
    }, []);

    const calendarBucketStats = useMemo(() => {
        let n07 = 0,
            a07 = 0,
            n815 = 0,
            a815 = 0,
            n16 = 0,
            a16 = 0;
        for (const inv of invoices) {
            const d = invoiceDueDayDiff(inv);
            if (d === null) continue;
            if (d <= 7) {
                n07++;
                a07 += inv.outstanding_balance;
            } else if (d <= 15) {
                n815++;
                a815 += inv.outstanding_balance;
            } else {
                n16++;
                a16 += inv.outstanding_balance;
            }
        }
        return { n07, a07, n815, a815, n16, a16 };
    }, [invoices]);

    const cardFilteredInvoices = useMemo(() => {
        if (!activeFilter) return [];
        if (activeFilter === 'ALL') return invoices;

        if (dueBucketMode === 'calendar') {
            return invoices.filter((inv) => {
                const d = invoiceDueDayDiff(inv);
                if (activeFilter === 'DUE_0_7') return d !== null && d <= 7;
                if (activeFilter === 'DUE_8_15') return d !== null && d >= 8 && d <= 15;
                if (activeFilter === 'DUE_GT_15') return d !== null && d > 15;
                return false;
            });
        }

        return invoices.filter(inv => {
            if (!inv.due_date) return false;
            const datePart = inv.due_date.includes('T')
                ? inv.due_date.split('T')[0]
                : inv.due_date.includes(' ')
                ? inv.due_date.split(' ')[0]
                : inv.due_date;
            const [year, month, day] = datePart.split('-').map(Number);
            const due = new Date(year, month - 1, day);
            const today = new Date();
            today.setHours(0,0,0,0);
            
            let daysUntilFriday = 5 - today.getDay();
            if (daysUntilFriday < 0) daysUntilFriday += 7; 

            const cutoffDate = new Date(today);
            cutoffDate.setDate(today.getDate() + daysUntilFriday);
            const nextPeriodLimit = new Date(cutoffDate);
            nextPeriodLimit.setDate(cutoffDate.getDate() + 15);

            const dueTime = due.getTime();
            const cutoffTime = cutoffDate.getTime();
            const nextPeriodTime = nextPeriodLimit.getTime();

            if (activeFilter === 'THIS_FRIDAY') return dueTime <= cutoffTime; 
            if (activeFilter === 'NEXT_15_DAYS') return dueTime > cutoffTime && dueTime <= nextPeriodTime; 
            if (activeFilter === 'FUTURE') return dueTime > nextPeriodTime; 
            return false;
        });
    }, [invoices, activeFilter, dueBucketMode]);

    const providerOptions = useMemo(() => {
        const set = new Set<string>();
        cardFilteredInvoices.forEach((inv) => {
            if (inv.provider_name) set.add(inv.provider_name);
        });
        return Array.from(set).sort();
    }, [cardFilteredInvoices]);

    const doublyFiltered = useMemo(() => {
        let list = cardFilteredInvoices;
        if (filterProvider) {
            list = list.filter((inv) => inv.provider_name === filterProvider);
        }
        if (filterDateFrom) {
            list = list.filter((inv) => {
                const d = (inv.issue_date || '').slice(0, 10);
                return d && d >= filterDateFrom;
            });
        }
        if (filterDateTo) {
            list = list.filter((inv) => {
                const d = (inv.issue_date || '').slice(0, 10);
                return d && d <= filterDateTo;
            });
        }
        return list;
    }, [cardFilteredInvoices, filterProvider, filterDateFrom, filterDateTo]);

    const reportMetrics = useMemo(() => {
        const count = doublyFiltered.length;
        const totalFacturado = doublyFiltered.reduce((s, inv) => s + (inv.total_amount || 0), 0);
        const totalSaldo = doublyFiltered.reduce((s, inv) => s + (inv.outstanding_balance || 0), 0);
        const totalAbonado = totalFacturado - totalSaldo;
        return { count, totalFacturado, totalAbonado, totalSaldo };
    }, [doublyFiltered]);


    const handleEditRequest = (req: SupplierPayment) => {
        const relatedInvoice = invoices.find(inv => inv.invoice_number === req.invoice_folio && inv.provider_name === req.provider_name);
        setSelectedInvoice(relatedInvoice || null);
        setEditingRequest(req);
    };

    const handleUrgentPayment = (req: SupplierPayment) => {
        // Buscar la factura relacionada para pasarla al modal
        const relatedInvoice = invoices.find(inv => 
            inv.invoice_number === req.invoice_folio && 
            inv.provider_name === req.provider_name
        );
        setEditingRequest(req);
        setSelectedInvoice(relatedInvoice || null);
    };

    const handleCancelInvoice = (inv: PendingInvoice) => {
        setPendingCancelInvoice(inv);
    };

    const handleOpenEditInvoice = (inv: PendingInvoice) => {
        setEditInvoiceForm({
            invoice_number: inv.invoice_number || '',
            issue_date: inv.issue_date ? inv.issue_date.slice(0, 10) : '',
            due_date: inv.due_date ? inv.due_date.slice(0, 10) : '',
            total_amount: String(inv.total_amount || ''),
        });
        setEditInvoiceModal({ open: true, inv });
    };

    const handleSaveEditInvoice = async () => {
        if (!editInvoiceModal.inv) return;
        const inv = editInvoiceModal.inv as PendingInvoice;
        setSavingInvoiceEdit(true);
        try {
            const body: Record<string, string | number> = {};
            if (editInvoiceForm.invoice_number !== (inv.invoice_number || '')) {
                body.invoice_number = editInvoiceForm.invoice_number;
            }
            const origIssue = inv.issue_date ? inv.issue_date.slice(0, 10) : '';
            if (editInvoiceForm.issue_date !== origIssue) {
                body.issue_date = editInvoiceForm.issue_date;
            }
            const origDue = inv.due_date ? inv.due_date.slice(0, 10) : '';
            if (editInvoiceForm.due_date !== origDue) {
                body.due_date = editInvoiceForm.due_date;
            }
            const newTotal = parseFloat(editInvoiceForm.total_amount);
            const origTotal = Number(inv.total_amount || 0);
            if (!isNaN(newTotal) && newTotal !== origTotal) {
                body.total_amount = newTotal;
            }

            if (Object.keys(body).length === 0) {
                setEditInvoiceModal({ open: false, inv: null });
                return;
            }

            await axiosClient.patch(`/purchases/invoices/${inv.id}`, body);
            setEditInvoiceModal({ open: false, inv: null });
            toast.success('Factura actualizada');
            loadData(true);
        } catch (err: any) {
            if (err.response?.status === 422) {
                toast.error(err.response?.data?.detail || 'Error al actualizar la factura');
            } else {
                toast.error('Error al actualizar la factura');
            }
        } finally {
            setSavingInvoiceEdit(false);
        }
    };

    const executeCancelInvoice = async (inv: PendingInvoice) => {
        setCancellingId(inv.id);
        try {
            await financeService.cancelInvoice(inv.id);
            toast.success(`Factura ${inv.invoice_number} cancelada correctamente.`);
            loadData(true);
        } catch (err: any) {
            toast.error(err.response?.data?.detail || 'Error al cancelar la factura.');
        } finally {
            setCancellingId(null);
        }
    };

    const handleModalSubmit = async (payload: PaymentRequestPayload) => {
        try {
            if (editingRequest) {
                if (canPay) {
                    if (!payload.suggested_account_id) {
                        toast.warning('Selecciona una cuenta bancaria de origen para efectuar el pago.');
                        return;
                    }

                    // Si el pago ya está APPROVED, ejecutar directo
                    if (editingRequest.status === 'APPROVED') {
                        await financeService.updatePaymentStatus(editingRequest.id, 'APPROVED', payload.suggested_account_id);
                        await financeService.executePayment(editingRequest.id);
                    } else {
                        // Si está PENDING, aprobar y ejecutar en secuencia
                        await financeService.updatePaymentStatus(editingRequest.id, 'APPROVED', payload.suggested_account_id);
                        await financeService.executePayment(editingRequest.id);
                    }
                    
                    toast.success('Pago ejecutado exitosamente.');
                } else {
                    await financeService.updatePaymentRequest(editingRequest.id, payload);
                    toast.success('Solicitud actualizada.');
                }
            } else {
                // The server decides (D7): only who can execute payments pays directly; otherwise it stays a request
                const saved = await financeService.requestPayment(payload);
                if (saved.status === 'PAID') toast.success('Pago efectuado directamente.');
                else toast.success('Solicitud registrada; queda pendiente de ejecutar.');
            }
            setSelectedInvoice(null); 
            setEditingRequest(null);
            loadData(true);
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || 'Error al procesar el pago. Intenta de nuevo.');
        }
    };

    // Default order: advances first; the user reorders by clicking a column title (VTable)
    const sortedFilteredData = useMemo(() => [...doublyFiltered].sort((a, b) => {
        const aIsAdvance = (a as any).is_advance || String(a.invoice_number).startsWith('OC') || String(a.invoice_number).startsWith('COT');
        const bIsAdvance = (b as any).is_advance || String(b.invoice_number).startsWith('OC') || String(b.invoice_number).startsWith('COT');
        if (aIsAdvance && !bIsAdvance) return -1;
        if (!aIsAdvance && bIsAdvance) return 1;
        return 0;
    }), [doublyFiltered]);

    const groupedByProvider = useMemo(() => {
        const groups: { providerName: string; invoices: PendingInvoice[]; subtotal: number }[] = [];
        const indexByName = new Map<string, number>();
        for (const inv of sortedFilteredData) {
            const name = inv.provider_name || '—';
            let idx = indexByName.get(name);
            if (idx === undefined) {
                idx = groups.length;
                indexByName.set(name, idx);
                groups.push({ providerName: name, invoices: [], subtotal: 0 });
            }
            groups[idx].invoices.push(inv);
            groups[idx].subtotal += inv.outstanding_balance || 0;
        }
        return groups;
    }, [sortedFilteredData]);

    const totalAllCount = invoices.length;
    const totalAllAmount = invoices.reduce((sum, inv) => sum + inv.outstanding_balance, 0);

    const FILTER_HEADERS: Record<Exclude<PayableFilter, null>, { icon: typeof Layers; title: string; subtitle: string }> = {
        ALL: { icon: Layers, title: 'Todas las cuentas por pagar', subtitle: 'Facturas de proveedores con saldo, por proveedor.' },
        THIS_FRIDAY: { icon: AlertCircle, title: 'Pago inmediato', subtitle: 'Facturas que vencen este viernes o ya vencidas.' },
        NEXT_15_DAYS: { icon: Calendar, title: 'Próximos 15 días', subtitle: 'Facturas que vencen en los próximos 15 días.' },
        FUTURE: { icon: TrendingDown, title: 'Más de 15 días', subtitle: 'Facturas con vencimiento lejano.' },
        DUE_0_7: { icon: AlertCircle, title: 'Inmediato (0–7 días)', subtitle: 'Facturas que vencen en 7 días o ya vencidas.' },
        DUE_8_15: { icon: Calendar, title: '8 a 15 días', subtitle: 'Facturas que vencen entre 8 y 15 días.' },
        DUE_GT_15: { icon: TrendingDown, title: 'Más de 15 días', subtitle: 'Facturas con vencimiento lejano.' },
    };
    const groupSubtotal = (name: string) => groupedByProvider.find((g) => g.providerName === name)?.subtotal ?? 0;

    const providerFilterOptions = useMemo(
        () => [
            { value: '', label: 'Todos los proveedores' },
            ...providerOptions.map((name) => ({ value: name, label: name })),
        ],
        [providerOptions],
    );

    const payableColumns = useMemo((): VTableColumn<PendingInvoice>[] => [
        {
            key: 'invoice_number',
            label: 'Factura',
            sortable: true,
            render: (inv) => (
                <Button
                    variant="link"
                    onClick={() => setViewingInvoice(inv)}
                    className="h-auto p-0 font-semibold text-indigo-600 hover:text-indigo-800"
                    title="Ver detalle del documento"
                >
                    {inv.invoice_number}
                </Button>
            ),
            footer: <span className="text-slate-700 uppercase text-xs tracking-wide">Totales ({sortedFilteredData.length} {sortedFilteredData.length === 1 ? 'factura' : 'facturas'})</span>,
        },
        {
            key: 'due_date',
            label: 'Vencimiento',
            sortable: true,
            sortValue: (inv) => new Date(inv.due_date || 0).getTime(),
            render: (inv) => (
                <span className="text-slate-600 font-medium">{formatDate(inv.due_date)}</span>
            ),
        },
        {
            key: 'antiguedad',
            label: 'Antigüedad',
            align: 'right',
            sortable: true,
            sortValue: (inv) => invoiceDueDayDiff(inv) ?? 0,
            render: (inv) => {
                const dueDays = invoiceDueDayDiff(inv);
                if (dueDays === null) return <span className="block text-right text-slate-300 text-xs">—</span>;
                return dueDays >= 0 ? (
                    <span className="block text-right tabular-nums font-bold text-slate-500">vence en {dueDays} d</span>
                ) : (
                    <span className="block text-right tabular-nums font-bold text-red-600">vencida {Math.abs(dueDays)} d</span>
                );
            },
        },
        {
            key: 'total_amount',
            label: 'Importe',
            align: 'right',
            sortable: true,
            footer: <span className="block text-right tabular-nums text-slate-800">{formatMoney(reportMetrics.totalFacturado)}</span>,
            render: (inv) => (
                <span className="block text-right tabular-nums text-slate-700">{formatMoney(inv.total_amount)}</span>
            ),
        },
        {
            key: 'abonado',
            label: 'Abonado',
            align: 'right',
            sortable: true,
            sortValue: (inv) => (inv.total_amount || 0) - (inv.outstanding_balance || 0),
            footer: <span className="block text-right tabular-nums text-emerald-800">{formatMoney(reportMetrics.totalAbonado)}</span>,
            render: (inv) => {
                const abonado = (inv.total_amount || 0) - (inv.outstanding_balance || 0);
                return (
                    <span className="block text-right tabular-nums text-emerald-700">{formatMoney(abonado)}</span>
                );
            },
        },
        {
            key: 'outstanding_balance',
            label: 'Saldo',
            align: 'right',
            sortable: true,
            footer: <span className="block text-right tabular-nums text-amber-800">{formatMoney(reportMetrics.totalSaldo)}</span>,
            render: (inv) => (
                <span className="block text-right tabular-nums font-bold text-slate-800">
                    {formatMoney(inv.outstanding_balance)}
                </span>
            ),
        },
        {
            key: 'action',
            label: 'Acción',
            align: 'right',
            render: (inv) => {
                const pendingReqForInv = sentRequests.filter(
                    (req) => req.invoice_folio === inv.invoice_number && req.provider_name === inv.provider_name,
                );
                const approvedReqForInv = approvedRequests.filter(
                    (req) => req.invoice_folio === inv.invoice_number && req.provider_name === inv.provider_name,
                );
                const hasActive = pendingReqForInv.length > 0 || approvedReqForInv.length > 0;
                const hasApproved = approvedReqForInv.length > 0;

                return (
                    <div className="flex items-center justify-end gap-2">
                        {!canRegisterPayments ? null : hasActive ? (
                            canPay ? (
                                <Button
                                    size="sm"
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                    onClick={() => handleUrgentPayment(hasApproved ? approvedReqForInv[0] : pendingReqForInv[0])}
                                >
                                    Pago urgente
                                </Button>
                            ) : (
                                <span className="inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                                    Pago solicitado
                                </span>
                            )
                        ) : inv.invoice_number?.startsWith('ANT-') ? (
                            <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => setSelectedInvoice(inv)}
                            >
                                Pago anticipado
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => setSelectedInvoice(inv)}
                            >
                                {canPay ? 'Pagar' : 'Solicitar pago'}
                            </Button>
                        )}
                        {isChecker
                            && (inv as any).status !== 'PAID'
                            && (inv as any).status !== 'CANCELLED' && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="group border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 px-2"
                                title="Editar"
                                aria-label="Editar"
                                onClick={() => handleOpenEditInvoice(inv)}
                            >
                                <TableActionEditIcon />
                            </Button>
                        )}
                        {isChecker && (
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={cancellingId === inv.id}
                                className="group border-rose-200 hover:bg-rose-50 px-2"
                                title="Cancelar"
                                aria-label="Cancelar"
                                onClick={() => handleCancelInvoice(inv)}
                            >
                                <TableActionCancelIcon />
                            </Button>
                        )}
                    </div>
                );
            },
        },
    ], [sentRequests, approvedRequests, isChecker, canPay, canRegisterPayments, cancellingId, reportMetrics, sortedFilteredData.length]);

    return (
        <div className="space-y-6">

            {activeFilter === null ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-4">
                    {dueBucketMode === 'calendar' ? (
                        <>
                            <VHubCard label="4.1 Inmediato" title="Inmediato" tone="red" icon={AlertCircle}
                                footer={`${formatMoney(calendarBucketStats.a07)} · 0 a 7 días, vencidas incluidas`}
                                side={calendarBucketStats.n07} onClick={() => handleFilterChange('DUE_0_7')} />
                            <VHubCard label="4.2 8 a 15 días" title="8 a 15 días" tone="amber" icon={Calendar}
                                footer={`${formatMoney(calendarBucketStats.a815)} · ventana intermedia`}
                                side={calendarBucketStats.n815} onClick={() => handleFilterChange('DUE_8_15')} />
                            <VHubCard label="4.3 Más de 15 días" title="Más de 15 días" tone="slate" icon={TrendingDown}
                                footer={`${formatMoney(calendarBucketStats.a16)} · vencimiento lejano`}
                                side={calendarBucketStats.n16} onClick={() => handleFilterChange('DUE_GT_15')} />
                            <VHubCard label="4.4 Todas las CxP" title="Todas" tone="indigo" icon={Layers}
                                footer={`${formatMoney(totalAllAmount)} · documentos por pagar`}
                                side={totalAllCount} onClick={() => handleFilterChange('ALL')} />
                        </>
                    ) : (
                        <>
                            <VHubCard label="Pago inmediato" title="Este viernes" tone="red" icon={AlertCircle}
                                footer={`${formatMoney(stats?.overdue_amount || 0)} · vencidas incluidas`}
                                side={stats?.overdue_count || 0} onClick={() => handleFilterChange('THIS_FRIDAY')} />
                            <VHubCard label="Proyección corta" title="15 días" tone="amber" icon={Calendar}
                                footer={`${formatMoney(stats?.next_period_amount || 0)} · próximos 15 días`}
                                side={stats?.next_period_count || 0} onClick={() => handleFilterChange('NEXT_15_DAYS')} />
                            <VHubCard label="Largo plazo" title="Más de 15 días" tone="slate" icon={TrendingDown}
                                footer={`${formatMoney(stats?.future_amount || 0)} · vencimiento lejano`}
                                side={stats?.future_count || 0} onClick={() => handleFilterChange('FUTURE')} />
                            <VHubCard label="Todas las CxP" title="Todas" tone="indigo" icon={Layers}
                                footer={`${formatMoney(totalAllAmount)} · documentos por pagar`}
                                side={totalAllCount} onClick={() => handleFilterChange('ALL')} />
                        </>
                    )}
                    <VHubCard label="Proveedores" title="Estado de cuenta" tone="blue" icon={FileText}
                        footer="Facturas, pagos y saldo por proveedor"
                        side={<FileText size={28} />} onClick={() => navigate('/finance/provider-statement')} />
                </div>
            ) : (
                <div className="space-y-6">
                    <VPageHeader
                        icon={FILTER_HEADERS[activeFilter].icon}
                        title={FILTER_HEADERS[activeFilter].title}
                        subtitle={FILTER_HEADERS[activeFilter].subtitle}
                        loading={isFinanceLoading}
                        onRefresh={() => void loadData(true)}
                        onBack={() => handleFilterChange(null)}
                        backLabel="Regresar a Cuentas por pagar"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Facturas vivas</p>
                            <p className="text-2xl font-black text-indigo-700 tabular-nums mt-1">{reportMetrics.count}</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Total facturado</p>
                            <p className="text-2xl font-black text-slate-800 tabular-nums mt-1">{formatMoney(reportMetrics.totalFacturado)}</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Abonado</p>
                            <p className="text-2xl font-black text-emerald-700 tabular-nums mt-1">{formatMoney(reportMetrics.totalAbonado)}</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Saldo por pagar</p>
                            <p className="text-2xl font-black text-amber-700 tabular-nums mt-1">{formatMoney(reportMetrics.totalSaldo)}</p>
                        </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Proveedor</label>
                                <SearchableSelect
                                    items={providerFilterOptions}
                                    value={filterProvider}
                                    onChange={setFilterProvider}
                                    getLabel={(o) => o.label}
                                    getValue={(o) => o.value}
                                    placeholder="Todos los proveedores"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Compras desde</label>
                                <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Compras hasta</label>
                                <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
                            </div>
                        </div>
                    </div>
                    <VTable
                        columns={payableColumns as unknown as VTableColumn<Record<string, unknown>>[]}
                        data={sortedFilteredData as unknown as Record<string, unknown>[]}
                        isLoading={isFinanceLoading}
                        emptyState={{ title: 'No hay facturas pendientes con los filtros seleccionados.' }}
                        headerStyle="report"
                        maxHeight="75vh"
                        groupBy={(row) => String((row as unknown as PendingInvoice).provider_name || '—')}
                        renderGroupHeader={(key) => (
                            <div className="flex justify-between items-center gap-3">
                                <span className="font-black text-indigo-900">{key}</span>
                                <span className="font-black text-indigo-800 tabular-nums">Debe: {formatMoney(groupSubtotal(key))}</span>
                            </div>
                        )}
                        className="shadow-sm"
                    />
                </div>
            )}

            {/* MODAL MAESTRO UNIVERSAL */}
            {(selectedInvoice || editingRequest) && (
                <PaymentRequestModal 
                    invoice={selectedInvoice || undefined} 
                    existingRequest={editingRequest || undefined} 
                    onClose={() => { setSelectedInvoice(null); setEditingRequest(null); }} 
                    onSubmit={handleModalSubmit} 
                    isChecker={canPay} 
                />
            )}
            
            {/* VISOR DE FACTURAS/OC (Los Rayos X) */}
            {viewingInvoice && <InvoiceDetailModal invoice={viewingInvoice} onClose={() => setViewingInvoice(null)} />}

            {pendingCancelInvoice && (
                <VConfirmDialog
                    isOpen={pendingCancelInvoice !== null}
                    title="Cancelar factura"
                    message={`¿Cancelar la factura ${pendingCancelInvoice.invoice_number} de ${pendingCancelInvoice.provider_name}?`}
                    consequence="Esta acción no se puede deshacer. El saldo quedará en $0."
                    variant="danger"
                    confirmLabel="Sí, cancelar"
                    onConfirm={async () => {
                        await executeCancelInvoice(pendingCancelInvoice);
                        setPendingCancelInvoice(null);
                    }}
                    onCancel={() => setPendingCancelInvoice(null)}
                />
            )}

            {editInvoiceModal.open && editInvoiceModal.inv && (() => {
                const inv = editInvoiceModal.inv as PendingInvoice;
                const abonado = (inv.total_amount || 0) - (inv.outstanding_balance || 0);
                const hasPayments = abonado > 0;
                return (
                    <Modal
                        isOpen={editInvoiceModal.open}
                        onClose={() => {
                            if (savingInvoiceEdit) return;
                            setEditInvoiceModal({ open: false, inv: null });
                        }}
                        title={`Editar factura ${inv.invoice_number || ''}`}
                        size="sm"
                        footer={(
                            <ModalFooter
                                onCancel={() => setEditInvoiceModal({ open: false, inv: null })}
                                onConfirm={() => void handleSaveEditInvoice()}
                                confirmLabel="Guardar cambios"
                                busy={savingInvoiceEdit}
                            />
                        )}
                    >
                        <div className="flex flex-col gap-4">
                            {hasPayments && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                    Esta factura tiene pagos aplicados. Solo puedes editar la fecha de vencimiento.
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">
                                    Folio de factura
                                </label>
                                <Input
                                    type="text"
                                    value={editInvoiceForm.invoice_number}
                                    onChange={(e) => setEditInvoiceForm((f) => ({ ...f, invoice_number: e.target.value }))}
                                    disabled={hasPayments}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">
                                    Fecha de emisión
                                </label>
                                <Input
                                    type="date"
                                    value={editInvoiceForm.issue_date}
                                    onChange={(e) => setEditInvoiceForm((f) => ({ ...f, issue_date: e.target.value }))}
                                    disabled={hasPayments}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">
                                    Fecha de vencimiento
                                </label>
                                <Input
                                    type="date"
                                    value={editInvoiceForm.due_date}
                                    onChange={(e) => setEditInvoiceForm((f) => ({ ...f, due_date: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">
                                    Importe total
                                </label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={editInvoiceForm.total_amount}
                                    onChange={(e) => setEditInvoiceForm((f) => ({ ...f, total_amount: e.target.value }))}
                                    disabled={hasPayments}
                                />
                            </div>
                        </div>
                    </Modal>
                );
            })()}
        </div>
    );
};