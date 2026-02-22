import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X } from 'lucide-react';
import { BankAccount, BankTransactionCreate } from '../../../types/treasury';
import { treasuryService } from '../../../api/treasury-service';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accounts: BankAccount[];
  selectedAccountId?: number | null;
  initialType?: 'IN' | 'OUT'; 
}

export const TransactionModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, accounts, selectedAccountId, initialType }) => {
  // 👇 Agregamos 'setValue' para inyectarle el número limpio al formulario
  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<BankTransactionCreate>();
  
  // 👇 Estado local para mostrar el texto bonito con comas
  const [displayAmount, setDisplayAmount] = useState('');

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
    }
  }, [isOpen, selectedAccountId, initialType, reset]);

  // Observamos los valores
  const watchAmount = watch('amount') || 0;
  const watchType = watch('transaction_type');
  const currentAccount = accounts?.find(a => a.id === selectedAccountId);

  let nuevoSaldo = currentAccount?.current_balance || 0;
  if (currentAccount && watchAmount > 0 && !isNaN(watchAmount)) {
    if (watchType === 'IN') nuevoSaldo += Number(watchAmount);
    else if (watchType === 'OUT') nuevoSaldo -= Number(watchAmount);
  }

  if (!isOpen) return null;

  const onSubmit = async (data: BankTransactionCreate) => {
    try {
      await treasuryService.createTransaction(data);
      onSuccess(); 
      onClose(); 
    } catch (error) {
      console.error('Error al registrar el movimiento:', error);
      alert('Hubo un error al registrar el movimiento.');
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
                    ${nuevoSaldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
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

          <div className="flex flex-col md:flex-row gap-4 items-end">
            
            <div className="w-full md:flex-[2]">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Concepto *</label>
              <input 
                {...register('description', { required: true })}
                placeholder="Ej. Pago de cliente..."
                autoFocus
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400"
              />
            </div>

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
              disabled={isSubmitting || watchAmount <= 0}
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