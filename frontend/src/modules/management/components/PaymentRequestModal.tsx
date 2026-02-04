import React, { useState, useEffect } from 'react';
import { X, DollarSign, Calendar, CreditCard, Hash, FileText } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { PaymentMethod, PaymentRequestPayload, SupplierPayment, PendingInvoice } from '../../../types/finance';

interface PaymentRequestModalProps {
    invoice?: PendingInvoice; // Para crear nueva
    existingRequest?: SupplierPayment; // Para editar existente
    onClose: () => void;
    onSubmit: (data: PaymentRequestPayload) => Promise<void>;
}

export const PaymentRequestModal: React.FC<PaymentRequestModalProps> = ({ invoice, existingRequest, onClose, onSubmit }) => {
    // Inicialización inteligente basada en si editamos o creamos
    const [amount, setAmount] = useState<number>(existingRequest ? existingRequest.amount : 0);
    const [date, setDate] = useState<string>(
        existingRequest 
            ? new Date(existingRequest.payment_date).toISOString().split('T')[0] 
            : new Date().toISOString().split('T')[0]
    );
    const [method, setMethod] = useState<PaymentMethod>(existingRequest ? existingRequest.payment_method : 'TRANSFERENCIA');
    const [reference, setReference] = useState(existingRequest ? existingRequest.reference || '' : '');
    const [notes, setNotes] = useState(existingRequest ? existingRequest.notes || '' : '');
    const [loading, setLoading] = useState(false);

    // Al abrir en modo creación, sugerimos pagar TODO lo que se debe
    useEffect(() => {
        if (invoice && !existingRequest) {
            setAmount(invoice.outstanding_balance);
        }
    }, [invoice, existingRequest]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validación de monto máximo
        const maxAmount = existingRequest 
            ? (existingRequest.amount + (invoice?.outstanding_balance || 0)) // Si edita, el límite es lo que ya pidió + lo que falta
            : (invoice?.outstanding_balance || 0);

        if (amount <= 0) {
            alert("Monto inválido.");
            return;
        }
        
        // En edición relajamos la validación estricta del saldo visual porque el dato de invoice puede no venir completo
        if (!existingRequest && amount > maxAmount) {
             alert(`Monto inválido. No puede ser mayor al saldo pendiente ($${maxAmount}).`);
             return;
        }

        setLoading(true);

        // CORRECCIÓN CLAVE AQUÍ ABAJO:
        // El objeto de lectura suele traer 'purchase_invoice_id', pero para escribir necesitamos 'invoice_id'.
        // Usamos una comprobación segura.
        const targetInvoiceId = existingRequest 
            ? (existingRequest.purchase_invoice_id || existingRequest.invoice_id) 
            : invoice!.id;

        try {
            await onSubmit({
                invoice_id: targetInvoiceId, // <--- Aquí estaba el error
                amount,
                payment_date: new Date(date).toISOString(),
                payment_method: method,
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">
                            {existingRequest ? 'Editar Solicitud' : 'Solicitar Pago'}
                        </h3>
                        <p className="text-xs text-slate-500">
                            Factura: {displayInvoiceNumber}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    
                    {/* Monto */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Monto a Pagar</label>
                        <div className="relative">
                            <DollarSign size={16} className="absolute left-3 top-3 text-slate-400" />
                            <input 
                                type="number" 
                                step="0.01"
                                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono text-lg font-bold text-slate-700"
                                value={amount}
                                onChange={(e) => setAmount(parseFloat(e.target.value))}
                            />
                        </div>
                        {!existingRequest && (
                            <p className="text-[10px] text-right mt-1 text-slate-400">
                                Saldo pendiente: <span className="font-bold text-red-500">${displayBalance.toLocaleString('es-MX')}</span>
                            </p>
                        )}
                    </div>

                    {/* Fecha y Método */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Fecha Pago</label>
                            <div className="relative">
                                <Calendar size={16} className="absolute left-3 top-3 text-slate-400" />
                                <input 
                                    type="date"
                                    className="w-full pl-9 pr-2 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-indigo-500"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Método</label>
                            <div className="relative">
                                <CreditCard size={16} className="absolute left-3 top-3 text-slate-400" />
                                <select 
                                    className="w-full pl-9 pr-2 py-2 border border-slate-300 rounded-lg text-sm bg-white outline-none focus:border-indigo-500"
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

                    {/* Referencia */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Referencia / Folio</label>
                        <div className="relative">
                            <Hash size={16} className="absolute left-3 top-3 text-slate-400" />
                            <Input 
                                className="pl-9"
                                placeholder="Ej. SPEI-123456"
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Notas */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Notas Internas</label>
                        <div className="relative">
                            <FileText size={16} className="absolute left-3 top-3 text-slate-400" />
                            <Input 
                                className="pl-9"
                                placeholder="Opcional..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-4 flex gap-3">
                        <Button variant="secondary" onClick={onClose} type="button" className="flex-1">
                            Cancelar
                        </Button>
                        <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading}>
                            {loading ? 'Guardando...' : (existingRequest ? 'Actualizar Solicitud' : 'Solicitar Autorización')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};