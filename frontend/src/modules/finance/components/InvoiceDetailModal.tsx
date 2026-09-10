import React, { useState, useEffect, useMemo } from 'react';
import { PackageCheck, X, FileMinus, Receipt } from 'lucide-react';
import { PendingInvoice } from '../../../types/finance';
import client from '../../../api/axios-client';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { toast } from '@/components/ui/VToast';

const isOperationalExpenseInvoice = (inv: PendingInvoice): boolean =>
    String(inv.invoice_number || '').trim().toUpperCase().startsWith('GASTO-');

interface InvoiceDetailModalProps {
    invoice: PendingInvoice;
    onClose: () => void;
}

const NC_TYPE_OPTIONS = [
    { value: 'PRICE_ADJUSTMENT', label: 'Ajuste de precio' },
    { value: 'RETURN', label: 'Devolución' },
    { value: 'DISCOUNT', label: 'Descuento' },
];

const TAX_RATE_OPTIONS = [
    { value: '0.16', label: '16%' },
    { value: '0.08', label: '8%' },
    { value: '0', label: '0% (Tasa Cero)' },
];

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({ invoice, onClose }) => {
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const canCreateNC = ['ADMIN','ADMINISTRACION','ADMINISTRADOR','MANAGER','DIRECTOR','DIRECCION'].includes(userRole);

    const [localOutstanding, setLocalOutstanding] = useState<number>(Number(invoice.outstanding_balance) || 0);
    const [showNCForm, setShowNCForm] = useState(false);
    const [ncType, setNcType] = useState('PRICE_ADJUSTMENT');
    const [ncFolio, setNcFolio] = useState('');
    const [ncAmount, setNcAmount] = useState('');
    const [ncTaxRate, setNcTaxRate] = useState(0.16);
    const [ncReason, setNcReason] = useState('');
    const [savingNC, setSavingNC] = useState(false);
    // RETURN: cantidad a devolver por índice de partida
    const [returnQty, setReturnQty] = useState<Record<number, number>>({});

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
                            material_id: row.material_id,
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

                if (isOperationalExpenseInvoice(invoice)) {
                    const folio = String(invoice.invoice_number || '').trim();
                    const totalConIva = Number(invoice.total_amount) || 0;
                    const unitPriceSinIva = totalConIva > 0 ? totalConIva / 1.16 : 0;
                    try {
                        const expRes = await client.get('/purchases/operational-expenses?limit=200');
                        const expenses = Array.isArray(expRes.data) ? expRes.data : [];
                        const match = expenses.find(
                            (e: { invoice_folio?: string }) =>
                                String(e.invoice_folio || '').trim() === folio,
                        );
                        if (match) {
                            const category = match.overhead_category
                                ? String(match.overhead_category)
                                : '';
                            const amount = Number(match.total_amount) || totalConIva;
                            const linePrice = amount > 0 ? amount / 1.16 : unitPriceSinIva;
                            setItems([
                                {
                                    sku: 'GASTO',
                                    description: category
                                        ? `Gasto operativo — ${category}`
                                        : 'Gasto operativo',
                                    quantity: 1,
                                    unit_price: linePrice,
                                    project_name: 'OPERATIVO',
                                },
                            ]);
                        }
                    } catch {
                        // Sin detalle en tesorería: el cuerpo muestra mensaje informativo.
                    }
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
            } catch {
                setItems([]); 
            } finally {
                setIsLoading(false);
            }
        };

        fetchItems();
    }, [invoice]);

    const ncAmountNum = Number(ncAmount) || 0;
    // Monto calculado para RETURN: suma de (cantidad a devolver × precio) + IVA
    const returnSubtotal = items.reduce((sum, it, idx) => {
        const q = Number(returnQty[idx]) || 0;
        return sum + q * (Number(it.unit_price) || 0);
    }, 0);
    const returnTotal = Number((returnSubtotal * (1 + Number(ncTaxRate))).toFixed(2));
    const effectiveNcAmount = ncType === 'RETURN' ? returnTotal : ncAmountNum;
    const nuevoSaldoNC = localOutstanding - effectiveNcAmount;
    const ncExcede = effectiveNcAmount > localOutstanding;

    const handleCreateNC = async () => {
        if (!ncFolio.trim()) { toast.warning('Ingresa el folio de la Nota de Crédito.'); return; }
        if (ncType !== 'RETURN') {
            if (ncAmountNum <= 0) { toast.warning('El monto debe ser mayor a cero.'); return; }
            if (ncExcede) { toast.warning('La NC no puede exceder el saldo pendiente.'); return; }
        }
        setSavingNC(true);
        try {
            const isReturn = ncType === 'RETURN';
            const returnItems = items
                .map((it, idx) => ({ material_id: it.material_id, returned_quantity: Number(returnQty[idx]) || 0 }))
                .filter(li => li.material_id && li.returned_quantity > 0);
            if (isReturn && returnItems.length === 0) {
                toast.warning('Indica al menos una cantidad a devolver.');
                setSavingNC(false);
                return;
            }
            const payload: any = {
                purchase_invoice_id: invoice.id,
                folio: ncFolio.trim(),
                credit_type: ncType,
                tax_rate: ncTaxRate,
                reason: ncReason.trim() || null,
            };
            if (isReturn) {
                payload.items = returnItems;
            } else {
                payload.total_amount = ncAmountNum;
            }
            const res = await client.post('/finance/credit-notes', payload);
            const nuevoSaldo = res.data?.new_outstanding_balance ?? nuevoSaldoNC;
            setLocalOutstanding(nuevoSaldo);
            setShowNCForm(false);
            setNcFolio(''); setNcAmount(''); setNcReason('');
            toast.success(`Nota de Crédito registrada. Nuevo saldo de la factura: $${Number(nuevoSaldo).toLocaleString('es-MX', {minimumFractionDigits: 2})}`);
        } catch (e: any) {
            toast.error(e?.response?.data?.detail || 'No se pudo registrar la Nota de Crédito.');
        } finally {
            setSavingNC(false);
        }
    };

    // Cierre A: el pie refleja el SALDO VIVO de la factura (= cascada de CxP), no la suma del desglose.
    const displayTotal = localOutstanding;
    const enCapturaNC = showNCForm && effectiveNcAmount > 0;
    const saldoMostrado = enCapturaNC ? nuevoSaldoNC : displayTotal;
    const subtotalMostrado = saldoMostrado / 1.16;
    const ivaMostrado = subtotalMostrado * 0.16;
    const displaySubtotal = subtotalMostrado;
    const displayIva = ivaMostrado;

    const itemColumns = useMemo((): VTableColumn<Record<string, unknown>>[] => [
        {
            key: 'sku',
            label: 'SKU',
            width: '8rem',
            render: (item) => (
                <span className="font-black text-indigo-600 text-[11px] uppercase">{String(item.sku || 'N/A')}</span>
            ),
        },
        {
            key: 'description',
            label: 'Descripción',
            render: (item) => (
                <span className="font-bold text-slate-700 text-xs uppercase">
                    {String(item.name || item.description || item.material_name || 'Articulo')}
                </span>
            ),
        },
        {
            key: 'quantity',
            label: 'Cant.',
            render: (item) => (
                <span className="block text-center text-xs font-black text-slate-600">
                    {String(item.qty || item.quantity || 1)}
                </span>
            ),
        },
        {
            key: 'unit_price',
            label: 'P. Unit',
            width: '8rem',
            render: (item) => {
                const price = Number(item.price || item.unit_price || item.expected_cost || 0);
                return (
                    <span className="block text-center text-xs font-bold text-slate-400">
                        ${price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </span>
                );
            },
        },
        {
            key: 'project_name',
            label: 'Proyecto',
            render: (item) => (
                <span className="block text-right text-[10px] font-black text-rose-600 uppercase">
                    {String(item.project_name || 'GENERAL')}
                </span>
            ),
        },
        {
            key: 'importe',
            label: 'Importe',
            width: '10rem',
            render: (item) => {
                const qty = Number(item.qty || item.quantity || 1);
                const price = Number(item.price || item.unit_price || item.expected_cost || 0);
                return (
                    <span className="block text-right text-xs font-black text-slate-800">
                        ${(qty * price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </span>
                );
            },
        },
    ], []);

    const tableItems = useMemo(
        () => items as unknown as Record<string, unknown>[],
        [items],
    );

    const isGastoOperativo = isOperationalExpenseInvoice(invoice);

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
                            <p className="text-[10px] font-black uppercase text-emerald-700 mt-1 tracking-widest leading-none">
                                FACTURA: {invoice.invoice_number || '—'}
                            </p>
                            {invoice.po_folio && (
                                <p className="text-[9px] font-black uppercase text-slate-400 mt-0.5 tracking-widest leading-none">
                                    OC: {invoice.po_folio}
                                </p>
                            )}
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
                        isGastoOperativo ? (
                            <VEmptyState
                                icon={<Receipt />}
                                title="Gasto operativo (sin orden de compra)"
                                description={`${invoice.invoice_number} es un gasto directo en cuentas por pagar. No hay partidas de material ni recepción de almacén; use el resumen inferior para subtotal, IVA y saldo a pagar.`}
                            />
                        ) : (
                            <div className="text-center py-20 bg-slate-50">
                                <PackageCheck className="mx-auto text-slate-200 mb-4" size={48} />
                                <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">El detalle de esta orden no está disponible temporalmente.</p>
                            </div>
                        )
                    ) : (
                        <VTable
                            columns={itemColumns}
                            data={tableItems}
                            className="border-0 rounded-none shadow-none"
                        />
                    )}
                </div>

                {showNCForm && (
                    <div className="px-8 py-5 bg-amber-50 border-t-2 border-amber-200">
                        <h4 className="text-sm font-black uppercase text-amber-800 mb-3 flex items-center gap-2">
                            <FileMinus size={16} /> Registrar Nota de Crédito
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500">Tipo</label>
                                <SearchableSelect
                                    items={NC_TYPE_OPTIONS}
                                    value={ncType}
                                    onChange={(v) => { setNcType(v); setReturnQty({}); }}
                                    getLabel={(o) => o.label}
                                    getValue={(o) => o.value}
                                    className="text-sm font-bold"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500">Folio de la NC *</label>
                                <Input value={ncFolio} onChange={e => setNcFolio(e.target.value)} className="text-sm font-bold" placeholder="Folio fiscal" />
                            </div>
                            {ncType !== 'RETURN' && (
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500">Monto total (c/IVA) *</label>
                                    <Input type="number" value={ncAmount} onChange={e => setNcAmount(e.target.value)} className={`text-sm font-bold ${ncExcede ? 'border-red-400 bg-red-50' : ''}`} placeholder="0.00" />
                                </div>
                            )}
                            {ncType === 'RETURN' && (
                                <div className="col-span-2 border border-amber-300 rounded p-3 bg-white">
                                    <label className="text-[10px] font-black uppercase text-slate-500 block mb-2">Materiales a devolver (máx = recibido)</label>
                                    {items.length === 0 && (
                                        <p className="text-xs text-slate-400">Esta factura no tiene materiales con detalle para devolver.</p>
                                    )}
                                    {items.map((it, idx) => {
                                        const recibido = Number(it.quantity) || 0;
                                        const precio = Number(it.unit_price) || 0;
                                        return (
                                            <div key={idx} className="flex items-center gap-2 py-1 border-b border-slate-50 last:border-0">
                                                <span className="flex-1 text-xs font-bold text-slate-600 uppercase">{it.description || it.name || 'Material'}</span>
                                                <span className="text-[10px] text-slate-400">recibido: {recibido}</span>
                                                <span className="text-[10px] text-slate-400">${precio.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                                <Input
                                                    type="number" min="0" max={recibido} step="any"
                                                    value={returnQty[idx] ?? ''}
                                                    onChange={e => {
                                                        const v = Number(e.target.value);
                                                        setReturnQty({ ...returnQty, [idx]: v });
                                                    }}
                                                    className="w-20 text-sm text-center font-bold"
                                                    placeholder="0"
                                                    disabled={!it.material_id}
                                                />
                                            </div>
                                        );
                                    })}
                                    <div className="text-right text-sm font-black text-amber-800 mt-2">
                                        Monto NC (calculado): ${returnTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500">Tasa IVA</label>
                                <SearchableSelect
                                    items={TAX_RATE_OPTIONS}
                                    value={String(ncTaxRate)}
                                    onChange={(v) => setNcTaxRate(Number(v))}
                                    getLabel={(o) => o.label}
                                    getValue={(o) => o.value}
                                    className="text-sm font-bold"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[10px] font-black uppercase text-slate-500">Motivo</label>
                                <Input value={ncReason} onChange={e => setNcReason(e.target.value)} className="text-sm" placeholder="Ej. Ajuste de precio pactado" />
                            </div>
                        </div>
                        <div className="flex justify-between items-center mt-4">
                            <div className="text-sm font-black">
                                {ncExcede && <span className="text-red-600 text-[10px] uppercase font-black">⚠️ Excede el saldo pendiente</span>}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowNCForm(false)} className="px-4 py-2 text-xs font-black uppercase text-slate-500 border border-slate-300 rounded">Cancelar</button>
                                <button onClick={handleCreateNC} disabled={savingNC || ncExcede} className="px-4 py-2 text-xs font-black uppercase text-white bg-amber-600 hover:bg-amber-700 rounded disabled:opacity-50">
                                    {savingNC ? 'Guardando...' : 'Registrar NC'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* PIE - TOTALES CLONADOS */}
                <div className="p-8 bg-slate-50/50 flex justify-between items-center border-t border-slate-100">
                    <div className="flex gap-4">
                        <button onClick={onClose} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 font-black uppercase text-xs h-12 px-10 shadow-sm rounded-lg transition-colors">
                            Cerrar Vista
                        </button>
                        {canCreateNC && (
                            <button onClick={() => setShowNCForm(v => !v)} className="bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-xs h-12 px-8 shadow-sm rounded-lg transition-colors flex items-center gap-2">
                                <FileMinus size={16} /> {showNCForm ? 'Ocultar NC' : 'Registrar NC'}
                            </button>
                        )}
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
                            <span className="text-[11px] font-black text-emerald-600 uppercase">{enCapturaNC ? 'Nuevo saldo (tras NC)' : 'Saldo a pagar'}</span>
                            <span className={`text-3xl font-black ${enCapturaNC ? (ncExcede ? 'text-red-600' : 'text-emerald-600') : 'text-slate-900'}`}>${saldoMostrado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};