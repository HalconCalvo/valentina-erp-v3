import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Send, XCircle, CheckCircle, Ban, Eye, ArrowRightCircle,
  FileText, Search, RefreshCw, Copy,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { VEmptyState } from '@/components/ui/VEmptyState';
import Modal from '@/components/ui/Modal';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { toast } from '@/components/ui/VToast';
import Badge from '@/components/ui/Badge';

import {
  quotationService,
  formatQuotationCurrency,
  formatQuotationFolio,
  QUOTATION_STATUS_LABELS,
} from '../../../api/quotation-service';
import { Quotation, QuotationStatus } from '../../../types/quotations';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los estatus' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'SENT', label: 'Enviada' },
  { value: 'ACCEPTED', label: 'Aceptada' },
  { value: 'REJECTED', label: 'Rechazada' },
  { value: 'EXPIRED', label: 'Vencida' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const statusBadgeClass = (status: QuotationStatus): string => {
  switch (status) {
    case 'DRAFT': return 'bg-slate-100 text-slate-700';
    case 'SENT': return 'bg-blue-100 text-blue-700';
    case 'ACCEPTED': return 'bg-emerald-100 text-emerald-700';
    case 'REJECTED': return 'bg-orange-100 text-orange-700';
    case 'EXPIRED': return 'bg-amber-100 text-amber-700';
    case 'CANCELLED': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-600';
  }
};

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
};

type ReasonModalKind = 'cancel' | 'reject';

const QuotationsDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState<number | null>(null);

  const [reasonModal, setReasonModal] = useState<{
    open: boolean;
    kind: ReasonModalKind;
    quotation: Quotation | null;
  }>({ open: false, kind: 'cancel', quotation: null });
  const [reasonText, setReasonText] = useState('');

  const [sendConfirm, setSendConfirm] = useState<Quotation | null>(null);
  const [acceptConfirm, setAcceptConfirm] = useState<Quotation | null>(null);
  const [convertConfirm, setConvertConfirm] = useState<Quotation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await quotationService.listQuotations({
        status: statusFilter ? (statusFilter as QuotationStatus) : undefined,
        search: search.trim() || undefined,
      });
      setQuotations(data);
    } catch {
      toast.error('Error al cargar cotizaciones.');
      setQuotations([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSend = async (q: Quotation) => {
    setProcessingId(q.id);
    try {
      await quotationService.sendQuotation(q.id);
      toast.success('Cotización enviada.');
      await load();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo enviar la cotización.');
    } finally {
      setProcessingId(null);
      setSendConfirm(null);
    }
  };

  const handleAccept = async (q: Quotation) => {
    setProcessingId(q.id);
    try {
      await quotationService.acceptQuotation(q.id);
      toast.success('Cotización aceptada.');
      await load();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo aceptar la cotización.');
    } finally {
      setProcessingId(null);
      setAcceptConfirm(null);
    }
  };

  const handleReasonConfirm = async () => {
    if (!reasonModal.quotation) return;
    const reason = reasonText.trim();
    if (!reason) {
      toast.warning('El motivo es obligatorio.');
      return;
    }
    setProcessingId(reasonModal.quotation.id);
    try {
      if (reasonModal.kind === 'cancel') {
        await quotationService.cancelQuotation(reasonModal.quotation.id, reason);
        toast.success('Cotización cancelada.');
      } else {
        await quotationService.rejectQuotation(reasonModal.quotation.id, reason);
        toast.success('Cotización rechazada.');
      }
      setReasonModal({ open: false, kind: 'cancel', quotation: null });
      setReasonText('');
      await load();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo completar la acción.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleConvert = async (q: Quotation) => {
    setProcessingId(q.id);
    try {
      const result = await quotationService.convertToOrder(q.id);
      toast.success(result.message || 'Orden de venta creada.');
      navigate(`/sales/edit/${result.sales_order_id}`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo convertir a OV.');
    } finally {
      setProcessingId(null);
      setConvertConfirm(null);
    }
  };

  const columns: VTableColumn<Quotation>[] = useMemo(() => [
    {
      key: 'id',
      label: 'Folio',
      sortable: true,
      render: (row) => (
        <span className="font-bold text-indigo-700">{formatQuotationFolio(row.id)}</span>
      ),
    },
    {
      key: 'client',
      label: 'Cliente',
      sortable: true,
      render: (row) => row.client?.business_name ?? row.client?.trade_name ?? '—',
    },
    {
      key: 'project_name',
      label: 'Proyecto',
      sortable: true,
    },
    {
      key: 'total_price',
      label: 'Total',
      sortable: true,
      render: (row) => (
        <span className="font-bold">{formatQuotationCurrency(row.total_price)}</span>
      ),
    },
    {
      key: 'status',
      label: 'Estatus',
      sortable: true,
      render: (row) => (
        <Badge className={statusBadgeClass(row.status)}>
          {QUOTATION_STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      label: 'Fecha',
      sortable: true,
      render: (row) => formatDate(row.created_at),
    },
  ], []);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Cotizaciones</h1>
          <p className="text-sm text-slate-500 mt-1">Gestión de cotizaciones comerciales</p>
        </div>
        <Button onClick={() => navigate('/quotations/new')} className="gap-2">
          <Plus size={18} /> Nueva Cotización
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, proyecto o folio..."
            className="pl-9"
          />
        </div>
        <div className="w-full md:w-56">
          <SearchableSelect
            items={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
            getLabel={(o) => o.label}
            getValue={(o) => o.value}
            placeholder="Filtrar estatus"
          />
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="gap-2 shrink-0">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
        </Button>
      </div>

      {!loading && quotations.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <VEmptyState
            icon={<FileText size={40} strokeWidth={1} />}
            title="Sin cotizaciones"
            description="Crea tu primera cotización para comenzar."
            action={{ label: 'Nueva Cotización', onClick: () => navigate('/quotations/new') }}
          />
        </div>
      ) : (
        <VTable
          columns={columns}
          data={quotations}
          isLoading={loading}
          onRowClick={(row) => navigate(`/quotations/${row.id}`)}
          actions={(row) => {
            const q = row as Quotation;
            const busy = processingId === q.id;
            const iconBtn = (title: string, icon: React.ReactNode) => (
              <span title={title}>{icon}</span>
            );

            if (q.status === 'DRAFT') {
              return [
                { label: '', icon: iconBtn('Editar', <Pencil size={14} />), onClick: () => navigate(`/quotations/edit/${q.id}`) },
                { label: '', icon: iconBtn('Enviar', <Send size={14} />), onClick: () => setSendConfirm(q), hidden: busy },
                {
                  label: '',
                  icon: iconBtn('Cancelar', <XCircle size={14} />),
                  variant: 'danger' as const,
                  onClick: () => {
                    setReasonModal({ open: true, kind: 'cancel', quotation: q });
                    setReasonText('');
                  },
                  hidden: busy,
                },
              ];
            }
            if (q.status === 'SENT') {
              return [
                { label: '', icon: iconBtn('Aceptar', <CheckCircle size={14} />), onClick: () => setAcceptConfirm(q), hidden: busy },
                {
                  label: '',
                  icon: iconBtn('Rechazar', <Ban size={14} />),
                  variant: 'danger' as const,
                  onClick: () => {
                    setReasonModal({ open: true, kind: 'reject', quotation: q });
                    setReasonText('');
                  },
                  hidden: busy,
                },
                {
                  label: '',
                  icon: iconBtn('Cancelar', <XCircle size={14} />),
                  variant: 'danger' as const,
                  onClick: () => {
                    setReasonModal({ open: true, kind: 'cancel', quotation: q });
                    setReasonText('');
                  },
                  hidden: busy,
                },
              ];
            }
            if (q.status === 'ACCEPTED') {
              return [
                { label: '', icon: iconBtn('Ver', <Eye size={14} />), onClick: () => navigate(`/quotations/${q.id}`) },
                { label: '', icon: iconBtn('Convertir a OV', <ArrowRightCircle size={14} />), onClick: () => setConvertConfirm(q), hidden: busy },
              ];
            }
            const base = [{ label: '', icon: iconBtn('Ver', <Eye size={14} />), onClick: () => navigate(`/quotations/${q.id}`) }];
            if (q.status === 'REJECTED') {
              base.push({
                label: '',
                icon: iconBtn('Nueva versión', <Copy size={14} />),
                onClick: () => navigate('/quotations/new', { state: { cloneFrom: q } }),
              });
            }
            return base;
          }}
        />
      )}

      <VConfirmDialog
        isOpen={Boolean(sendConfirm)}
        title="Enviar cotización"
        message={`¿Enviar la cotización ${sendConfirm ? formatQuotationFolio(sendConfirm.id) : ''} al cliente?`}
        confirmLabel="Enviar"
        onConfirm={() => sendConfirm && handleSend(sendConfirm)}
        onCancel={() => setSendConfirm(null)}
      />

      <VConfirmDialog
        isOpen={Boolean(acceptConfirm)}
        title="Aceptar cotización"
        message={`¿Confirmar que el cliente aceptó la cotización ${acceptConfirm ? formatQuotationFolio(acceptConfirm.id) : ''}?`}
        confirmLabel="Aceptar"
        onConfirm={() => acceptConfirm && handleAccept(acceptConfirm)}
        onCancel={() => setAcceptConfirm(null)}
      />

      <VConfirmDialog
        isOpen={Boolean(convertConfirm)}
        title="Convertir a Orden de Venta"
        message={`¿Convertir la cotización ${convertConfirm ? formatQuotationFolio(convertConfirm.id) : ''} en una Orden de Venta?`}
        consequence="Se creará una OV vinculada a esta cotización."
        confirmLabel="Convertir"
        onConfirm={() => convertConfirm && handleConvert(convertConfirm)}
        onCancel={() => setConvertConfirm(null)}
      />

      {reasonModal.open && reasonModal.quotation && (
        <Modal
          isOpen
          onClose={() => {
            if (processingId) return;
            setReasonModal({ open: false, kind: 'cancel', quotation: null });
            setReasonText('');
          }}
          title={reasonModal.kind === 'cancel' ? 'Cancelar cotización' : 'Rechazar cotización'}
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {reasonModal.kind === 'cancel'
                ? 'Esta acción cancelará la cotización. Indica el motivo.'
                : 'El cliente rechazó la cotización. Indica el motivo del rechazo.'}
            </p>
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {reasonModal.kind === 'cancel'
                ? 'La cotización quedará en estado CANCELADA y no podrá editarse.'
                : 'La cotización quedará en estado RECHAZADA. Podrás crear una nueva versión después.'}
            </div>
            <Input
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Motivo obligatorio..."
            />
            <div className="flex justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={Boolean(processingId)}
                onClick={() => {
                  setReasonModal({ open: false, kind: 'cancel', quotation: null });
                  setReasonText('');
                }}
                className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-black rounded-lg disabled:opacity-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                disabled={Boolean(processingId)}
                onClick={handleReasonConfirm}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-lg disabled:opacity-50"
              >
                {processingId ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default QuotationsDashboardPage;
