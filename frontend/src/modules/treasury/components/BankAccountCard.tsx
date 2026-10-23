import React from 'react';
import { Building2 } from 'lucide-react';
import { BankAccount } from '../../../types/treasury';
import { formatMoney } from '@/utils/format';

interface Props {
  account: BankAccount;
  onClick: (account: BankAccount) => void;
}

/** Bank account card (guide v2 §3: white card, the color only in the figure and the status tag). */
export const BankAccountCard: React.FC<Props> = ({ account, onClick }) => {
  return (
    <div
      onClick={() => onClick(account)}
      role="button"
      className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md hover:border-indigo-200 transition"
    >
      <div className="flex justify-between items-start gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Building2 size={20} className="text-indigo-600 shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-slate-800 truncate">{account.name}</p>
            <p className="text-xs text-slate-500 font-mono">Cta. {account.account_number}</p>
          </div>
        </div>
        <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border ${account.is_active
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {account.is_active ? 'Activa' : 'Inactiva'}
        </span>
      </div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mt-4">Saldo actual</p>
      <p className="text-2xl font-black tabular-nums mt-1 text-slate-800">
        {formatMoney(account.current_balance)}
        <span className="text-sm text-slate-500 font-medium ml-1">{account.currency}</span>
      </p>
    </div>
  );
};
