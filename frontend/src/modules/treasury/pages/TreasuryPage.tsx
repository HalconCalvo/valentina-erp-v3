import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { treasuryService } from '../../../api/treasury-service';
import { BankAccount } from '../../../types/treasury';
import { BankAccountCard } from '../components/BankAccountCard';
import { CreateAccountModal } from '../components/CreateAccountModal';
import { TransactionModal } from '../components/TransactionModal';
import { AccountDetail } from '../components/AccountDetail';

export const TreasuryPage = () => {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [selectedAccountForDetail, setSelectedAccountForDetail] = useState<BankAccount | null>(null);
  
  // 👇 NUEVO ESTADO: Guarda si apretamos el botón de Ingreso o Egreso
  const [transactionType, setTransactionType] = useState<'IN' | 'OUT'>('IN');

  const fetchAccounts = async () => {
    try {
      setIsLoading(true);
      const data = await treasuryService.getAccounts();
      setAccounts(data || []); 
    } catch (error) {
      console.error('Error al cargar cuentas bancarias', error);
      setAccounts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleCardClick = (account: BankAccount) => {
    setSelectedAccountForDetail(account);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {selectedAccountForDetail ? (
        <AccountDetail 
          account={selectedAccountForDetail} 
          onBack={() => setSelectedAccountForDetail(null)} 
          // 👇 AHORA ATRAPAMOS EL TIPO ('IN' o 'OUT') QUE NOS MANDA EL BOTÓN
          onOpenTransaction={(type) => {
            setTransactionType(type);
            setIsTransactionModalOpen(true);
          }} 
        />
      ) : (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Tesorería y Bancos</h1>
              <p className="text-gray-500">Gestión de cuentas, saldos y movimientos</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <button 
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={20} />
                Nueva Cuenta
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {accounts.map((account) => (
                <BankAccountCard 
                  key={account.id} 
                  account={account} 
                  onClick={handleCardClick} 
                />
              ))}
              
              {accounts.length === 0 && (
                <div className="col-span-full text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <p className="text-gray-500">No hay cuentas bancarias registradas aún.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <CreateAccountModal 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchAccounts}
      />

      <TransactionModal 
        isOpen={isTransactionModalOpen}
        onClose={() => setIsTransactionModalOpen(false)}
        onSuccess={() => {
          fetchAccounts();
          // Si estamos viendo el detalle de una cuenta, actualizamos su saldo localmente
          if (selectedAccountForDetail) {
            treasuryService.getAccounts().then(accs => {
              const updatedAccount = accs.find(a => a.id === selectedAccountForDetail.id);
              if (updatedAccount) setSelectedAccountForDetail(updatedAccount);
            });
          }
        }}
        accounts={accounts}
        selectedAccountId={selectedAccountForDetail?.id}
        // 👇 LE PASAMOS EL TIPO AL MODAL PARA QUE SE AUTO-CONFIGURE
        initialType={transactionType} 
      />
      
    </div>
  );
};