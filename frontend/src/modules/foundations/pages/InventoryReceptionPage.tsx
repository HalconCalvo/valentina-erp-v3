import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Save, Plus, Trash2, Package, Edit, 
    AlertTriangle, CheckCircle2, Calculator, Calendar, Clock 
} from 'lucide-react';

import { useProviders } from '../hooks/useProviders';
import { useMaterials } from '../hooks/useMaterials';
import { inventoryService } from '../../../api/inventory-service';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import { ReceptionItem } from '../../../types/inventory';

const InventoryReceptionPage: React.FC = () => {
    const navigate = useNavigate();
    const { providers, fetchProviders } = useProviders();
    const { materials, fetchMaterials } = useMaterials();

    const [header, setHeader] = useState({
        provider_id: 0,
        invoice_number: '',
        invoice_date: new Date().toISOString().split('T')[0], // Fecha Hoy por defecto
        due_date: '', 
        total_amount: 0,
        notes: ''
    });

    const [items, setItems] = useState<ReceptionItem[]>([]);
    const [selectedCreditDays, setSelectedCreditDays] = useState<number>(0); // Estado visual para mostrar días
    
    const [lineItem, setLineItem] = useState({
        material_id: 0,
        quantity: 1,
        unit_cost: 0,
        line_total_cost: 0,
        searchQuery: '' 
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showMaterialList, setShowMaterialList] = useState(false);

    useEffect(() => {
        fetchProviders();
        fetchMaterials();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

    // --- ✨ AUTOMATIZACIÓN DE FECHAS (NUEVO) ---
    // Cada vez que cambia el Proveedor o la Fecha de Factura, recalculamos el Vencimiento.
    useEffect(() => {
        if (header.provider_id && header.invoice_date) {
            const provider = providers.find(p => p.id === header.provider_id);
            if (provider) {
                const days = provider.credit_days || 0;
                setSelectedCreditDays(days);

                // Cálculo seguro de fechas (evitando problemas de zona horaria)
                const parts = header.invoice_date.split('-'); // [YYYY, MM, DD]
                const baseDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                
                // Sumar días de crédito
                baseDate.setDate(baseDate.getDate() + days);
                
                const calculatedDueDate = baseDate.toISOString().split('T')[0];
                
                setHeader(prev => ({ ...prev, due_date: calculatedDueDate }));
            }
        }
    }, [header.provider_id, header.invoice_date, providers]);


    // --- CÁLCULOS ---
    const filteredMaterials = useMemo(() => {
        if (!lineItem.searchQuery) {
            return Array.isArray(materials) ? materials : [];
        }
        return materials.filter(m => 
            m.name.toLowerCase().includes(lineItem.searchQuery.toLowerCase()) || 
            m.sku.toLowerCase().includes(lineItem.searchQuery.toLowerCase())
        );
    }, [materials, lineItem.searchQuery]);

    const itemsTotal = useMemo(() => {
        return items.reduce((sum, item) => sum + Number(item.line_total_cost), 0);
    }, [items]);

    const difference = header.total_amount - itemsTotal;
    const isBalanced = Math.abs(difference) < 0.1;

    // --- MANEJADORES DE INPUTS ---
    const handleQuantityChange = (val: string) => {
        const qty = Number(val);
        setLineItem({
            ...lineItem,
            quantity: qty,
            line_total_cost: qty * lineItem.unit_cost
        });
    };

    const handleUnitCostChange = (val: string) => {
        const cost = Number(val);
        setLineItem({
            ...lineItem,
            unit_cost: cost,
            line_total_cost: cost * lineItem.quantity
        });
    };

    // --- FUNCIONES DE ITEM ---

    const handleAddItem = () => {
        if (lineItem.material_id === 0 || lineItem.quantity <= 0 || lineItem.unit_cost <= 0) {
            alert("Datos inválidos (Revise material, cantidad o costo unitario).");
            return;
        }
        const selectedMat = materials.find(m => m.id === lineItem.material_id);
        
        const newItem: ReceptionItem = {
            material_id: lineItem.material_id,
            quantity: Number(lineItem.quantity),
            line_total_cost: Number(lineItem.line_total_cost),
            tempId: Date.now().toString(), 
            material_name: selectedMat?.name || 'Desconocido',
            unit_cost_calculated: Number(lineItem.unit_cost)
        };
        
        setItems([...items, newItem]);
        setLineItem({ ...lineItem, material_id: 0, quantity: 1, unit_cost: 0, line_total_cost: 0, searchQuery: '' });
    };

    const handleEditItem = (tempId?: string) => {
        const itemToEdit = items.find(i => i.tempId === tempId);
        if (!itemToEdit) return;

        setLineItem({
            material_id: itemToEdit.material_id,
            quantity: itemToEdit.quantity,
            unit_cost: itemToEdit.unit_cost_calculated || 0,
            line_total_cost: itemToEdit.line_total_cost,
            searchQuery: itemToEdit.material_name || ''
        });

        setItems(items.filter(i => i.tempId !== tempId));
    };

    const handleRemoveItem = (tempId?: string) => {
        if(window.confirm("¿Eliminar esta línea?")) {
            setItems(items.filter(i => i.tempId !== tempId));
        }
    };

    // --- LÓGICA DE PRORRATEO ---
    const handleDistributeDiscount = () => {
        if (itemsTotal === 0 || header.total_amount === 0) return;

        const factor = header.total_amount / itemsTotal;
        const discountPercent = (1 - factor) * 100;

        if(!window.confirm(`⚠️ PRORRATEO DE DESCUENTO\n\nSe detectó una diferencia del ${discountPercent.toFixed(2)}%.\n\nEl sistema va a AJUSTAR proporcionalmente los costos.\n\n¿Proceder?`)) {
            return;
        }

        const adjustedItems = items.map(item => {
            const newTotal = item.line_total_cost * factor;
            return {
                ...item,
                line_total_cost: newTotal,
                unit_cost_calculated: newTotal / item.quantity
            };
        });

        setItems(adjustedItems);
    };

    const handleSubmit = async () => {
        if (header.provider_id === 0 || !header.invoice_number || items.length === 0) {
            alert("Faltan datos obligatorios.");
            return;
        }
        if (!isBalanced) {
            const msg = `⚠️ DESCUADRE DETECTADO\n\nTotal Factura: $${header.total_amount}\nSuma Materiales: $${itemsTotal.toFixed(2)}\n\n¿Deseas guardar así de todos modos?`;
            if(!window.confirm(msg)) return;
        }

        setIsSubmitting(true);
        try {
            await inventoryService.createReception({
                ...header,
                total_amount: Number(header.total_amount),
                provider_id: Number(header.provider_id),
                due_date: header.due_date ? header.due_date : undefined,
                items: items
            });
            alert("✅ Recepción Registrada Correctamente.");
            setItems([]);
            // Reset al estado inicial
            setHeader({
                provider_id: 0,
                invoice_number: '',
                invoice_date: new Date().toISOString().split('T')[0],
                due_date: '',
                total_amount: 0,
                notes: ''
            });
            navigate('/materials');
        } catch (error) {
            console.error(error);
            alert("❌ Error al guardar.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 pb-20 bg-slate-50 min-h-full">
            
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                        <Package className="text-indigo-600"/> Entrada de Almacén
                    </h1>
                    <p className="text-slate-500 text-sm">Registro de Facturas de Proveedores</p>
                </div>
                
                <div className={`px-4 py-2 rounded-lg font-bold border flex items-center gap-3 transition-colors ${isBalanced ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {isBalanced ? <CheckCircle2 size={24}/> : <AlertTriangle size={24}/>}
                    <div className="text-right leading-tight">
                        <div className="text-[10px] uppercase opacity-70">Diferencia</div>
                        <div className="text-lg">${difference.toFixed(2)}</div>
                    </div>
                </div>
            </div>

            {/* HEADER CARD: DATOS GENERALES Y FINANCIEROS */}
            <Card className="p-6 grid grid-cols-1 md:grid-cols-5 gap-6 bg-white shadow-sm border-slate-200">
                
                {/* 1. PROVEEDOR */}
                <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-1">Proveedor *</label>
                    <select 
                        className="w-full p-2.5 border border-slate-300 rounded-md bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={header.provider_id}
                        onChange={(e) => setHeader({...header, provider_id: Number(e.target.value)})}
                    >
                        <option value={0}>-- Seleccionar Proveedor --</option>
                        {providers?.map(p => (
                            <option key={p.id} value={p.id}>{p.business_name} ({p.credit_days} días)</option>
                        )) || <option disabled>Cargando...</option>}
                    </select>
                </div>

                {/* 2. FOLIO FACTURA */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Folio Factura *</label>
                    <Input 
                        placeholder="Ej. A-4500" 
                        value={header.invoice_number} 
                        onChange={(e) => setHeader({...header, invoice_number: e.target.value})}
                    />
                </div>

                {/* 3. FECHA FACTURA (AHORA SÍ LA PEDIMOS) */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1">
                        <Calendar size={14}/> Fecha Factura
                    </label>
                    <Input 
                        type="date"
                        value={header.invoice_date} 
                        onChange={(e) => setHeader({...header, invoice_date: e.target.value})}
                    />
                </div>

                {/* 4. TOTAL */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Total (Neto) *</label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                        <Input 
                            type="number"
                            className="pl-8 font-bold text-indigo-700"
                            placeholder="0.00"
                            value={header.total_amount || ''} 
                            onChange={(e) => setHeader({...header, total_amount: Number(e.target.value)})}
                        />
                    </div>
                </div>

                {/* 5. VENCIMIENTO (Calculado Automáticamente) */}
                <div className="md:col-span-1 bg-slate-50 p-2 rounded border border-slate-200">
                    <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1 uppercase">
                        <Clock size={12}/> Vencimiento
                    </label>
                    <div className="font-mono font-bold text-slate-700">
                        {header.due_date || '-'}
                    </div>
                    <div className="text-[10px] text-indigo-600 font-medium mt-1">
                        {selectedCreditDays > 0 ? `Crédito: ${selectedCreditDays} días` : 'Contado / Inmediato'}
                    </div>
                </div>

            </Card>

            <div className="flex flex-col lg:flex-row gap-6">
                
                {/* PANEL IZQUIERDO: FORMULARIO AGREGAR ITEM */}
                <div className="w-full lg:w-1/3 bg-white p-6 rounded-xl border border-slate-200 h-fit shadow-sm sticky top-4">
                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b pb-2">
                        <Plus size={18} className="text-indigo-600"/> Agregar Material
                    </h3>
                    
                    <div className="space-y-4">
                        <div className="relative">
                            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Material</label>
                            <Input 
                                placeholder="Seleccionar o buscar SKU..." 
                                value={lineItem.searchQuery}
                                onChange={(e) => {
                                    setLineItem({...lineItem, searchQuery: e.target.value});
                                    setShowMaterialList(true);
                                }}
                                onFocus={() => setShowMaterialList(true)}
                                onBlur={() => setTimeout(() => setShowMaterialList(false), 200)}
                            />
                            
                            {showMaterialList && (
                                <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-md shadow-xl mt-1 max-h-60 overflow-y-auto">
                                    {filteredMaterials.map(m => (
                                        <div 
                                            key={m.id}
                                            className="px-4 py-2 hover:bg-indigo-50 cursor-pointer border-b last:border-0 text-sm flex justify-between items-center group"
                                            onMouseDown={() => {
                                                setLineItem({...lineItem, material_id: m.id, searchQuery: m.name});
                                                setShowMaterialList(false);
                                            }}
                                        >
                                            <div>
                                                <div className="font-bold text-slate-700 group-hover:text-indigo-700">{m.name}</div>
                                                <div className="text-xs text-slate-400">{m.sku}</div>
                                            </div>
                                            <Badge variant="outline" className="text-[10px]">{m.usage_unit}</Badge>
                                        </div>
                                    ))}
                                    {filteredMaterials.length === 0 && (
                                        <div className="p-3 text-xs text-center text-slate-400 italic">
                                            No se encontraron materiales
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Cantidad</label>
                                <Input 
                                    type="number" 
                                    value={lineItem.quantity} 
                                    onChange={(e) => handleQuantityChange(e.target.value)} 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Costo Unitario ($)</label>
                                <Input 
                                    type="number" 
                                    value={lineItem.unit_cost === 0 ? '' : lineItem.unit_cost} 
                                    onChange={(e) => handleUnitCostChange(e.target.value)} 
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div className="bg-indigo-50 p-3 rounded text-center border border-indigo-100">
                            <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Total de Línea Calculado</div>
                            <div className="text-xl font-black text-indigo-700">
                                ${lineItem.line_total_cost.toFixed(2)}
                            </div>
                        </div>

                        <Button className="w-full bg-slate-800 hover:bg-slate-900" onClick={handleAddItem} disabled={lineItem.material_id === 0}>
                            <Plus size={16} className="mr-2"/> Agregar a Lista
                        </Button>
                    </div>
                </div>

                {/* PANEL DERECHO: TABLA DE ITEMS */}
                <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-slate-600 flex justify-between">
                        <span>Items en Recepción</span>
                        <Badge variant="secondary">{items.length}</Badge>
                    </div>
                    
                    <div className="flex-1 overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white border-b border-slate-100 text-xs uppercase text-slate-400">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Material</th>
                                    <th className="px-4 py-3 text-center font-semibold">Cant.</th>
                                    <th className="px-4 py-3 text-right font-semibold">Unitario</th>
                                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                                    <th className="px-4 py-3 text-center font-semibold">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {items.map((item) => (
                                    <tr key={item.tempId} className="hover:bg-indigo-50/30 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-700">{item.material_name}</td>
                                        <td className="px-4 py-3 text-center text-slate-600">{item.quantity}</td>
                                        <td className="px-4 py-3 text-right text-slate-500">${item.unit_cost_calculated?.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">${item.line_total_cost.toFixed(2)}</td>
                                        
                                        <td className="px-4 py-3 text-center flex justify-center gap-2">
                                            <button 
                                                onClick={() => handleEditItem(item.tempId)} 
                                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                            >
                                                <Edit size={16}/>
                                            </button>
                                            
                                            <button 
                                                onClick={() => handleRemoveItem(item.tempId)} 
                                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                            >
                                                <Trash2 size={16}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-end items-center gap-4">
                        <div className="text-right">
                            <div className="text-[10px] uppercase font-bold text-slate-400">Suma Items</div>
                            <div className="text-lg font-bold text-slate-700">${itemsTotal.toFixed(2)}</div>
                        </div>

                        {!isBalanced && itemsTotal > 0 && (
                            <Button 
                                variant="secondary" 
                                className="bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300"
                                onClick={handleDistributeDiscount}
                            >
                                <Calculator size={18} className="mr-2"/>
                                Ajustar Diferencia (Desc.)
                            </Button>
                        )}

                        <Button 
                            onClick={handleSubmit} 
                            disabled={isSubmitting || items.length === 0} 
                            className={isBalanced ? 'bg-indigo-600' : 'bg-slate-700'}
                        >
                            {isSubmitting ? 'Guardando...' : 'Confirmar'} <Save size={18} className="ml-2"/>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InventoryReceptionPage;