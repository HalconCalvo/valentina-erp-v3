import React from 'react';
import { useForm } from 'react-hook-form';
import { BankAccountCreate } from '../../../types/treasury';
import { treasuryService } from '../../../api/treasury-service';
import { Input } from '@/components/ui/Input';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { toast } from '@/components/ui/VToast';
import Modal from '@/components/ui/Modal';
import { ModalFooter } from '@/components/ui/ModalFooter';

const CURRENCY_OPTIONS = [
  { value: 'MXN', label: 'MXN - Pesos' },
  { value: 'USD', label: 'USD - Dólares' },
  { value: 'EUR', label: 'EUR - Euros' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateAccountModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<BankAccountCreate>({
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
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Hubo un error al guardar la cuenta.');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      title="Nueva cuenta bancaria"
      footer={<ModalFooter onCancel={onClose} confirmLabel="Guardar cuenta" form="create-bank-account" busy={isSubmitting} />}
    >
        <form id="create-bank-account" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Nombre de la cuenta *</label>
            <Input
              {...register('name', { required: 'El nombre es obligatorio' })}
              placeholder="Ej. Banorte Fiscal MXN"
            />
            {errors.name && <span className="text-xs text-red-600">{errors.name.message}</span>}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Número de cuenta *</label>
            <Input
              {...register('account_number', { required: 'El número de cuenta es obligatorio' })}
              placeholder="Ej. 0987654321"
            />
            {errors.account_number && <span className="text-xs text-red-600">{errors.account_number.message}</span>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Moneda</label>
              <SearchableSelect
                items={CURRENCY_OPTIONS}
                value={watch('currency') || 'MXN'}
                onChange={(value) => setValue('currency', value)}
                getLabel={(option) => option.label}
                getValue={(option) => option.value}
                placeholder="Seleccionar moneda"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Saldo inicial</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500">$</span>
                <Input
                  type="number"
                  step="0.01"
                  {...register('initial_balance', { valueAsNumber: true })}
                  className="pl-7 tabular-nums"
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>
  );
};