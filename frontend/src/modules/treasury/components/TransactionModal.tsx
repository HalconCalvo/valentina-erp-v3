import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Plus, Trash2 } from 'lucide-react';
import { BankAccount, BankTransactionCreate } from '../../../types/treasury';
import { treasuryService } from '../../../api/treasury-service';
import { salesService } from '../../../api/sales-service';
import axiosClient from '../../../api/axios-client';
import { toast } from '@/components/ui/VToast';

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
        reference: ''
      });
      setDisplayAmount(''); // Limpiamos la pantalla visual del importe
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
            finalData.description = `Cobro ${selectedInvoice.payment_type} — ${selectedInvoice.project_name} — Fact. ${selectedInvoice.invoice_folio}`;
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
      toast.error(error?.response?.data?.detail || 'Hubo un error al registrar el movimiento.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* ENCABEZADO */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/80">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-slate-800">Registrar Movimiento</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  watchType === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {watchType === 'IN' ? 'Ingreso' : 'Egreso'}
              </span>
            </div>
            
            {currentAccount && (
              <div className="text-sm text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                <p>Cuenta: <span className="font-semibold text-slate-700">{currentAccount.name}</span></p>
                <p>Saldo Actual: <span className="font-semibold">${currentAccount.current_balance?.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span></p>
                
                <div className="flex items-center gap-2 pl-4 border-l border-slate-200 ml-2">
                  <span>Nuevo Saldo Estimado:</span>
                  <span className={`text-lg font-black tracking-tight transition-all duration-300 ${
                    watchAmount > 0 
                      ? (watchType === 'IN' ? 'text-green-600' : 'text-red-600')
                      : 'text-slate-400'
                  }`}>
                    ${nuevoSaldoCuenta.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-2 rounded-full hover:bg-slate-200/50 -mr-2 -mt-2">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-8">
          
          <input type="hidden" {...register('transaction_type')} />

          {!selectedAccountId && (
            <div className="mb-6 w-full md:w-1/3">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Cuenta Bancaria *</label>
              <select 
                {...register('account_id', { required: true, valueAsNumber: true })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Selecciona una cuenta...</option>
                {accounts?.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
          )}

          {watchType === 'IN' && (
            <div className="mb-6 w-full md:w-2/3">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">¿Afecta una factura de cliente? (opcional)</label>
              <select
                value={selectedCxcId}
                onChange={e => setSelectedCxcId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— Ninguna (ingreso general) —</option>
                {pendingInvoices.map(inv => (
                  <option key={inv.cxc_id} value={inv.cxc_id}>
                    {inv.project_name} — {inv.invoice_folio} — Saldo ${Number(inv.saldo || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ({inv.payment_type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {watchType === 'IN' && selectedInvoice && (
            <div className="mb-6 w-full md:w-2/3 bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-3">Factura que se cobra</div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Proyecto</span><span className="font-semibold text-slate-800">{selectedInvoice.project_name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Factura</span><span className="font-mono text-slate-800">{selectedInvoice.invoice_folio}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Tipo</span><span className="text-slate-800">{selectedInvoice.payment_type}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Saldo factura</span><span className="font-semibold text-slate-800">${saldoActual.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
              </div>
              <div className={`flex justify-between items-center mt-3 pt-3 border-t border-slate-200 ${quedaSaldada ? 'text-emerald-600' : 'text-amber-600'}`}>
                <span className="text-sm font-medium">Nuevo saldo factura</span>
                <span className="text-base font-bold">
                  ${nuevoSaldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}{quedaSaldada ? ' — Saldada' : ''}
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
                      <select
                        value={item.cxc_id}
                        onChange={e => {
                          const updated = [...extraCxcItems];
                          const cxcId = e.target.value ? Number(e.target.value) : '';
                          const invSaldo = pendingInvoices.find(i => i.cxc_id === Number(cxcId))?.saldo || 0;
                          updated[idx] = { cxc_id: cxcId, amount: String(Number(invSaldo).toFixed(2)) };
                          setExtraCxcItems(updated);
                        }}
                        className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        <option value="">— Selecciona factura —</option>
                        {pendingInvoices
                          .filter(i => 
                            i.cxc_id !== Number(selectedCxcId) && 
                            !extraCxcItems.some((ex, j) => j !== idx && ex.cxc_id === i.cxc_id) &&
                            (selectedInvoice?.client_id == null || i.client_id === selectedInvoice.client_id)
                          )
                          .map(i => (
                            <option key={i.cxc_id} value={i.cxc_id}>
                              {i.project_name} — {i.invoice_folio} — Saldo ${Number(i.saldo || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </option>
                          ))
                        }
                      </select>
                      {inv && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-indigo-600 font-medium">Abono:</span>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-indigo-500 text-xs font-bold">$</span>
                            <input
                              type="text"
                              value={item.amount}
                              onChange={e => {
                                const updated = [...extraCxcItems];
                                updated[idx] = { ...updated[idx], amount: e.target.value.replace(/[^0-9.]/g, '') };
                                setExtraCxcItems(updated);
                              }}
                              className="pl-5 pr-3 py-1.5 border border-indigo-200 rounded-lg text-sm font-bold text-indigo-700 w-36 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                          </div>
                          <span className="text-[11px] text-indigo-500">de ${Number(inv.saldo || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => setExtraCxcItems(prev => prev.filter((_, j) => j !== idx))}
                      className="text-rose-400 hover:text-rose-600 p-1 mt-1">
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}

              {/* Botón agregar + resumen */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setExtraCxcItems(prev => [...prev, { cxc_id: '', amount: '' }])}
                  className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 text-xs font-bold border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                >
                  <Plus size={14} /> Agregar factura
                </button>
                {importeCobro > 0 && (
                  <div className={`text-xs font-bold px-3 py-1.5 rounded-lg ${excedido ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                    {excedido
                      ? `⚠ Excedido por $${(totalAplicado - importeCobro).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                      : sobrante > 0.01
                        ? `Sobrante: $${sobrante.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                        : '✓ Depósito aplicado al 100%'
                    }
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-4 items-end">
            
            {!selectedInvoice && (
            <div className="w-full md:flex-[2]">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Concepto *</label>
              <input 
                {...register('description')}
                placeholder="Ej. Pago de cliente..."
                autoFocus
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400"
              />
            </div>
            )}

            <div className="w-full md:flex-[1]">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Ref / Folio</label>
              <input 
                {...register('reference')}
                placeholder="Opcional"
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400"
              />
            </div>

            {/* IMPORTE MAGICO CON FORMATO */}
            <div className="w-full md:w-48">
              <label className={`block text-xs font-semibold uppercase mb-1.5 ${watchType === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                Importe *
              </label>
              <div className="relative">
                <span className={`absolute left-4 top-3 font-medium text-lg ${watchType === 'IN' ? 'text-green-600' : 'text-red-600'}`}>$</span>
                
                {/* El campo oculto que guarda el número real para la base de datos */}
                <input type="hidden" {...register('amount', { required: true, min: 0.01 })} />
                
                {/* El campo visible de tipo texto que va pintando las comas */}
                <input 
                  type="text"
                  placeholder="0.00"
                  value={displayAmount}
                  onChange={(e) => {
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
                  className={`w-full pl-8 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-2 font-bold text-lg text-right 
                    ${watchType === 'IN' 
                      ? 'border-slate-300 focus:ring-green-500 text-green-700' 
                      : 'border-slate-300 focus:ring-red-500 text-red-700'
                    }`}
                />
              </div>
            </div>

          </div>

          <div className="pt-8 flex items-center justify-end gap-3 mt-2 border-t border-slate-50">
            <button 
              type="button" 
              onClick={onClose}
              className="px-5 py-3 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl font-medium transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting || watchAmount <= 0 || excedido}
              className={`px-8 py-3 text-white rounded-xl font-bold transition-transform active:scale-[0.98] shadow-sm flex items-center gap-2 
                disabled:opacity-50 disabled:pointer-events-none
                ${watchType === 'IN' 
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-green-200/50' 
                  : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 shadow-red-200/50'
              }`}
            >
              {isSubmitting ? 'Guardando...' : `Registrar ${watchType === 'IN' ? 'Ingreso' : 'Egreso'}`}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};