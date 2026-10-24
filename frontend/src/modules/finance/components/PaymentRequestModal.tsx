import React, { useState, useEffect } from 'react';
import { Calendar, CreditCard, Hash, FileText, Landmark, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { toast } from '@/components/ui/VToast';
import { PaymentMethod, PaymentRequestPayload, SupplierPayment, PendingInvoice } from '../../../types/finance';
import { treasuryService } from '../../../api/treasury-service';
import { BankAccount } from '../../../types/treasury';
import { formatDate, formatMoney, businessToday, toBusinessYmd } from '@/utils/format';
import Modal from '@/components/ui/Modal';
import { ModalFooter } from '@/components/ui/ModalFooter';

interface PaymentRequestModalProps {
    invoice?: PendingInvoice; 
    existingRequest?: SupplierPayment; 
    onClose: () => void;
    onSubmit: (data: PaymentRequestPayload) => Promise<void>;
    isChecker?: boolean; // <--- LA CREDENCIAL DE GERENCIA
}

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
    { value: 'TRANSFER', label: 'Transferencia' },
    { value: 'CHECK', label: 'Cheque' },
    { value: 'CASH', label: 'Efectivo' },
    { value: 'CREDIT_CARD', label: 'Tarjeta' },
    { value: 'OTHER', label: 'Otro' },
];

