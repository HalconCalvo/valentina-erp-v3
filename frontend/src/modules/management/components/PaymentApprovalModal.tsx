import React, { useEffect, useState } from 'react';
import { X, Check, Ban, AlertCircle, FileText, Calendar } from 'lucide-react';
import { financeService } from '../../../api/finance-service';
import { SupplierPayment } from '../../../types/finance';
import Button from '../../../components/ui/Button';

interface PaymentApprovalModalProps {
    onClose: () => void;
    onUpdate: () => void; // Para recargar los KPIs del dashboard al cerrar
}

export const PaymentApprovalModal: React.FC<PaymentApprovalModalProps> = ({ onClose, onUpdate }) => {
    const [requests, setRequests] = useState<SupplierPayment[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<number | null>(null);

    // Cargar solicitudes pendientes
    useEffect(() => {
        loadRequests();
    }, []);

    const loadRequests = async () => {
        try {
            const data = await financeService.getPendingApprovals();
            setRequests(data);
        } catch (error) {
            console.error("Error cargando solicitudes:", error);
        } finally {
            setLoading(false);
        }
    };

    // Manejar Aprobación / Rechazo
    const handleDecision = async (id: number, decision: 'APPROVED' | 'REJECTED') => {
        if (!confirm(`¿Estás seguro de ${decision === 'APPROVED' ? 'AUTORIZAR' : 'RECHAZAR'} este pago?`)) return;

        setProcessingId(id);
        try {
            await financeService.updatePaymentStatus(id, decision);
            // Remover de la lista localmente para agilidad visual
            setRequests(prev => prev.filter(req => req.id !== id));
            if (requests.length === 1) {
                // Si era la última, cerramos y actualizamos
                onUpdate();
                onClose();
            }
        } catch (error) {
            alert("Error al procesar la solicitud.");
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            <FileText className="text-indigo-600"/> Firmas Pendientes
                        </h2>
                        <p className="text-sm text-slate-500">Autorización de egresos solicitados por Gerencia.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} className="text-slate-500"/>
                    </button>
                </div>

                {/* Body: Lista de Solicitudes */}
                <div className="overflow-y-auto p-6 bg-slate-50/50 flex-1">
                    {loading ? (
                        <div className="text-center py-10 text-slate-400">Cargando solicitudes...</div>
                    ) : requests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                            <Check className="w-16 h-16 text-emerald-200 mb-4"/>
                            <p className="font-medium text-lg text-slate-600">¡Todo al día!</p>
                            <p className="text-sm">No hay pagos pendientes de firma.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {requests.map((req) => (
                                <div key={req.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    
                                    {/* Info Izquierda */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-100 uppercase tracking-wide">
                                                {req.payment_method}
                                            </span>
                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                                <Calendar size={10}/> Solicitado el {new Date(req.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-800">{req.provider_name}</h3>
                                        <p className="text-sm text-slate-500">
                                            Factura: <span className="font-mono text-slate-700">{req.invoice_folio}</span>
                                            {req.reference && ` • Ref: ${req.reference}`}
                                        </p>
                                        {req.notes && (
                                            <div className="mt-2 text-xs bg-amber-50 text-amber-800 p-2 rounded border border-amber-100 flex items-start gap-2">
                                                <AlertCircle size={12} className="mt-0.5 shrink-0"/>
                                                {req.notes}
                                            </div>
                                        )}
                                    </div>

                                    {/* Info Derecha & Acciones */}
                                    <div className="flex flex-col items-end gap-3 w-full md:w-auto">
                                        <div className="text-right">
                                            <div className="text-xs text-slate-400 font-bold uppercase">Monto a Pagar</div>
                                            <div className="text-2xl font-black text-slate-800">
                                                ${req.amount.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                                            </div>
                                        </div>
                                        
                                        <div className="flex gap-2 w-full md:w-auto">
                                            <Button 
                                                variant="danger" 
                                                size="sm"
                                                onClick={() => handleDecision(req.id, 'REJECTED')}
                                                disabled={processingId === req.id}
                                                className="flex-1 md:flex-none"
                                            >
                                                <Ban size={16} className="mr-1"/> Rechazar
                                            </Button>
                                            <Button 
                                                size="sm"
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1 md:flex-none"
                                                onClick={() => handleDecision(req.id, 'APPROVED')}
                                                disabled={processingId === req.id}
                                            >
                                                {processingId === req.id ? 'Procesando...' : (
                                                    <><Check size={16} className="mr-1"/> Autorizar Pago</>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-white p-4 border-t border-slate-100 flex justify-end">
                    <Button variant="secondary" onClick={onClose}>Cerrar</Button>
                </div>
            </div>
        </div>
    );
};