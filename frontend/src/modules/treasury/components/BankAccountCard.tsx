import React from 'react';
import { Building2, Wallet } from 'lucide-react';
import { BankAccount } from '../../../types/treasury';

interface Props {
  account: BankAccount;
  onClick: (account: BankAccount) => void;
}

export const BankAccountCard: React.FC<Props> = ({ account, onClick }) => {
  return (
    <div 
      onClick={() => onClick(account)}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer"
    >
      {/* Encabezado de la tarjeta */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Building2 size={24} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{account.name}</h3>
            <p className="text-sm text-gray-500">Cta: {account.account_number}</p>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${account.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {account.is_active ? 'Activa' : 'Inactiva'}
        </span>
      </div>

      {/* Sección del Saldo */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-sm text-gray-500 mb-1">Saldo Actual</p>
        <div className="flex items-center gap-2">
          <Wallet className="text-gray-400" size={20} />
          <span className="text-2xl font-bold text-gray-900">
            ${account.current_balance?.toLocaleString('es-MX', { minimumFractionDigits: 2 })} 
            <span className="text-sm text-gray-500 font-normal ml-1">{account.currency}</span>
          </span>
        </div>
      </div>
    </div>
  );
};