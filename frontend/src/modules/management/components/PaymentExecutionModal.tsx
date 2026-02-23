import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, DollarSign, Landmark, ArrowRight, AlertTriangle, Undo2 } from 'lucide-react';
import { financeService } from '../../../api/finance-service';
import { treasuryService } from '../../../api/treasury-service';
import { SupplierPayment } from '../../../types/finance';
import { BankAccount } from '../../../types/treasury';
import Button from '../../../components/ui/Button';

interface PaymentExecutionModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export const PaymentExecutionModal: React.FC<PaymentExecutionModalProps> = ({ onClose, onSuccess }) => {
    // --- SEGURIDAD: Leer el Rol ---
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const isDirector = ['ADMIN', 'ADMINISTRADOR', 'DIRECTOR', 'DIRECCION', 'DIRECTION'].includes(userRole);

    const [approvedPayments, setApprovedPayments] = useState<SupplierPayment[]>([]);
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<number | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [paymentsData, accountsData] = await Promise.all([
                financeService.getApprovedPayments(),
                treasuryService.getAccounts()
            ]);
            setApprovedPayments(paymentsData);
            setAccounts(accountsData);
        } catch (error) {
            console.error("Error cargando pagos aprobados:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleExecute = async (paymentId: number) => {
        if (!confirm("¿Confirma que ya realizó la transferencia en el portal bancario y desea ejecutar este pago en el sistema?")) return;

        setProcessingId(paymentId);
        try {
            await financeService.executePayment(paymentId);
            alert("✅ Pago ejecutado y descontado de Tesorería exitosamente.");
            
            // Refrescar lista local
            const remaining = approvedPayments.filter(p => p.id !== paymentId);
            setApprovedPayments(remaining);
            
            if (remaining.length === 0) {
                onSuccess(); // Cerrar si ya no hay más pagos
            }
        } catch (error) {
            console.error(error);
            alert("❌ Error al ejecutar el pago.");
        } finally {
            setProcessingId(null);
        }
    };

    // NUEVA FUNCIÓN: Revocar autorización (Solo Dirección)
    const handleRevoke = async (paymentId: number) => {
        if (!confirm("⚠️ ¿Estás seguro de cancelar esta autorización? El pago regresará a estatus 'Pendiente' y Finanzas no podrá ejecutarlo.")) return;

        setProcessingId(paymentId);
        try {
            // Reutilizamos el endpoint de status para regresarlo a PENDING
            await financeService.updatePaymentStatus(paymentId, 'PENDING');
            alert("✅ Autorización revocada. El pago ha regresado a la bandeja de pendientes.");
            
            // Refrescar lista local
            const remaining = approvedPayments.filter(p => p.id !== paymentId);
            setApprovedPayments(remaining);
            
            if (remaining.length === 0) {
                onSuccess(); 
            }
        } catch (error) {
            console.error(error);
            alert("❌ Error al revocar la autorización. Revise su conexión.");
        } finally {
            setProcessingId(null);
        }
    };

    const getAccountDetails = (accountId?: number) => {
        if (!accountId) return { name: 'Cuenta No Asignada', balance: 0 };
        const acc = accounts.find(a => a.id === accountId);
        return acc ? { name: acc.name, balance: acc.current_balance } : { name: 'Cuenta Desconocida', balance: 0 };
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-black text-emerald-700 flex items-center gap-2">
                            <CheckCircle2 className="text-emerald-500"/> Ejecución de Pagos Autorizados
                        </h2>
                        <p className="text-sm text-slate-500">Registre los pagos ya dispersados para descontarlos de Tesorería.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} className="text-slate-500"/>
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto p-6 bg-slate-50/50 flex-1">
                    {loading ? (
                        <div className="text-center py-10 text-slate-400">Cargando pagos listos...</div>
                    ) : approvedPayments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <CheckCircle2 className="w-16 h-16 text-emerald-200 mb-4"/>
                            <p className="font-medium text-lg text-slate-600">No hay pagos pendientes de ejecución.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {approvedPayments.map((payment) => {
                                const account = getAccountDetails(payment.approved_account_id);
                                const hasFunds = account.balance >= payment.amount;

                                return (
                                    <div key={payment.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row justify-between items-start gap-4">
                                        
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 uppercase">
                                                    AUTORIZADO
                                                </span>
                                                <span className="text-xs text-slate-400 font-mono">Folio: {payment.invoice_folio}</span>
                                            </div>
                                            <h3 className="text-lg font-bold text-slate-800">{payment.provider_name}</h3>
                                            
                                            {/* Info de la cuenta dictaminada por Dirección */}
                                            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Landmark size={18} className="text-slate-400"/>
                                                    <div>
                                                        <p className="text-xs text-slate-500 font-bold uppercase">Cuenta Origen (Asignada por Dir.)</p>
                                                        <p className="font-medium text-slate-700">{account.name}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-slate-500 font-bold uppercase">Saldo en Cuenta</p>
                                                    <p className={`font-bold ${hasFunds ? 'text-slate-700' : 'text-red-600'}`}>
                                                        ${account.balance.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                                                    </p>
                                                </div>
                                            </div>

                                            {!hasFunds && (
                                                <p className="text-xs text-red-600 mt-2 flex items-center gap-1 font-bold">
                                                    <AlertTriangle size={12}/> La cuenta no tiene fondos suficientes para este pago.
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex flex-col items-end gap-2 w-full md:w-auto md:border-l md:border-slate-100 md:pl-6">
                                            <div className="text-right mb-1">
                                                <div className="text-xs text-slate-400 font-bold uppercase">A Transferir</div>
                                                <div className="text-3xl font-black text-slate-800">
                                                    ${payment.amount.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                                                </div>
                                            </div>
                                            
                                            <Button 
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                                                onClick={() => handleExecute(payment.id)}
                                                disabled={processingId === payment.id || !hasFunds}
                                            >
                                                {processingId === payment.id ? 'Ejecutando...' : (
                                                    <><DollarSign size={16} className="mr-1"/> Aplicar Salida</>
                                                )}
                                            </Button>

                                            {/* BOTÓN EXCLUSIVO DE DIRECCIÓN PARA REVOCAR */}
                                            {isDirector && (
                                                <button 
                                                    onClick={() => handleRevoke(payment.id)}
                                                    disabled={processingId === payment.id}
                                                    className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 mt-2 transition-colors disabled:opacity-50"
                                                    title="Regresar a Pendiente de Autorización"
                                                >
                                                    <Undo2 size={12}/> Revocar Autorización
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="bg-white p-4 border-t border-slate-100 flex justify-end">
                    <Button variant="secondary" onClick={onClose}>Cerrar</Button>
                </div>
            </div>
        </div>
    );
};