import React, { useState, useEffect } from 'react';
import { PackageCheck, X } from 'lucide-react';
import { PendingInvoice } from '../../../types/finance';
import client from '../../../api/axios-client';

interface InvoiceDetailModalProps {
    invoice: PendingInvoice;
    onClose: () => void;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({ invoice, onClose }) => {
    const [items, setItems] = useState<any[]>(invoice.items || []);
    const [isLoading, setIsLoading] = useState(!invoice.items || invoice.items.length === 0);

    useEffect(() => {
        const fetchItems = async () => {
            try {
                // 0. CAMINO B (prioridad): detalle RECEPCIONADO real de la factura.
                //    Si trae renglones, mapeamos a los nombres que el render ya espera
                //    (quantity / unit_price / description / sku) y usamos esos.
                try {
                    const recRes = await client.get(`/finance/invoices/${invoice.id}/received-items`);
                    const received = Array.isArray(recRes.data) ? recRes.data : [];
                    if (received.length > 0) {
                        const mapped = received.map((row: any) => ({
                            quantity: row.quantity_received,
                            unit_price: row.unit_cost,
                            description: row.description,
                            sku: row.sku,
                        }));
                        setItems(mapped);
                        setIsLoading(false);
                        return;
                    }
                } catch (e) {
                    // Silencioso: si falla, caemos al comportamiento ACTUAL (fallback OC).
                }

                // FALLBACK (factura vieja sin desglose Camino B): comportamiento original.
                if (invoice.items && invoice.items.length > 0) {
                    setIsLoading(false);
                    return;
                }
                let fetchedItems: any[] = [];
                
                // 1. Intentamos la ruta normal de Finanzas
                try {
                    const finRes = await client.get(`/finance/payables/${invoice.id}`);
                    fetchedItems = finRes.data.items || finRes.data.details || finRes.data.products || [];
                } catch (e) {
                    // Silencioso, pasamos al plan B si falla
                }

                // 2. EL PUENTE: Si Finanzas no tiene los items, buscamos en Compras
                const folioABuscar = invoice.po_folio || invoice.invoice_number || '';
                
                // Limpiador automático por si el backend mandó prefijos duplicados
                const cleanFolio = folioABuscar.replace('OC-OC-', 'OC-').replace('COT-COT-', 'COT-');

                if (fetchedItems.length === 0 && (cleanFolio.includes('OC') || cleanFolio.includes('COT'))) {
                    const comprasRes = await client.get('/purchases/orders/');
                    const todasLasOrdenes = comprasRes.data || [];
                    
                    const miOrden = todasLasOrdenes.find((o: any) => 
                        String(o.folio) === cleanFolio || 
                        String(o.invoice_number) === cleanFolio ||
                        cleanFolio.includes(String(o.folio))
                    );
                    
                    if (miOrden && miOrden.items) {
                        fetchedItems = miOrden.items;
                    }
                }

                setItems(fetchedItems);
            } catch (error) {
                console.error("Error al cargar el desglose del documento:", error);
                setItems([]); 
            } finally {
                setIsLoading(false);
            }
        };

        fetchItems();
    }, [invoice]);

    // Cierre A: el pie refleja el SALDO VIVO de la factura (= cascada de CxP), no la suma del desglose.
    const displayTotal = invoice.outstanding_balance || 0;
    const displaySubtotal = displayTotal / 1.16;
    const displayIva = displaySubtotal * 0.16;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            {/* EL CLON EXACTO DE LA TARJETA "POR ENVIAR" DE COMPRAS */}
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden border-t-8 border-t-emerald-500 flex flex-col max-h-[90vh]">
                
                {/* CABECERA CLONADA */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50/30">
                    <div className="flex items-center gap-5">
                        <div className="p-3 rounded-2xl shadow-inner bg-emerald-100 text-emerald-600">
                            <PackageCheck size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 uppercase leading-none">{invoice.provider_name}</h3>
                            <p className="text-[9px] font-black uppercase text-emerald-600 mt-1 tracking-widest leading-none">
                                DOCUMENTO: {invoice.po_folio || invoice.invoice_number}
                            </p>
                            {/* AQUÍ ESTÁ EL CAMBIO: Fecha de tamaño sm pero con su color original */}
                            <p className="text-sm font-black uppercase text-slate-500 mt-1.5 tracking-tight leading-none">
                                VENCIMIENTO: {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('es-MX') : 'INMEDIATO'}
                            </p>
                            {(invoice as any).authorized_by && (
                                <p className="text-[9px] font-black uppercase text-indigo-600 mt-1 tracking-widest leading-none flex items-center gap-1">
                                    ✅ AUTORIZÓ: {(invoice as any).authorized_by}
                                </p>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors shadow-sm">
                        <X size={20} />
                    </button>
                </div>

                {/* CUERPO - LA TABLA CLONADA */}
                <div className="overflow-y-auto flex-1 bg-white">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="font-black text-[10px] uppercase tracking-widest">Sincronizando desglose de la orden...</p>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-center py-20 bg-slate-50">
                            <PackageCheck className="mx-auto text-slate-200 mb-4" size={48} />
                            <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">El detalle de esta orden no está disponible temporalmente.</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 sticky top-0">
                                    <th className="px-8 py-4 text-left w-32">SKU</th>
                                    <th className="px-4 py-4 text-left">Descripción</th>
                                    <th className="px-4 py-4 text-center">Cant.</th>
                                    <th className="px-4 py-4 text-center w-32">P. Unit</th>
                                    <th className="px-8 py-4 text-right">Proyecto</th>
                                    <th className="px-8 py-4 text-right w-40">Importe</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {items.map((item, i) => {
                                    const qty = item.qty || item.quantity || 1;
                                    const price = item.price || item.unit_price || item.expected_cost || 0;
                                    const projectName = item.project_name || "GENERAL";
                                    
                                    return (
                                        <tr key={i} className="hover:bg-slate-50/30 transition-colors">
                                            <td className="px-8 py-3 font-black text-indigo-600 text-[11px] uppercase">{item.sku || 'N/A'}</td>
                                            <td className="px-4 py-3 font-bold text-slate-700 text-xs uppercase">{item.name || item.description || item.material_name || 'Articulo'}</td>
                                            <td className="px-4 py-3 text-center text-xs font-black text-slate-600">{qty}</td>
                                            <td className="px-4 py-3 text-center text-xs font-bold text-slate-400">${price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-8 py-3 text-right"><span className="text-[10px] font-black text-rose-600 uppercase">{projectName}</span></td>
                                            <td className="px-8 py-3 text-right text-xs font-black text-slate-800">${(qty * price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* PIE - TOTALES CLONADOS */}
                <div className="p-8 bg-slate-50/50 flex justify-between items-center border-t border-slate-100">
                    <div className="flex gap-4">
                        <button onClick={onClose} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 font-black uppercase text-xs h-12 px-10 shadow-sm rounded-lg transition-colors">
                            Cerrar Vista
                        </button>
                    </div>
                    <div className="w-80 space-y-1 pr-14">
                        <div className="flex justify-between items-center text-slate-500">
                            <span className="text-[10px] font-black uppercase">Subtotal</span>
                            <span className="text-sm font-bold">${displaySubtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-500 border-b border-slate-200 pb-2">
                            <span className="text-[10px] font-black uppercase">IVA (16%)</span>
                            <span className="text-sm font-bold">${displayIva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                            <span className="text-[11px] font-black text-emerald-600 uppercase">Saldo por Pagar</span>
                            <span className="text-3xl font-black text-slate-900">${displayTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};