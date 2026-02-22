import React, { useState, useEffect } from 'react';
import { X, Calendar, CreditCard, Hash, FileText, Landmark } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { PaymentMethod, PaymentRequestPayload, SupplierPayment, PendingInvoice } from '../../../types/finance';
import { treasuryService } from '../../../api/treasury-service';
import { BankAccount } from '../../../types/treasury';

interface PaymentRequestModalProps {
    invoice?: PendingInvoice; 
    existingRequest?: SupplierPayment; 
    onClose: () => void;
    onSubmit: (data: PaymentRequestPayload) => Promise<void>;
}

export const PaymentRequestModal: React.FC<PaymentRequestModalProps> = ({ invoice, existingRequest, onClose, onSubmit }) => {
    const [amount, setAmount] = useState<number>(existingRequest ? existingRequest.amount : 0);
    const [displayAmount, setDisplayAmount] = useState<string>('');

    const [date, setDate] = useState<string>(
        existingRequest 
            ? new Date(existingRequest.payment_date).toISOString().split('T')[0] 
            : new Date().toISOString().split('T')[0]
    );
    const [method, setMethod] = useState<PaymentMethod>(existingRequest ? existingRequest.payment_method : 'TRANSFERENCIA');
    
    const [suggestedAccount, setSuggestedAccount] = useState<number | ''>(existingRequest?.suggested_account_id || '');
    const [accounts, setAccounts] = useState<BankAccount[]>([]);

    const [reference, setReference] = useState(existingRequest ? existingRequest.reference || '' : '');
    const [notes, setNotes] = useState(existingRequest ? existingRequest.notes || '' : '');
    const [loading, setLoading] = useState(false);

    // Formateador estricto a 2 decimales con comas
    const formatInitialAmount = (num: number) => {
        if (isNaN(num)) return '';
        const [integerPart, decimalPart] = num.toFixed(2).split('.');
        return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimalPart}`;
    };

    // Controlador de escritura en vivo
    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value;
        
        // 1. Quitar todo lo que no sea número o punto
        val = val.replace(/[^0-9.]/g, '');
        
        // 2. Evitar múltiples puntos
        if ((val.match(/\./g) || []).length > 1) {
            val = val.substring(0, val.lastIndexOf('.'));
        }

        // 3. Limitar a máximo 2 decimales mientras escribe
        if (val.includes('.')) {
            const parts = val.split('.');
            if (parts[1].length > 2) {
                val = `${parts[0]}.${parts[1].substring(0, 2)}`;
            }
        }

        if (val === '') {
            setDisplayAmount('');
            setAmount(0);
            return;
        }

        // Guardar valor real
        const numericValue = parseFloat(val);
        setAmount(isNaN(numericValue) ? 0 : numericValue);

        // Formato visual mientras escribe (sin forzar .00 para permitir escribir decimales)
        const parts = val.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); 
        setDisplayAmount(parts.join('.'));
    };

    // Formatear al salir del input (Blur) para rellenar los centavos faltantes
    const handleBlur = () => {
        if (amount > 0) {
            setDisplayAmount(formatInitialAmount(amount));
        }
    };

    useEffect(() => {
        if (invoice && !existingRequest) {
            setAmount(invoice.outstanding_balance);
            setDisplayAmount(formatInitialAmount(invoice.outstanding_balance));
        } else if (existingRequest) {
            setDisplayAmount(formatInitialAmount(existingRequest.amount));
        }
        
        treasuryService.getAccounts().then(data => setAccounts(data)).catch(console.error);
    }, [invoice, existingRequest]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const maxAmount = existingRequest 
            ? (existingRequest.amount + (invoice?.outstanding_balance || 0)) 
            : (invoice?.outstanding_balance || 0);

        if (amount <= 0) {
            alert("Monto inválido.");
            return;
        }
        
        if (!existingRequest && amount > maxAmount) {
             alert(`Monto inválido. No puede ser mayor al saldo pendiente ($${formatInitialAmount(maxAmount)}).`);
             return;
        }

        setLoading(true);

        const targetInvoiceId = existingRequest 
            ? (existingRequest.purchase_invoice_id || existingRequest.invoice_id) 
            : invoice!.id;

        try {
            await onSubmit({
                invoice_id: targetInvoiceId, 
                amount,
                payment_date: new Date(date).toISOString(),
                payment_method: method,
                suggested_account_id: suggestedAccount ? Number(suggestedAccount) : undefined,
                reference,
                notes
            });
            onClose();
        } catch (error) {
            console.error(error);
            alert("Error al procesar la solicitud.");
        } finally {
            setLoading(false);
        }
    };

    const displayInvoiceNumber = existingRequest ? existingRequest.invoice_folio : (invoice?.invoice_number || 'S/N');
    const displayBalance = invoice ? invoice.outstanding_balance : 0;

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-black text-slate-800">
                            {existingRequest ? 'Editar Solicitud' : 'Solicitar Pago'}
                        </h3>
                        <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide">
                            Factura: {displayInvoiceNumber}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className="block text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Monto a Pagar</label>
                        <div className="relative">
                            {/* AQUÍ ESTÁ LA MAGIA VISUAL: Símbolo de pesos como texto idéntico al input */}
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-2xl text-slate-800 pointer-events-none">
                                $
                            </span>
                            <input 
                                type="text" 
                                className="w-full pl-10 pr-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-black text-2xl text-slate-800 transition-all"
                                value={displayAmount}
                                onChange={handleAmountChange}
                                onBlur={handleBlur}
                                placeholder="0.00"
                            />
                        </div>
                        {!existingRequest && (
                            <p className="text-xs text-right mt-2 font-bold text-slate-400">
                                Saldo de la factura: <span className="text-indigo-600">${formatInitialAmount(displayBalance)}</span>
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Fecha Sugerida</label>
                            <div className="relative">
                                <Calendar size={16} className="absolute left-3 top-2.5 text-slate-400" />
                                <input 
                                    type="date"
                                    className="w-full pl-9 pr-2 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-indigo-500 font-medium text-slate-700"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Método</label>
                            <div className="relative">
                                <CreditCard size={16} className="absolute left-3 top-2.5 text-slate-400" />
                                <select 
                                    className="w-full pl-9 pr-2 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:border-indigo-500 font-medium text-slate-700"
                                    value={method}
                                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                                >
                                    <option value="TRANSFERENCIA">Transferencia</option>
                                    <option value="CHEQUE">Cheque</option>
                                    <option value="EFECTIVO">Efectivo</option>
                                    <option value="TARJETA">Tarjeta</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Cuenta Sugerida (Opcional)</label>
                        <div className="relative">
                            <Landmark size={16} className="absolute left-3 top-2.5 text-slate-400" />
                            <select 
                                className="w-full pl-9 pr-2 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:border-indigo-500 font-medium text-slate-700"
                                value={suggestedAccount}
                                onChange={(e) => setSuggestedAccount(e.target.value ? Number(e.target.value) : '')}
                            >
                                <option value="">Dejar que Dirección decida...</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>
                                        {acc.name} ({acc.currency}) - Saldo: ${acc.current_balance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Referencia / Folio</label>
                            <div className="relative">
                                <Hash size={16} className="absolute left-3 top-2.5 text-slate-400" />
                                <Input 
                                    className="pl-9 text-sm font-medium"
                                    placeholder="Ej. SPEI-123"
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Notas</label>
                            <div className="relative">
                                <FileText size={16} className="absolute left-3 top-2.5 text-slate-400" />
                                <Input 
                                    className="pl-9 text-sm font-medium"
                                    placeholder="Opcional..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3 border-t border-slate-100 mt-4">
                        <Button variant="secondary" onClick={onClose} type="button" className="flex-1 font-bold">
                            Cancelar
                        </Button>
                        <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transform transition hover:scale-105" disabled={loading}>
                            {loading ? 'Guardando...' : (existingRequest ? 'Actualizar Solicitud' : 'Solicitar Autorización')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};