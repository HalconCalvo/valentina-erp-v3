import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Loader, Save } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { toast } from '@/components/ui/VToast';
import { RecordHistoryButton } from '@/components/audit/RecordHistoryButton';
import { formatDate, formatDateTime } from '@/utils/format';

import {
  quotationService,
  formatQuotationCurrency,
  QUOTATION_STATUS_LABELS,
  EDITABLE_QUOTATION_STATUSES,
} from '../../../api/quotation-service';
import { getErrorMessage, useQuotation } from '../../../hooks/useQuotations';
import { useQueryClient } from '@tanstack/react-query';
import { Quotation, QuotationItem } from '../../../types/quotations';
import {
  PendingQuotationAction,
  QuotationActionDialogs,
  QuotationActionKind,
  QuotationRowActions,
  canManageQuotations,
  quotationStatusBadgeClass,
} from '../components/QuotationActions';
import { FinancialReviewModal } from '../../management/components/FinancialReviewModal';

/** Who/when/why of each step of the quotation's life. */
const timeline = (q: Quotation): Array<{ label: string; value: string; tone?: string }> => [
  { label: 'Creada', value: formatDateTime(q.created_at) },
  ...(q.auth_requested_at ? [{ label: 'Enviada a Dirección', value: formatDateTime(q.auth_requested_at) }] : []),
  ...(q.changes_requested_at
    ? [{ label: 'Regresada para cambios', value: `${formatDateTime(q.changes_requested_at)} · ${q.changes_requested_reason ?? ''}`, tone: 'text-orange-700' }]
    : []),
  ...(q.authorized_at ? [{ label: 'Autorizada', value: formatDateTime(q.authorized_at), tone: 'text-emerald-700' }] : []),
  ...(q.director_notes ? [{ label: 'Notas de Dirección', value: q.director_notes }] : []),
  ...(q.converted_at ? [{ label: 'Convertida en OV', value: `${formatDateTime(q.converted_at)} · OV-${String(q.sales_order_id ?? '').padStart(4, '0')}`, tone: 'text-indigo-700' }] : []),
  ...(q.lost_at ? [{ label: 'Perdida', value: `${formatDateTime(q.lost_at)} · ${q.lost_reason ?? ''}`, tone: 'text-rose-700' }] : []),
  ...(q.expired_at ? [{ label: 'Vencida', value: formatDateTime(q.expired_at), tone: 'text-amber-700' }] : []),
  ...(q.cancelled_at ? [{ label: 'Cancelada', value: `${formatDateTime(q.cancelled_at)} · ${q.cancel_reason ?? ''}`, tone: 'text-red-700' }] : []),
];

const textAreaClass = 'w-full p-3 border border-slate-300 rounded text-sm min-h-[110px] resize-y bg-white disabled:bg-slate-100 disabled:text-slate-500';

const QuotationDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const quotationId = Number(id);

  const { data: quotation, isLoading, isError } = useQuotation(quotationId);
  const [pending, setPending] = useState<PendingQuotationAction | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [notes, setNotes] = useState('');
  const [conditions, setConditions] = useState('');
  const [savingTexts, setSavingTexts] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(quotationId)) navigate('/sales');
  }, [quotationId, navigate]);

  useEffect(() => {
    if (isError) {
      toast.error('No se pudo cargar la cotización.');
      navigate('/sales');
    }
  }, [isError, navigate]);

  useEffect(() => {
    setNotes(quotation?.notes ?? '');
    setConditions(quotation?.conditions ?? '');
  }, [quotation]);

  const itemColumns: VTableColumn<QuotationItem>[] = useMemo(() => [
    {
      key: 'product_name',
      label: 'Producto',
      render: (row) => (
        <>
          <span className="font-bold text-slate-800">{row.product_name}</span>
          {row.commercial_description && <p className="text-xs text-slate-500 mt-0.5">{row.commercial_description}</p>}
          {row.recipe_obsolete && (
            <p className="text-xs font-bold text-amber-700 mt-0.5">
              Receta corregida{row.replacement_version_name ? ` — la reemplaza ${row.replacement_version_name}` : ''}. Actualízala al editar la cotización.
            </p>
          )}
        </>
      ),
    },
    { key: 'quantity', label: 'Cantidad', render: (row) => row.quantity.toLocaleString('en-US', { maximumFractionDigits: 2 }) },
    { key: 'unit_price', label: 'Precio unit.', render: (row) => formatQuotationCurrency(row.unit_price) },
    { key: 'subtotal_price', label: 'Importe', render: (row) => formatQuotationCurrency(row.subtotal_price ?? row.quantity * row.unit_price) },
  ], []);

  if (isLoading || !quotation) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50">
        <Loader className="animate-spin text-indigo-600 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Cargando cotización...</p>
      </div>
    );
  }

  const textsEditable = canManageQuotations()
    && (EDITABLE_QUOTATION_STATUSES.includes(quotation.status) || quotation.status === 'AUTHORIZED');
  const textsChanged = notes !== (quotation.notes ?? '') || conditions !== (quotation.conditions ?? '');

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['quotations'] });
    await queryClient.invalidateQueries({ queryKey: ['quotation', quotation.id] });
  };

  const handlePdf = async () => {
    try {
      await quotationService.openQuotationPdf(quotation.id);
    } catch {
      toast.error('Error al generar el PDF.');
    }
  };

  const saveTexts = async () => {
    setSavingTexts(true);
    try {
      await quotationService.updateQuotation(quotation.id, { notes, conditions });
      toast.success('Notas y condiciones guardadas.');
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, 'No se pudieron guardar las notas.'));
    } finally {
      setSavingTexts(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 pb-24 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">{quotation.folio}</h1>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${quotationStatusBadgeClass(quotation.status)}`}>{QUOTATION_STATUS_LABELS[quotation.status]}</span>
            <RecordHistoryButton tableName="quotations" recordId={quotation.id} label={quotation.folio} />
          </div>
          <p className="text-slate-500 mt-1 font-medium">{quotation.project_name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePdf} className="gap-2" title="Descargar PDF">
            <FileDown size={16} /> PDF
          </Button>
          <Button variant="outline" onClick={() => navigate('/sales')} className="gap-2">
            <ArrowLeft size={16} /> Regresar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-4">
            <h2 className="text-sm font-black uppercase text-slate-500 tracking-wider">Información general</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-400 font-bold text-xs uppercase">Cliente</p>
                <p className="font-bold text-slate-800">{quotation.client?.full_name ?? '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold text-xs uppercase">Vendedor</p>
                <p className="font-bold text-slate-800">{quotation.user?.full_name ?? '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold text-xs uppercase">Válida hasta</p>
                <p className="font-medium text-slate-700">{formatDate(quotation.valid_until)}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold text-xs uppercase">Anticipo</p>
                <p className="font-medium text-slate-700">{Number(quotation.advance_percent).toFixed(2)}%</p>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100 space-y-2 text-sm">
              {timeline(quotation).map((row) => (
                <div key={row.label} className="flex flex-wrap gap-2">
                  <span className="w-48 shrink-0 text-xs font-bold uppercase text-slate-400">{row.label}</span>
                  <span className={`font-medium ${row.tone ?? 'text-slate-700'}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 space-y-3">
            <h2 className="text-sm font-black uppercase text-slate-500 tracking-wider">Notas y condiciones del formato</h2>
            <textarea className={textAreaClass} disabled={!textsEditable || savingTexts} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas / introducción" />
            <textarea className={textAreaClass} disabled={!textsEditable || savingTexts} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Condiciones comerciales" />
            {textsEditable && (
              <div className="flex justify-end">
                <Button onClick={saveTexts} disabled={!textsChanged || savingTexts} className="gap-2">
                  <Save size={16} /> {savingTexts ? 'Guardando…' : 'Guardar notas'}
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-sm font-black uppercase text-slate-500 tracking-wider mb-4">Partidas</h2>
            <VTable
              columns={itemColumns}
              data={quotation.items}
              emptyState={{ title: 'Sin partidas', description: 'Edita la cotización para agregar productos.' }}
              className="border-0 shadow-none"
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-3">
            <h2 className="text-sm font-black uppercase text-slate-500 tracking-wider">Totales</h2>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal (sin IVA)</span>
              <span className="font-bold tabular-nums">{formatQuotationCurrency(quotation.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">IVA</span>
              <span className="font-bold tabular-nums">{formatQuotationCurrency(quotation.tax_amount)}</span>
            </div>
            <div className="flex justify-between text-lg pt-2 border-t border-slate-100">
              <span className="font-black text-slate-700">Total (con IVA)</span>
              <span className="font-black text-indigo-700">{formatQuotationCurrency(quotation.total_price)}</span>
            </div>
          </Card>

          <Card className="p-6 space-y-3">
            <h2 className="text-sm font-black uppercase text-slate-500 tracking-wider">Acciones</h2>
            <QuotationRowActions
              quotation={quotation}
              onView={() => undefined}
              hideView
              onEdit={() => navigate(`/quotations/edit/${quotation.id}`)}
              onReview={() => setReviewing(true)}
              onPdf={handlePdf}
              onAction={(kind: QuotationActionKind) => setPending({ kind, quotation })}
            />
            {quotation.status === 'PENDING_AUTH' && (
              <p className="text-xs text-slate-500 text-center">En revisión de Dirección: no se puede editar.</p>
            )}
          </Card>
        </div>
      </div>

      <QuotationActionDialogs pending={pending} onClose={() => setPending(null)} onDone={refresh} />

      {reviewing && (
        <FinancialReviewModal
          quotationId={quotation.id}
          onClose={() => setReviewing(false)}
          onOrderUpdated={() => void refresh()}
        />
      )}
    </div>
  );
};

export default QuotationDetailPage;
