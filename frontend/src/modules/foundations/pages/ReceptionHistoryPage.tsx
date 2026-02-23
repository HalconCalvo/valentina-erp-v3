import React, { useEffect, useState } from 'react';
import { Package, Search, Calendar, FileText, X, Eye, ArrowRight, Plus, Trash2, AlertTriangle, Clock, Archive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { inventoryService, ReceptionListItem, ReceptionFullDetail } from '../../../api/inventory-service';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';

const ReceptionHistoryPage: React.FC = () => {
    const navigate = useNavigate();
    const [receptions, setReceptions] = useState<any[]>([]); // Usamos any temporalmente para aceptar el payment_status
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedReception, setSelectedReception] = useState<ReceptionFullDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    
    // ESTADO PARA LAS PESTAÑAS
    const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY'>('PENDING');

    useEffect(() => {
        loadReceptions();
    }, []);

    const loadReceptions = async () => {
        setLoading(true);
        try {
            const data = await inventoryService.getReceptions();
            setReceptions(data);
        } catch (error) {
            console.error("Error al cargar recepciones", error);
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetail = async (id: number) => {
        setLoadingDetail(true);
        try {
            const data = await inventoryService.getReceptionById(id);
            setSelectedReception(data);
        } catch (error) {
            console.error(error);
            alert("No se pudo cargar el detalle.");
        } finally {
            setLoadingDetail(false);
        }
    };

    const handleCancelReception = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();

        const confirmMessage = "⚠️ ADVERTENCIA CRÍTICA ⚠️\n\n¿Estás completamente seguro de CANCELAR esta factura?\n\nEl sistema hará lo siguiente:\n1. Restará el stock ingresado.\n2. Restaurará el costo unitario a su valor anterior.\n3. Cancelará la cuenta por pagar en Finanzas.\n\nEsta acción es irreversible.";
        
        if (!window.confirm(confirmMessage)) return;

        try {
            await inventoryService.cancelReception(id);
            alert("✅ Factura cancelada y revertida con éxito.");
            loadReceptions(); 
        } catch (error: any) {
            console.error(error);
            alert(error.response?.data?.detail || "❌ Ocurrió un error al intentar cancelar la factura.");
        }
    };

    // --- FILTRO DE PESTAÑAS Y BÚSQUEDA ---
    const filteredReceptions = (receptions || []).filter(r => {
        // 1. Filtro de Pestañas
        if (activeTab === 'PENDING') {
            // En pendientes: Ocultamos las Canceladas y las Pagadas
            if (r.status === 'CANCELLED' || r.payment_status === 'PAID') return false;
        } else {
            // En Historial General: Queremos ver todo (incluso canceladas, pero las tacharemos visualmente)
        }

        // 2. Filtro de Búsqueda (Texto)
        const provider = r?.provider_name || '';
        const invoice = r?.invoice_number || '';
        return provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
               invoice.toLowerCase().includes(searchTerm.toLowerCase());
    });

    const formatCurrency = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fadeIn pb-24">
            
            <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
                        <Package className="text-indigo-600" /> Almacén: Entradas
                    </h1>
                    <p className="text-slate-500 mt-1">Mesa de control de facturas y recepciones.</p>
                </div>
                <Button 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transform transition hover:scale-105"
                    onClick={() => navigate('/inventory/reception')}
                >
                    <Plus size={18} className="mr-2"/> Registrar Entrada
                </Button>
            </div>

            {/* PESTAÑAS Y BÚSQUEDA EN LA MISMA FILA */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                
                {/* PESTAÑAS */}
                <div className="flex bg-slate-100 p-1 rounded-lg w-fit">
                    <button 
                        onClick={() => setActiveTab('PENDING')} 
                        className={`px-4 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${activeTab === 'PENDING' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Clock size={16}/> Activas / Por Pagar
                    </button>
                    <button 
                        onClick={() => setActiveTab('HISTORY')} 
                        className={`px-4 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${activeTab === 'HISTORY' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Archive size={16}/> Historial General
                    </button>
                </div>

                {/* BÚSQUEDA */}
                <div className="flex gap-4 items-center bg-white p-2 rounded-lg border border-slate-200 shadow-sm w-full md:w-96">
                    <Search className="text-slate-400 ml-2" size={20}/>
                    <input 
                        type="text" 
                        placeholder="Buscar proveedor o factura..." 
                        className="flex-1 outline-none text-sm font-medium text-slate-600 w-full"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <Card className="overflow-hidden bg-white shadow-sm border border-slate-200 min-h-[400px]">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Proveedor</th>
                                <th className="px-6 py-4">Factura</th>
                                <th className="px-6 py-4 text-center">Estatus Pago</th>
                                <th className="px-6 py-4 text-right">Importe Total</th>
                                <th className="px-6 py-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={6} className="p-12 text-center text-slate-400">Cargando datos...</td></tr>
                            ) : filteredReceptions.length === 0 ? (
                                <tr><td colSpan={6} className="p-12 text-center text-slate-400 italic">No se encontraron recepciones en esta vista.</td></tr>
                            ) : filteredReceptions.map((rec) => {
                                const isCancelled = rec.status === 'CANCELLED';
                                const isPaid = rec.payment_status === 'PAID';

                                return (
                                    <tr key={rec.id} className={`transition-colors ${isCancelled ? 'bg-red-50/20' : 'hover:bg-slate-50'}`}>
                                        <td className="px-6 py-4 text-slate-600 flex items-center gap-2">
                                            <Calendar size={14} className="text-slate-400"/> {formatDate(rec.created_at)}
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-800">
                                            <div className="flex flex-col">
                                                <span className={isCancelled ? 'line-through text-slate-400' : ''}>{rec.provider_name}</span>
                                                {isCancelled && <span className="text-[10px] text-red-500 font-bold flex items-center gap-1 mt-0.5"><AlertTriangle size={10}/> FACTURA CANCELADA</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-slate-600">
                                            <span className={`px-2 py-1 rounded ${isCancelled ? 'bg-transparent text-slate-400 line-through' : 'bg-slate-100/50'}`}>
                                                {rec.invoice_number}
                                            </span>
                                        </td>
                                        
                                        {/* NUEVA COLUMNA: ESTATUS DE PAGO */}
                                        <td className="px-6 py-4 text-center">
                                            {!isCancelled && (
                                                isPaid ? (
                                                    <span className="bg-teal-100 text-teal-800 text-[10px] font-bold px-2 py-1 rounded-full uppercase">Pagada</span>
                                                ) : (
                                                    <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-1 rounded-full uppercase">Por Pagar</span>
                                                )
                                            )}
                                        </td>

                                        <td className={`px-6 py-4 text-right font-black ${isCancelled ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                            {formatCurrency(rec.total_amount)}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <Button size="sm" variant="secondary" onClick={() => handleViewDetail(rec.id)} disabled={loadingDetail}>
                                                    <Eye size={16} className="mr-1"/> Ver
                                                </Button>
                                                
                                                {/* REGLA ESTRICTA: Solo aparece en la pestaña PENDING y si no está cancelada */}
                                                {activeTab === 'PENDING' && !isCancelled && !isPaid && (
                                                    <button 
                                                        onClick={(e) => handleCancelReception(rec.id, e)}
                                                        className="p-2 text-slate-400 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors"
                                                        title="Cancelar y Revertir Factura"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* MODAL DETALLE DE FACTURA (TICKET) - Se mantiene igual */}
            {selectedReception && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[95vh]">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
                            <div>
                                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                    <FileText className="text-indigo-600"/> Detalle de Factura: <span className="font-mono text-indigo-700">{selectedReception.invoice_number}</span>
                                </h2>
                                <p className="text-sm text-slate-500 font-bold mt-1">{selectedReception.provider_name}</p>
                            </div>
                            <button onClick={() => setSelectedReception(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <X size={20} className="text-slate-500"/>
                            </button>
                        </div>
                        <div className="p-4 bg-white border-b border-slate-100 grid grid-cols-2 gap-4 flex-shrink-0 text-sm">
                            <div>
                                <p className="text-xs text-slate-400 font-bold uppercase">Fecha de Factura</p>
                                <p className="font-bold text-slate-700">{formatDate(selectedReception.invoice_date)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 font-bold uppercase">Fecha de Recepción Sistema</p>
                                <p className="font-bold text-slate-700">{formatDate(selectedReception.created_at || new Date().toISOString())}</p>
                            </div>
                            {selectedReception.notes && (
                                <div className="col-span-2 bg-amber-50 text-amber-800 text-xs p-2 rounded border border-amber-200">
                                    <strong>Notas:</strong> {selectedReception.notes}
                                </div>
                            )}
                        </div>
                        <div className="overflow-y-auto flex-1 bg-slate-50 p-4">
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-100 text-slate-500 font-bold text-[10px] uppercase border-b border-slate-200 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3">SKU / Artículo</th>
                                            <th className="px-4 py-3">Categoría</th>
                                            <th className="px-4 py-3 text-center">Unidad Compra</th>
                                            <th className="px-4 py-3 text-center">Unidad Uso (Stock)</th>
                                            <th className="px-4 py-3 text-right">Costo Unit. (Base)</th>
                                            <th className="px-4 py-3 text-right">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {selectedReception.items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-2">
                                                    <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                                                    <div className="text-xs text-slate-400 font-mono">{item.sku}</div>
                                                </td>
                                                <td className="px-4 py-2"><Badge variant="outline" className="text-xs">{item.category}</Badge></td>
                                                <td className="px-4 py-2 text-center">
                                                    <div className="font-bold text-slate-700">{item.purchase_quantity.toFixed(2)}</div>
                                                    <div className="text-[10px] text-slate-400 uppercase">{item.purchase_unit}</div>
                                                </td>
                                                <td className="px-4 py-2 text-center bg-indigo-50/30 border-l border-r border-slate-100">
                                                    <div className="font-bold text-indigo-700 flex justify-center items-center gap-1">
                                                        <ArrowRight size={12} className="text-slate-300"/> {item.usage_quantity.toFixed(2)}
                                                    </div>
                                                    <div className="text-[10px] text-indigo-400 uppercase">{item.usage_unit} (1:{item.conversion_factor})</div>
                                                </td>
                                                <td className="px-4 py-2 text-right text-slate-600">{formatCurrency(item.unit_cost)}</td>
                                                <td className="px-4 py-2 text-right font-bold text-slate-800">{formatCurrency(item.subtotal)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="bg-slate-50 border-t border-slate-200 p-4 flex justify-end">
                                    {(() => {
                                        const capturedSubtotal = selectedReception.items.reduce((sum, item) => sum + item.subtotal, 0);
                                        const capturedIvaOrDiff = selectedReception.total_amount - capturedSubtotal;

                                        return (
                                            <div className="w-1/3 min-w-[230px] space-y-1 text-sm">
                                                <div className="flex justify-between items-center text-slate-500">
                                                    <span className="text-xs font-bold uppercase tracking-wider">Subtotal Capturado:</span>
                                                    <span className="font-medium">{formatCurrency(capturedSubtotal)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-slate-500 pb-2">
                                                    <span className="text-xs font-bold uppercase tracking-wider">IVA / Diferencia:</span>
                                                    <span className="font-medium">{formatCurrency(capturedIvaOrDiff)}</span>
                                                </div>
                                                <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold text-indigo-600">
                                                    <span className="text-xs uppercase tracking-wider">Total Factura:</span>
                                                    <span>{formatCurrency(selectedReception.total_amount)}</span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReceptionHistoryPage;