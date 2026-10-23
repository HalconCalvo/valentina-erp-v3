import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { BankAccount, BankTransactionCreate } from '../../../types/treasury';
import { treasuryService } from '../../../api/treasury-service';
import { salesService } from '../../../api/sales-service';
import axiosClient from '../../../api/axios-client';
import { toast } from '@/components/ui/VToast';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { formatMoney, formatInvoiceType } from '@/utils/format';
import { getLocalTodayDateKey } from '@/modules/planning/hooks/usePlanning';
import Modal from '@/components/ui/Modal';
import { ModalFooter } from '@/components/ui/ModalFooter';
import { Button } from '@/components/ui/Button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accounts: BankAccount[];
  selectedAccountId?: number | null;
  initialType?: 'IN' | 'OUT';
  initialCxcId?: number | null;
}

export const TransactionModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, accounts, selectedAccountId, initialType, initialCxcId }) => {
  // 👇 Agregamos 'setValue' para inyectarle el número limpio al formulario
  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<BankTransactionCreate>();
  
  // 👇 Estado local para mostrar el texto bonito con comas
  const [displayAmount, setDisplayAmount] = useState('');
  // H49/H62: until the user types an amount, it is the sum of the chosen invoices' balances
  const [amountTouched, setAmountTouched] = useState(false);

  // Camino A: facturas de CxC pendientes que un ingreso puede afectar (opcional)
  const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
  const [selectedCxcId, setSelectedCxcId] = useState<number | ''>('');
  // Items adicionales de CxC para cobro múltiple
  const [extraCxcItems, setExtraCxcItems] = useState<{cxc_id: number | ''; amount: string}[]>([]);

  // Reseteamos el formulario al abrir
  useEffect(() => {
    if (isOpen) {
      reset({
        account_id: selectedAccountId || undefined,
        transaction_type: initialType || 'IN',
        amount: 0,
        description: '',
        reference: '',
        deposit_date: getLocalTodayDateKey(),
      });
      setDisplayAmount(''); // Limpiamos la pantalla visual del importe
      setAmountTouched(false);
      setSelectedCxcId(initialCxcId ?? '');
      setExtraCxcItems([]);
      salesService.getPendingInvoices().then(setPendingInvoices).catch(() => setPendingInvoices([]));
    }
  }, [isOpen, selectedAccountId, initialType, initialCxcId, reset]);

  // Observamos los valores
  const watchAmount = watch('amount') || 0;
  const watchType = watch('transaction_type');
  const currentAccount = accounts?.find(a => a.id === selectedAccountId);

  let nuevoSaldoCuenta = currentAccount?.current_balance || 0;
  if (currentAccount && watchAmount > 0 && !isNaN(watchAmount)) {
    if (watchType === 'IN') nuevoSaldoCuenta += Number(watchAmount);
    else if (watchType === 'OUT') nuevoSaldoCuenta -= Number(watchAmount);
  }

  const selectedInvoice = pendingInvoices.find(inv => inv.cxc_id === Number(selectedCxcId)) || null;
  const saldoActual = selectedInvoice ? Number(selectedInvoice.saldo || 0) : 0;
  const importeCobro = Number(watchAmount || 0);
  const nuevoSaldo = Math.max(saldoActual - importeCobro, 0);
  const quedaSaldada = selectedInvoice && importeCobro > 0 && (saldoActual - importeCobro) <= 0.01;
  const totalAplicado = (selectedCxcId && selectedInvoice
    ? Math.min(importeCobro, saldoActual)
    : 0)
    + extraCxcItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const sobrante = Math.max(importeCobro - totalAplicado, 0);
  const excedido = totalAplicado > importeCobro + 0.01;

  // H49/H62: the amount proposes the sum of the chosen invoices' balances (amount − amortized advance − payments)
  // and follows when invoices are added or removed, until the user types an amount
  const extrasKey = extraCxcItems.map((i) => `${i.cxc_id}:${i.amount}`).join('|');
  useEffect(() => {
    if (amountTouched || watchType !== 'IN' || !selectedInvoice) return;
    const sum = Math.round((saldoActual
      + extraCxcItems.reduce((acc, item) => acc + (item.cxc_id !== '' ? parseFloat(item.amount) || 0 : 0), 0)) * 100) / 100;
    if (sum <= 0) return;
    setValue('amount', sum, { shouldValidate: true });
    setDisplayAmount(new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(sum));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoice?.cxc_id, saldoActual, extrasKey, amountTouched, watchType]);

  if (!isOpen) return null;

  const onSubmit = async (data: BankTransactionCreate) => {
    try {
      const tieneExtras = extraCxcItems.some(i => i.cxc_id !== '');

      if (data.transaction_type === 'IN' && selectedCxcId && tieneExtras) {
        // Cobro múltiple — endpoint bulk
        const items = [
          { cxc_id: Number(selectedCxcId), amount: Math.min(importeCobro, saldoActual) },
          ...extraCxcItems
            .filter(i => i.cxc_id !== '' && parseFloat(i.amount) > 0)
            .map(i => ({ cxc_id: Number(i.cxc_id), amount: parseFloat(i.amount) }))
        ];
        await axiosClient.post('/treasury/transactions/bulk-cxc', {
          account_id: data.account_id || selectedAccountId,
          amount: data.amount,
          deposit_date: data.deposit_date || undefined,
          reference: data.reference,
          description: `Cobro múltiple — ${items.length} factura(s)`,
          items,
        });
      } else {
        // Flujo original — una sola factura
        const finalData = { ...data };
        if (data.transaction_type === 'IN' && selectedCxcId) {
          finalData.related_entity_type = 'CUSTOMER_PAYMENT';
          finalData.related_entity_id = Number(selectedCxcId);
          if (selectedInvoice) {
            finalData.description = `Cobro ${formatInvoiceType(selectedInvoice.payment_type)} — ${selectedInvoice.project_name} — Fact. ${selectedInvoice.invoice_folio}`;
          }
        }
        if (!selectedInvoice) {
          finalData.description = finalData.description || 'Ingreso general';
        }
        await treasuryService.createTransaction(finalData);
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      // H63: say why (server detail, or the HTTP status when the server gave none)
      const status = error?.response?.status;
      toast.error(error?.response?.data?.detail
        || (status ? `Hubo un error al registrar el movimiento (servidor ${status}).` : 'Hubo un error al registrar el movimiento: sin conexión con el servidor.'));
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="3xl"
      title={watchType === 'IN' ? 'Registrar ingreso' : 'Registrar egreso'}
      subtitle={currentAccount
        ? `${currentAccount.name} · saldo actual ${formatMoney(currentAccount.current_balance)} · nuevo saldo estimado ${formatMoney(nuevoSaldoCuenta)}`
        : undefined}
      footer={(
        <ModalFooter
          onCancel={onClose}
          confirmLabel={watchType === 'IN' ? 'Registrar ingreso' : 'Registrar egreso'}
          form="bank-transaction"
          disabled={watchAmount <= 0 || excedido}
          busy={isSubmitting}
          tone="success"
        />
      )}
    >
        <form id="bank-transaction" onSubmit={handleSubmit(onSubmit)}>
          
          <Input type="hidden" {...register('transaction_type')} />

          {!selectedAccountId && (
            <div className="mb-6 w-full md:w-1/3">
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Cuenta bancaria *</label>
              <Input type="hidden" {...register('account_id', { required: true, valueAsNumber: true })} />
              <SearchableSelect
                items={accounts ?? []}
                value={watch('account_id') ? String(watch('account_id')) : ''}
                onChange={(v) => setValue('account_id', v ? Number(v) : undefined, { shouldValidate: true })}
                getLabel={(acc) => acc.name}
                getValue={(acc) => String(acc.id)}
                placeholder="Selecciona una cuenta..."
              />
            </div>
          )}

          {watchType === 'IN' && (
            <div className="mb-6 w-full md:w-2/3">
              <label className="block text-xs font-bold text-slate-500 mb-1.5">¿Afecta una factura de cliente? (opcional)</label>
              <SearchableSelect
                items={pendingInvoices}
                value={selectedCxcId === '' ? '' : String(selectedCxcId)}
                onChange={(v) => setSelectedCxcId(v ? Number(v) : '')}
                getLabel={(inv) =>
                  `${inv.project_name} — ${inv.invoice_folio} — Saldo ${formatMoney(Number(inv.saldo || 0))} (${formatInvoiceType(inv.payment_type)})`
                }
                getValue={(inv) => String(inv.cxc_id)}
                placeholder="— Ninguna (ingreso general) —"
              />
            </div>
          )}

          {watchType === 'IN' && selectedInvoice && (
            <div className="mb-6 w-full md:w-2/3 bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-3">Factura que se cobra</div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Proyecto</span><span className="font-semibold text-slate-800">{selectedInvoice.project_name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Factura</span><span className="font-mono text-slate-800">{selectedInvoice.invoice_folio}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Tipo</span><span className="text-slate-800">{formatInvoiceType(selectedInvoice.payment_type)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Saldo factura</span><span className="font-semibold text-slate-800">{formatMoney(saldoActual)}</span></div>
              </div>
              <div className={`flex justify-between items-center mt-3 pt-3 border-t border-slate-200 ${quedaSaldada ? 'text-emerald-600' : 'text-amber-600'}`}>
                <span className="text-sm font-medium">Nuevo saldo factura</span>
                <span className="text-base font-bold">
                  {formatMoney(nuevoSaldo)}{quedaSaldada ? ' — Saldada' : ''}
                </span>
              </div>
            </div>
          )}

          {watchType === 'IN' && selectedInvoice && (
            <div className="mb-6 w-full md:w-2/3 space-y-3">
              {/* Facturas adicionales */}
              {extraCxcItems.map((item, idx) => {
                const inv = pendingInvoices.find(i => i.cxc_id === Number(item.cxc_id));
                return (
                  <div key={idx} className="bg-indigo-50 rounded-xl p-4 border border-indigo-200 flex items-start gap-3">
                    <div className="flex-1 space-y-2">
                      <SearchableSelect
                        items={pendingInvoices.filter(i =>
                          i.cxc_id !== Number(selectedCxcId) &&
                          !extraCxcItems.some((ex, j) => j !== idx && ex.cxc_id === i.cxc_id) &&
                          (selectedInvoice?.client_id == null || i.client_id === selectedInvoice.client_id)
                        )}
                        value={item.cxc_id === '' ? '' : String(item.cxc_id)}
                        onChange={(v) => {
                          const updated = [...extraCxcItems];
                          const cxcId = v ? Number(v) : '';
                          const invSaldo = pendingInvoices.find(i => i.cxc_id === Number(cxcId))?.saldo || 0;
                          updated[idx] = { cxc_id: cxcId, amount: String(Number(invSaldo).toFixed(2)) };
                          setExtraCxcItems(updated);
                        }}
                        getLabel={(i) =>
                          `${i.project_name} — ${i.invoice_folio} — Saldo ${formatMoney(Number(i.saldo || 0))}`
                        }
                        getValue={(i) => String(i.cxc_id)}
                        placeholder="— Selecciona factura —"
                        className="border-indigo-200 focus:ring-indigo-400"
                      />
                      {inv && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-indigo-600 font-medium">Abono:</span>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-indigo-500 text-xs font-bold">$</span>
                            <Input
                              type="text"
                              value={item.amount}
                              onChange={e => {
                                const updated = [...extraCxcItems];
                                updated[idx] = { ...updated[idx], amount: e.target.value.replace(/[^0-9.]/g, '') };
                                setExtraCxcItems(updated);
                              }}
                              className="pl-5 pr-3 py-1.5 border-indigo-200 text-sm font-bold text-indigo-700 w-36 focus-visible:ring-indigo-400"
                            />
                          </div>
                          <span className="text-[11px] text-indigo-500">de {formatMoney(Number(inv.saldo || 0))}</span>
                        </div>
                      )}
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" title="Quitar factura" onClick={() => setExtraCxcItems(prev => prev.filter((_, j) => j !== idx))}
                      className="text-rose-400 hover:text-rose-600 mt-1">
                      <Trash2 size={16} />
                    </Button>
                  </div>
                );
              })}

              {/* Botón agregar + resumen */}
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setExtraCxcItems(prev => [...prev, { cxc_id: '', amount: '' }])}
                >
                  <Plus size={14} /> Agregar factura
                </Button>
                {importeCobro > 0 && (
                  <div className={`text-xs font-bold px-3 py-1.5 rounded-lg tabular-nums ${excedido ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                    {excedido
                      ? `Excedido por ${formatMoney((totalAplicado - importeCobro))}`
                      : sobrante > 0.01
                        ? `Sobrante: ${formatMoney(sobrante)}`
                        : 'Depósito aplicado al 100%'
                    }
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-4 items-end">
            
            {!selectedInvoice && (
            <div className="w-full md:flex-[2]">
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Concepto *</label>
              <Input
                {...register('description')}
                placeholder="Ej. Pago de cliente..."
                autoFocus
                className="w-full"
              />
            </div>
            )}

            <div className="w-full md:flex-[1]">
              <label className="block text-xs font-bold text-slate-500 mb-1.5">Referencia o folio</label>
              <Input
                {...register('reference')}
                placeholder="Opcional"
                className="w-full"
              />
            </div>

            {/* IMPORTE MAGICO CON FORMATO */}
            <div className="w-full md:w-48">
              <label className={`block text-xs font-bold mb-1.5 ${watchType === 'IN' ? 'text-emerald-700' : 'text-red-600'}`}>
                Importe *
              </label>
              <div className="relative">
                <span className={`absolute left-4 top-3 font-medium text-lg ${watchType === 'IN' ? 'text-emerald-700' : 'text-red-600'}`}>$</span>
                
                {/* El campo oculto que guarda el número real para la base de datos */}
                <Input type="hidden" {...register('amount', { required: true, min: 0.01 })} />
                
                {/* El campo visible de tipo texto que va pintando las comas */}
                <Input
                  type="text"
                  placeholder="0.00"
                  value={displayAmount}
                  onChange={(e) => {
                    setAmountTouched(true);
                    // Limpiamos todo menos números y puntos
                    let raw = e.target.value.replace(/[^0-9.]/g, '');
                    
                    // Aseguramos que solo haya un punto decimal
                    const parts = raw.split('.');
                    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
                    
                    if (raw) {
                      const intPart = parts[0] ? parseInt(parts[0], 10) : 0;
                      const formattedInt = new Intl.NumberFormat('en-US').format(intPart);
                      // Reconstruimos el número con el punto y los decimales si existen
                      const finalVal = parts.length > 1 ? `${formattedInt}.${parts[1]}` : formattedInt;
                      
                      setDisplayAmount(finalVal); // Pintamos en pantalla
                      setValue('amount', parseFloat(raw) || 0, { shouldValidate: true }); // Guardamos limpio
                    } else {
                      setDisplayAmount('');
                      setValue('amount', 0, { shouldValidate: true });
                    }
                  }}
                  className={`w-full pl-8 pr-4 py-3 rounded-lg font-bold text-lg text-right tabular-nums
                    ${watchType === 'IN' ? 'text-emerald-700' : 'text-red-700'}`}
                />
              </div>
            </div>

            {/* H9: fecha del depósito (o del egreso) */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">
                Fecha {watchType === 'IN' ? 'del depósito' : 'del movimiento'}
              </label>
              <Input type="date" max={getLocalTodayDateKey()} {...register('deposit_date')} className="w-full" />
            </div>
          </div>

        </form>
      </Modal>
  );
};