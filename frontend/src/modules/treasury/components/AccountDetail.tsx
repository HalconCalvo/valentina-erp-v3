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

  useEffect(() => {
    fetchTransactions();
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
            onClick={() => alert("¡Transferencias en construcción!")}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 font-medium transition-colors"
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
    </div>
  );
};