export const PaymentRequestModal: React.FC<PaymentRequestModalProps> = ({ invoice, existingRequest, onClose, onSubmit, isChecker }) => {
    const [amount, setAmount] = useState<number>(existingRequest ? existingRequest.amount : 0);
    const [displayAmount, setDisplayAmount] = useState<string>('');

    const [date, setDate] = useState<string>(
        existingRequest 
            ? toBusinessYmd(existingRequest.payment_date)
            : businessToday()
    );
    const [method, setMethod] = useState<PaymentMethod>(existingRequest ? existingRequest.payment_method : 'TRANSFER');
    
    const [suggestedAccount, setSuggestedAccount] = useState<number | ''>(existingRequest?.suggested_account_id || '');
    const [accounts, setAccounts] = useState<BankAccount[]>([]);

    const [reference, setReference] = useState(existingRequest ? existingRequest.reference || '' : '');
    const [notes, setNotes] = useState(existingRequest ? existingRequest.notes || '' : '');
    const [loading, setLoading] = useState(false);

    const formatInitialAmount = (num: number) => {
        if (isNaN(num)) return '';
        const [integerPart, decimalPart] = num.toFixed(2).split('.');
        return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimalPart}`;
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value;
        val = val.replace(/[^0-9.]/g, '');
        if ((val.match(/\./g) || []).length > 1) {
            val = val.substring(0, val.lastIndexOf('.'));
        }
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
        const numericValue = parseFloat(val);
        setAmount(isNaN(numericValue) ? 0 : numericValue);
        const parts = val.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); 
        setDisplayAmount(parts.join('.'));
    };

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
        
        treasuryService.getAccounts()
            .then(data => setAccounts(data))
            .catch(() => toast.error('No se pudieron cargar las cuentas bancarias.'));
    }, [invoice, existingRequest]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const maxAmount = existingRequest 
            ? (existingRequest.amount + (invoice?.outstanding_balance || 0)) 
            : (invoice?.outstanding_balance || 0);

        if (amount <= 0) {
            toast.warning('Monto inválido.');
            return;
        }
        
        if (!existingRequest && amount > maxAmount) {
             toast.warning(`Monto inválido. No puede ser mayor al saldo pendiente ($${formatInitialAmount(maxAmount)}).`);
             return;
        }

        if (isChecker && !existingRequest && !suggestedAccount) {
            toast.warning('Para efectuar el pago directo, debes seleccionar de qué cuenta bancaria saldrá el dinero.');
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
                payment_date: date,
                payment_method: method,
                suggested_account_id: suggestedAccount ? Number(suggestedAccount) : undefined,
                reference,
                notes
            });
            onClose();
        } catch (error: any) {
            toast.error(error?.response?.data?.detail || 'Error al procesar la solicitud.');
        } finally {
            setLoading(false);
        }
    };

    const displayInvoiceNumber = existingRequest ? existingRequest.invoice_folio : (invoice?.invoice_number || 'S/N');
    const displayBalance = invoice ? invoice.outstanding_balance : 0;

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="sm"
            title={existingRequest ? 'Editar solicitud' : (isChecker ? 'Pago directo' : 'Solicitar autorización')}
            subtitle={`Factura ${displayInvoiceNumber}`}
            footer={(
                <ModalFooter
                    onCancel={onClose}
                    form="payment-request"
                    confirmLabel={existingRequest ? 'Actualizar solicitud' : (isChecker ? 'Efectuar pago' : 'Solicitar autorización')}
                    busy={loading}
                    tone={isChecker && !existingRequest ? 'success' : 'primary'}
                />
            )}
        >
                <form id="payment-request" onSubmit={handleSubmit} className="space-y-5">
                    {invoice && (invoice.po_folio && invoice.po_authorizer_name ? (
                        <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                            <ShieldCheck size={14} />
                            {invoice.po_folio} autorizada por {invoice.po_authorizer_name}
                            {invoice.po_authorized_at ? ` el ${formatDate(invoice.po_authorized_at)}` : ''}
                        </p>
                    ) : (
                        <p className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <ShieldAlert size={14} /> OC sin autorización registrada
                        </p>
                    ))}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className="block text-xs font-bold text-slate-500 mb-2">Monto a pagar</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-2xl text-slate-800 pointer-events-none">
                                $
                            </span>
                            <Input
                                type="text"
                                className="w-full pl-10 pr-4 py-2 font-black text-2xl text-slate-800 tabular-nums"
                                value={displayAmount}
                                onChange={handleAmountChange}
                                onBlur={handleBlur}
                                placeholder="0.00"
                            />
                        </div>
                        {!existingRequest && (
                            <p className="text-xs text-right mt-2 font-bold text-slate-400">
                                Saldo de la factura: <span className="text-slate-700 tabular-nums">${formatInitialAmount(displayBalance)}</span>
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Fecha de pago</label>
                            <div className="relative">
                                <Calendar size={16} className="absolute left-3 top-2.5 text-slate-400" />
                                <Input
                                    type="date"
                                    className="pl-9 text-sm font-medium text-slate-700"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Método</label>
                            <div className="relative">
                                <CreditCard size={16} className="absolute left-3 top-2.5 text-slate-400" />
                                <SearchableSelect
                                    items={PAYMENT_METHOD_OPTIONS}
                                    value={method}
                                    onChange={(value) => setMethod(value as PaymentMethod)}
                                    getLabel={(option) => option.label}
                                    getValue={(option) => option.value}
                                    placeholder="Seleccionar método"
                                    className="pl-9 text-sm font-medium text-slate-700"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        {/* ---> CAMPO DE CUENTA DINÁMICO <--- */}
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                            {isChecker ? 'Cuenta bancaria de origen' : 'Cuenta sugerida (opcional)'}
                        </label>
                        <div className="relative">
                            <Landmark size={16} className="absolute left-3 top-2.5 text-slate-400" />
                            <SearchableSelect
                                items={accounts}
                                value={suggestedAccount ? String(suggestedAccount) : ''}
                                onChange={(value) => setSuggestedAccount(value ? Number(value) : '')}
                                getLabel={(acc) => `${acc.name} (${acc.currency}) - Saldo: ${formatMoney(acc.current_balance)}`}
                                getValue={(acc) => String(acc.id)}
                                placeholder={isChecker ? 'Selecciona una cuenta...' : 'Dejar que Dirección decida...'}
                                className="pl-9 text-sm font-medium text-slate-700"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Referencia o folio</label>
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

                </form>
            </Modal>
    );
};