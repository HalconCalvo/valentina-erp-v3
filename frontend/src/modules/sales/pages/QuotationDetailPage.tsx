import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Send, CheckCircle, Ban, XCircle, ArrowRightCircle,
  FileDown, Pencil, Loader, CopyPlus,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
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
import { Quotation, QuotationItem, QuotationStatus } from '../../../types/quotations';

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

const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

type ReasonModalKind = 'cancel' | 'reject';

const QuotationDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const quotationId = Number(id);

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [sendConfirm, setSendConfirm] = useState(false);
  const [acceptConfirm, setAcceptConfirm] = useState(false);
  const [convertConfirm, setConvertConfirm] = useState(false);
  const [reasonModal, setReasonModal] = useState<{ open: boolean; kind: ReasonModalKind }>({
    open: false,
    kind: 'cancel',
  });
  const [reasonText, setReasonText] = useState('');

  const load = async () => {
    if (!Number.isFinite(quotationId)) {
      navigate('/quotations');
      return;
    }
    setLoading(true);
    try {
      const data = await quotationService.getQuotation(quotationId);
      setQuotation(data);
    } catch {
      toast.error('No se pudo cargar la cotización.');
      navigate('/quotations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [quotationId]);

  const activeItems = useMemo(
    () => (quotation?.items ?? []).filter((i) => !i.is_cancelled),
    [quotation],
  );

  const itemColumns: VTableColumn<QuotationItem>[] = useMemo(() => [
    { key: 'product_name', label: 'Producto', sortable: true },
    {
      key: 'quantity',
      label: 'Cantidad',
      sortable: true,
      render: (row) => row.quantity.toLocaleString('en-US', { maximumFractionDigits: 2 }),
    },
    {
      key: 'unit_price',
      label: 'Precio unit.',
      render: (row) => formatQuotationCurrency(row.unit_price),
    },
    {
      key: 'subtotal_price',
      label: 'Subtotal',
      render: (row) => formatQuotationCurrency(row.subtotal_price ?? row.quantity * row.unit_price),
    },
  ], []);

  const runAction = async (action: () => Promise<void>) => {
    setProcessing(true);
    try {
      await action();
      await load();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo completar la acción.');
    } finally {
      setProcessing(false);
    }
  };

  const handleReasonConfirm = async () => {
    if (!quotation) return;
    const reason = reasonText.trim();
    if (!reason) {
      toast.warning('El motivo es obligatorio.');
      return;
    }
    await runAction(async () => {
      if (reasonModal.kind === 'cancel') {
        await quotationService.cancelQuotation(quotation.id, reason);
        toast.success('Cotización cancelada.');
      } else {
        await quotationService.rejectQuotation(quotation.id, reason);
        toast.success('Cotización rechazada.');
      }
      setReasonModal({ open: false, kind: 'cancel' });
      setReasonText('');
    });
  };

  const handleConvert = async () => {
    if (!quotation) return;
    setProcessing(true);
    try {
      const result = await quotationService.convertToOrder(quotation.id);
      toast.success(result.message || 'Orden de venta creada.');
      setConvertConfirm(false);
      navigate(`/sales/edit/${result.sales_order_id}`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo convertir a OV.');
    } finally {
      setProcessing(false);
    }
  };

  const handlePdf = async () => {
    if (!quotation) return;
    setProcessing(true);
    try {
      await quotationService.openQuotationPdf(quotation.id);
    } catch {
      toast.error('Error al generar el PDF.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading || !quotation) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50">
        <Loader className="animate-spin text-indigo-600 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Cargando cotización...</p>
      </div>
    );
  }

  const isDraft = quotation.status === 'DRAFT';
  const isSent = quotation.status === 'SENT';
  const isAccepted = quotation.status === 'ACCEPTED';
  const isRejected = quotation.status === 'REJECTED';

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/quotations')}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
          title="Volver"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black text-slate-800">{formatQuotationFolio(quotation.id)}</h1>
            <Badge className={statusBadgeClass(quotation.status)}>
              {QUOTATION_STATUS_LABELS[quotation.status]}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">{quotation.project_name}</p>
        </div>
        <Button variant="outline" onClick={handlePdf} disabled={processing} className="gap-2">
          <FileDown size={16} /> PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-4">
            <h2 className="text-sm font-black uppercase text-slate-500 tracking-wider">Información general</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-400 font-bold text-xs uppercase">Cliente</p>
                <p className="font-bold text-slate-800">{quotation.client?.business_name ?? '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold text-xs uppercase">Proyecto</p>
                <p className="font-bold text-slate-800">{quotation.project_name}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold text-xs uppercase">Válida hasta</p>
                <p className="font-medium text-slate-700">{formatDateTime(quotation.valid_until)}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold text-xs uppercase">Creada</p>
                <p className="font-medium text-slate-700">{formatDateTime(quotation.created_at)}</p>
              </div>
              {quotation.sent_at && (
                <div>
                  <p className="text-slate-400 font-bold text-xs uppercase">Enviada</p>
                  <p className="font-medium text-slate-700">{formatDateTime(quotation.sent_at)}</p>
                </div>
              )}
              {quotation.accepted_at && (
                <div>
                  <p className="text-slate-400 font-bold text-xs uppercase">Aceptada</p>
                  <p className="font-medium text-slate-700">{formatDateTime(quotation.accepted_at)}</p>
                </div>
              )}
              {quotation.rejected_at && (
                <div>
                  <p className="text-slate-400 font-bold text-xs uppercase">Rechazada</p>
                  <p className="font-medium text-slate-700">{formatDateTime(quotation.rejected_at)}</p>
                </div>
              )}
              {quotation.reject_reason && (
                <div className="sm:col-span-2">
                  <p className="text-slate-400 font-bold text-xs uppercase">Motivo rechazo</p>
                  <p className="font-medium text-orange-700">{quotation.reject_reason}</p>
                </div>
              )}
              {quotation.cancel_reason && (
                <div className="sm:col-span-2">
                  <p className="text-slate-400 font-bold text-xs uppercase">Motivo cancelación</p>
                  <p className="font-medium text-red-700">{quotation.cancel_reason}</p>
                </div>
              )}
            </div>
            {(quotation.notes || quotation.conditions) && (
              <div className="pt-4 border-t border-slate-100 space-y-3 text-sm">
                {quotation.notes && (
                  <div>
                    <p className="text-slate-400 font-bold text-xs uppercase mb-1">Notas</p>
                    <p className="text-slate-600 whitespace-pre-wrap">{quotation.notes}</p>
                  </div>
                )}
                {quotation.conditions && (
                  <div>
                    <p className="text-slate-400 font-bold text-xs uppercase mb-1">Condiciones</p>
                    <p className="text-slate-600 whitespace-pre-wrap">{quotation.conditions}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-sm font-black uppercase text-slate-500 tracking-wider mb-4">Partidas</h2>
            <VTable
              columns={itemColumns}
              data={activeItems as unknown as Record<string, unknown>[] as QuotationItem[]}
              emptyState={{ title: 'Sin partidas activas' }}
              className="border-0 shadow-none"
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-3">
            <h2 className="text-sm font-black uppercase text-slate-500 tracking-wider">Totales</h2>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-bold">{formatQuotationCurrency(quotation.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">IVA</span>
              <span className="font-bold">{formatQuotationCurrency(quotation.tax_amount)}</span>
            </div>
            <div className="flex justify-between text-lg pt-2 border-t border-slate-100">
              <span className="font-black text-slate-700">Total</span>
              <span className="font-black text-indigo-700">{formatQuotationCurrency(quotation.total_price)}</span>
            </div>
          </Card>

          <Card className="p-6 space-y-3">
            <h2 className="text-sm font-black uppercase text-slate-500 tracking-wider">Acciones</h2>

            {isDraft && (
              <>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => navigate(`/quotations/edit/${quotation.id}`)}
                  disabled={processing}
                >
                  <Pencil size={16} /> Editar
                </Button>
                <Button className="w-full gap-2" onClick={() => setSendConfirm(true)} disabled={processing}>
                  <Send size={16} /> Enviar al cliente
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => {
                    setReasonModal({ open: true, kind: 'cancel' });
                    setReasonText('');
                  }}
                  disabled={processing}
                >
                  <XCircle size={16} /> Cancelar
                </Button>
              </>
            )}

            {isSent && (
              <>
                <Button className="w-full gap-2" onClick={() => setAcceptConfirm(true)} disabled={processing}>
                  <CheckCircle size={16} /> Cliente acepta
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                  onClick={() => {
                    setReasonModal({ open: true, kind: 'reject' });
                    setReasonText('');
                  }}
                  disabled={processing}
                >
                  <Ban size={16} /> Cliente rechaza
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => {
                    setReasonModal({ open: true, kind: 'cancel' });
                    setReasonText('');
                  }}
                  disabled={processing}
                >
                  <XCircle size={16} /> Cancelar
                </Button>
              </>
            )}

            {isAccepted && (
              <>
                {quotation.sales_order_id ? (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => navigate(`/sales/edit/${quotation.sales_order_id}`)}
                  >
                    <ArrowRightCircle size={16} /> Ver OV #{quotation.sales_order_id}
                  </Button>
                ) : (
                  <Button className="w-full gap-2" onClick={() => setConvertConfirm(true)} disabled={processing}>
                    <ArrowRightCircle size={16} /> Convertir a OV
                  </Button>
                )}
              </>
            )}

            {isRejected && (
              <Button
                className="w-full gap-2"
                onClick={() => navigate('/quotations/new', { state: { cloneFrom: quotation } })}
              >
                <CopyPlus size={16} /> Nueva versión
              </Button>
            )}

            {!isDraft && !isSent && !isAccepted && !isRejected && (
              <p className="text-sm text-slate-400 text-center py-2">Solo lectura</p>
            )}
          </Card>
        </div>
      </div>

      <VConfirmDialog
        isOpen={sendConfirm}
        title="Enviar cotización"
        message="¿Enviar esta cotización al cliente? No podrá editarse después."
        confirmLabel="Enviar"
        onConfirm={() => {
          setSendConfirm(false);
          runAction(async () => {
            await quotationService.sendQuotation(quotation.id);
            toast.success('Cotización enviada.');
          });
        }}
        onCancel={() => setSendConfirm(false)}
      />

      <VConfirmDialog
        isOpen={acceptConfirm}
        title="Aceptar cotización"
        message="¿Confirmar que el cliente aceptó esta cotización?"
        confirmLabel="Aceptar"
        onConfirm={() => {
          setAcceptConfirm(false);
          runAction(async () => {
            await quotationService.acceptQuotation(quotation.id);
            toast.success('Cotización aceptada.');
          });
        }}
        onCancel={() => setAcceptConfirm(false)}
      />

      <VConfirmDialog
        isOpen={convertConfirm}
        title="Convertir a Orden de Venta"
        message="¿Convertir esta cotización en una Orden de Venta?"
        consequence="Se creará una OV vinculada. Esta acción no se puede deshacer."
        confirmLabel="Convertir"
        onConfirm={handleConvert}
        onCancel={() => setConvertConfirm(false)}
      />

      {reasonModal.open && (
        <Modal
          isOpen
          onClose={() => {
            if (processing) return;
            setReasonModal({ open: false, kind: 'cancel' });
            setReasonText('');
          }}
          title={reasonModal.kind === 'cancel' ? 'Cancelar cotización' : 'Rechazar cotización'}
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {reasonModal.kind === 'cancel'
                ? 'Indica el motivo de la cancelación.'
                : 'Indica el motivo del rechazo del cliente.'}
            </p>
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {reasonModal.kind === 'cancel'
                ? 'La cotización quedará cancelada con trazabilidad.'
                : 'La cotización quedará rechazada. Podrás crear una nueva versión.'}
            </div>
            <Input
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Motivo obligatorio..."
            />
            <div className="flex justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={processing}
                onClick={() => {
                  setReasonModal({ open: false, kind: 'cancel' });
                  setReasonText('');
                }}
                className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-black rounded-lg disabled:opacity-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={handleReasonConfirm}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-lg disabled:opacity-50"
              >
                {processing ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default QuotationDetailPage;
