import React from 'react';
import { useForm } from 'react-hook-form';
import { X } from 'lucide-react';
import { BankAccountCreate } from '../../../types/treasury';
import { treasuryService } from '../../../api/treasury-service';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateAccountModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<BankAccountCreate>({
    defaultValues: {
      currency: 'MXN',
      initial_balance: 0
    }
  });

  if (!isOpen) return null;

  const onSubmit = async (data: BankAccountCreate) => {
    try {
      await treasuryService.createAccount(data);
      reset(); // Limpia el formulario
      onSuccess(); // Le avisa a la tabla que recargue los datos
      onClose(); // Cierra el modal
    } catch (error) {
      console.error('Error al crear la cuenta:', error);
      alert('Hubo un error al guardar la cuenta. Revisa la consola.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        
        {/* Encabezado */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Nueva Cuenta Bancaria</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Cuenta *</label>
            <input 
              {...register('name', { required: 'El nombre es obligatorio' })}
              placeholder="Ej. Banorte Fiscal MXN"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {errors.name && <span className="text-xs text-red-500">{errors.name.message}</span>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Número de Cuenta *</label>
            <input 
              {...register('account_number', { required: 'El número de cuenta es obligatorio' })}
              placeholder="Ej. 0987654321"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {errors.account_number && <span className="text-xs text-red-500">{errors.account_number.message}</span>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
              <select 
                {...register('currency')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
              >
                <option value="MXN">MXN - Pesos</option>
                <option value="USD">USD - Dólares</option>
                <option value="EUR">EUR - Euros</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Saldo Inicial</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500">$</span>
                <input 
                  type="number"
                  step="0.01"
                  {...register('initial_balance', { valueAsNumber: true })}
                  className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 mt-6">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar Cuenta'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};