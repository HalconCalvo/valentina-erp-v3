import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { ArrowLeft, ArrowRight, PlusCircle, MinusCircle, ArrowRightLeft, Search } from 'lucide-react';
import { BankAccount } from '../../../types/treasury';
import { treasuryService } from '../../../api/treasury-service';

interface Transaction {
  id: number;
  transaction_type: string;
  amount: number;
  reference?: string;
  description?: string;
  transaction_date?: string; 
  running_balance?: number; 
}

interface Props {
  account: BankAccount;
  onBack: () => void;
  onOpenTransaction: (type: 'IN' | 'OUT') => void; 
}

// 👇 Ajustado a 10 movimientos por página
const ITEMS_PER_PAGE = 10;

export const AccountDetail: React.FC<Props> = ({ account, onBack, onOpenTransaction }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transferForm, setTransferForm] = useState({
      to_account_id: '',
      amount: '',
      reference: '',
      description: ''
  });
  const [transferring, setTransferring] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);

  const fetchTransactions = async () => {
    try {
      setIsLoading(true);
      const data = await treasuryService.getAccountTransactions(account.id);
      setTransactions(data || []);
      setCurrentPage(1); 
    } catch (error) {
      console.error('Error al cargar el historial', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAccounts = async () => {
      try {
          const data = await treasuryService.getAccounts();
          setAccounts((data || []).filter((a: BankAccount) => a.id !== account.id));
      } catch {
          console.error('Error al cargar cuentas');
      }
  };

  const handleTransfer = async () => {
      if (!transferForm.to_account_id || !transferForm.amount) {
          return alert('Selecciona la cuenta destino e ingresa el monto.');
      }
      const amount = parseFloat(transferForm.amount.replace(/,/g, ''));
      if (isNaN(amount) || amount <= 0) {
          return alert('Ingresa un monto válido.');
      }
      if (amount > (account.current_balance || 0)) {
          return alert('Saldo insuficiente.');
      }
      if (!confirm(`¿Transferir $${amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} a la cuenta seleccionada?`)) return;
      setTransferring(true);
      try {
          await treasuryService.transferFunds({
              from_account_id: account.id,
              to_account_id: parseInt(transferForm.to_account_id),
              amount,
              reference: transferForm.reference || undefined,
              description: transferForm.description || 'Transferencia entre cuentas'
          });
          alert('✅ Transferencia realizada exitosamente.');
          setShowTransferModal(false);
          setTransferForm({ to_account_id: '', amount: '', reference: '', description: '' });
          fetchTransactions();
      } catch (error: any) {
          alert(error.response?.data?.detail || 'Error al realizar la transferencia.');
      } finally {
          setTransferring(false);
      }
  };

  useEffect(() => {
    fetchTransactions();
    fetchAccounts();
  }, [account.id, account.current_balance]); 

  const transactionsWithBalance = useMemo(() => {
    let currentTempBalance = account.current_balance || 0;
    
    return transactions.map((tx) => {
      const balanceForThisRow = currentTempBalance;
      
      if (tx.transaction_type === 'IN') {
        currentTempBalance -= tx.amount;
      } else if (tx.transaction_type === 'OUT') {
        currentTempBalance += tx.amount;
      }
      
      return { ...tx, running_balance: balanceForThisRow };
    });
  }, [transactions, account.current_balance]);

  const totalPages = Math.ceil(transactionsWithBalance.length / ITEMS_PER_PAGE) || 1;
  
  const currentTransactions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return transactionsWithBalance.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, transactionsWithBalance]);

  const handleNextPage = useCallback(() => {
    setCurrentPage((prev) => (prev < totalPages ? prev + 1 : prev));
  }, [totalPages]);

  const handlePrevPage = useCallback(() => {
    setCurrentPage((prev) => (prev > 1 ? prev - 1 : prev));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      
      if (e.key === 'ArrowRight') handleNextPage();
      if (e.key === 'ArrowLeft') handlePrevPage();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown); 
  }, [handleNextPage, handlePrevPage]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-MX', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Botón de Regresar y Encabezado */}
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{account.name}</h2>
          <p className="text-gray-500">Cuenta: {account.account_number || 'S/N'} • {account.currency}</p>
        </div>
      </div>

      {/* Tarjeta Resumen y Botones de Acción */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Saldo Actual</p>
          {/* 👇 Importe grande cambiado a color azul (text-blue-700) */}
          <p className="text-4xl font-black text-blue-700">
            ${account.current_balance?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => onOpenTransaction('IN')}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 font-medium transition-colors"
          >
            <PlusCircle size={20} /> Registrar Ingreso
          </button>
          
          <button 
            onClick={() => onOpenTransaction('OUT')}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 font-medium transition-colors"
          >
            <MinusCircle size={20} /> Registrar Egreso
          </button>

          <button 
            onClick={() => setShowTransferModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 font-medium transition-colors"
          >
            <ArrowRightLeft size={20} /> Transferir
          </button>
        </div>
      </div>

      {/* Tabla del Libro Mayor */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-semibold text-gray-800">Historial de Movimientos</h3>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50">
              <tr>
                <th className="px-6 py-4 font-medium whitespace-nowrap">Fecha</th>
                <th className="px-6 py-4 font-medium min-w-[250px]">Concepto</th>
                <th className="px-6 py-4 font-medium min-w-[120px]">Ref</th>
                <th className="px-6 py-4 font-medium text-right text-red-600 min-w-[120px]">Egreso (-)</th>
                <th className="px-6 py-4 font-medium text-right text-green-600 min-w-[120px]">Ingreso (+)</th>
                {/* 👇 Cabecera de Saldo cambiada a negro */}
                <th className="px-6 py-4 font-medium text-right text-gray-900 min-w-[140px]">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">Cargando movimientos...</td>
                </tr>
              ) : currentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">Aún no hay movimientos en esta cuenta.</td>
                </tr>
              ) : (
                currentTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">{formatDate(tx.transaction_date)}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{tx.description || 'Sin descripción'}</td>
                    <td className="px-6 py-4 text-gray-500">{tx.reference || '-'}</td>
                    <td className="px-6 py-4 text-right text-red-600 font-medium whitespace-nowrap">
                      {tx.transaction_type === 'OUT' ? `$${tx.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-green-600 font-medium whitespace-nowrap">
                      {tx.transaction_type === 'IN' ? `$${tx.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    {/* 👇 Celda de Saldo cambiada a negro y sin fondo */}
                    <td className="px-6 py-4 text-right text-gray-900 font-bold whitespace-nowrap">
                      ${tx.running_balance?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}

            </tbody>
          </table>
        </div>

        {/* Controles de Paginación */}
        {!isLoading && transactionsWithBalance.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-gray-200 bg-white gap-4">
            <span className="text-sm text-gray-500">
              Mostrando <span className="font-medium text-gray-900">{((currentPage - 1) * ITEMS_PER_PAGE) + 1}</span> a <span className="font-medium text-gray-900">{Math.min(currentPage * ITEMS_PER_PAGE, transactionsWithBalance.length)}</span> de <span className="font-medium text-gray-900">{transactionsWithBalance.length}</span> movimientos
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={handlePrevPage} 
                disabled={currentPage === 1}
                className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent transition-colors flex items-center gap-1 text-sm font-medium text-gray-700"
                title="Página Anterior (Flecha Izquierda)"
              >
                <ArrowLeft size={16} /> Anterior
              </button>
              <span className="text-sm font-medium text-gray-600 min-w-[80px] text-center">
                Pág {currentPage} de {totalPages}
              </span>
              <button 
                onClick={handleNextPage} 
                disabled={currentPage === totalPages}
                className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent transition-colors flex items-center gap-1 text-sm font-medium text-gray-700"
                title="Página Siguiente (Flecha Derecha)"
              >
                Siguiente <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showTransferModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-t-4 border-t-blue-500 animate-in zoom-in-95 duration-200">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <div>
                          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                              <ArrowRightLeft size={20} className="text-blue-600" />
                              Transferencia entre Cuentas
                          </h3>
                          <p className="text-xs text-slate-500 mt-1">
                              Origen: <strong>{account.name}</strong> — Saldo: ${(account.current_balance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </p>
                      </div>
                      <button
                          onClick={() => setShowTransferModal(false)}
                          className="text-slate-400 hover:text-slate-600"
                      >
                          ✕
                      </button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                              Cuenta Destino
                          </label>
                          <select
                              value={transferForm.to_account_id}
                              onChange={e => setTransferForm(f => ({ ...f, to_account_id: e.target.value }))}
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-blue-400"
                          >
                              <option value="">-- Seleccionar cuenta --</option>
                              {accounts.map(a => (
                                  <option key={a.id} value={a.id}>
                                      {a.name} — ${(a.current_balance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                  </option>
                              ))}
                          </select>
                      </div>
                      <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                              Monto
                          </label>
                          <div className="flex items-center border border-slate-200 rounded-lg px-3 py-2 focus-within:border-blue-400">
                              <span className="text-sm font-bold text-slate-400 mr-2">$</span>
                              <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={transferForm.amount}
                                  onChange={e => setTransferForm(f => ({ ...f, amount: e.target.value }))}
                                  className="w-full text-sm font-bold text-slate-700 outline-none"
                              />
                          </div>
                      </div>
                      <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                              Referencia (opcional)
                          </label>
                          <input
                              type="text"
                              placeholder="Ej. TRF-001"
                              value={transferForm.reference}
                              onChange={e => setTransferForm(f => ({ ...f, reference: e.target.value }))}
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-blue-400"
                          />
                      </div>
                      <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                              Concepto (opcional)
                          </label>
                          <input
                              type="text"
                              placeholder="Ej. Traspaso para pago de nómina"
                              value={transferForm.description}
                              onChange={e => setTransferForm(f => ({ ...f, description: e.target.value }))}
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:border-blue-400"
                          />
                      </div>
                  </div>
                  <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
                      <button
                          onClick={() => setShowTransferModal(false)}
                          className="px-5 py-2 border border-slate-200 text-slate-500 font-black uppercase text-[10px] rounded-lg hover:bg-slate-50"
                      >
                          Cancelar
                      </button>
                      <button
                          onClick={handleTransfer}
                          disabled={transferring || !transferForm.to_account_id || !transferForm.amount}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[10px] rounded-lg shadow-md disabled:opacity-30"
                      >
                          {transferring ? 'Transfiriendo...' : 'Confirmar Transferencia'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};