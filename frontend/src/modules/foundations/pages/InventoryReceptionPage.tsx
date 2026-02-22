import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Save, Plus, Trash2, Package, Edit, 
    AlertTriangle, CheckCircle2, Calculator, Calendar, X 
} from 'lucide-react';

import { useProviders } from '../hooks/useProviders';
import { useMaterials } from '../hooks/useMaterials';
import { inventoryService } from '../../../api/inventory-service';
import axiosClient from '../../../api/axios-client';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import { ReceptionItem } from '../../../types/inventory';

// --- UTILIDAD DE FORMATO MONEDA ---
const formatCurrency = (amount: number): string => {
    if (isNaN(amount)) return '$0.00';
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
};

const formatInitialAmount = (num: number): string => {
    if (isNaN(num)) return '';
    const [integerPart, decimalPart] = num.toFixed(2).split('.');
    return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimalPart}`;
};

const InventoryReceptionPage: React.FC = () => {
    const navigate = useNavigate();
    const { providers, fetchProviders } = useProviders();
    const { materials, fetchMaterials } = useMaterials();

    const [header, setHeader] = useState({
        provider_id: 0,
        invoice_number: '',
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: '', 
        total_amount: 0,
        notes: ''
    });

    const [displayTotal, setDisplayTotal] = useState('');
    const [displayUnitCost, setDisplayUnitCost] = useState('');

    const [items, setItems] = useState<ReceptionItem[]>([]);
    
    const [lineItem, setLineItem] = useState({
        material_id: 0,
        quantity: 1,
        unit_cost: 0,
        line_total_cost: 0,
        searchQuery: '' 
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showMaterialList, setShowMaterialList] = useState(false);

    // --- ESTADOS PARA ALTA RÁPIDA DE MATERIAL ---
    const [showNewMaterialModal, setShowNewMaterialModal] = useState(false);
    const [isSavingMaterial, setIsSavingMaterial] = useState(false);
    const [newMaterial, setNewMaterial] = useState({
        sku: '',
        name: '',
        category: 'Herrajes',
        production_route: 'MATERIAL',
        purchase_unit: 'Pieza',
        usage_unit: 'Pieza',
        conversion_factor: 1,
        current_cost: 0,
        physical_stock: 0,
        committed_stock: 0,
        is_active: true
    });

    useEffect(() => {
        fetchProviders();
        fetchMaterials();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

    // --- AUTOMATIZACIÓN DE FECHAS ---
    useEffect(() => {
        if (header.provider_id && header.invoice_date) {
            const provider = providers.find(p => p.id === header.provider_id);
            if (provider) {
                const days = provider.credit_days || 0;
                const parts = header.invoice_date.split('-');
                const baseDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                baseDate.setDate(baseDate.getDate() + days);
                setHeader(prev => ({ ...prev, due_date: baseDate.toISOString().split('T')[0] }));
            }
        }
    }, [header.provider_id, header.invoice_date, providers]);

    const handleAmountInput = (val: string, setNumber: (n: number) => void, setDisplay: (s: string) => void) => {
        let cleanVal = val.replace(/[^0-9.]/g, '');
        if ((cleanVal.match(/\./g) || []).length > 1) cleanVal = cleanVal.substring(0, cleanVal.lastIndexOf('.'));
        if (cleanVal.includes('.')) {
            const parts = cleanVal.split('.');
            if (parts[1].length > 2) cleanVal = `${parts[0]}.${parts[1].substring(0, 2)}`;
        }
        if (cleanVal === '') {
            setDisplay('');
            setNumber(0);
            return;
        }
        const numericVal = parseFloat(cleanVal);
        setNumber(isNaN(numericVal) ? 0 : numericVal);
        const parts = cleanVal.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        setDisplay(parts.join('.'));
    };

    const handleBlur = (val: number, setDisplay: (s: string) => void) => {
        if (val > 0) setDisplay(formatInitialAmount(val));
    };

    const filteredMaterials = useMemo(() => {
        if (!lineItem.searchQuery) return Array.isArray(materials) ? materials : [];
        return materials.filter(m => 
            m.name.toLowerCase().includes(lineItem.searchQuery.toLowerCase()) || 
            m.sku.toLowerCase().includes(lineItem.searchQuery.toLowerCase())
        );
    }, [materials, lineItem.searchQuery]);

    const itemsTotal = useMemo(() => {
        return items.reduce((sum, item) => sum + Number(item.line_total_cost), 0);
    }, [items]);

    const targetSubtotal = header.total_amount / 1.16;
    const difference = targetSubtotal - itemsTotal;
    const isBalanced = header.total_amount > 0 && Math.abs(difference) < 1.0; 

    // --- FUNCIONES DE ITEM ---
    const handleAddItem = () => {
        if (!lineItem.searchQuery) {
            alert("Ingrese el nombre del artículo a buscar o agregar.");
            return;
        }
        if (lineItem.quantity <= 0 || lineItem.unit_cost <= 0) {
            alert("Ingrese cantidad y costo unitario (Sin IVA) válidos.");
            return;
        }

        // INTERCEPCIÓN MÁGICA: Si no tiene ID, lo mandamos a crear primero.
        if (lineItem.material_id === 0) {
            setNewMaterial({...newMaterial, name: lineItem.searchQuery});
            setShowMaterialList(false); // FORZAR CIERRE DE LA LISTA
            setShowNewMaterialModal(true);
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
        setLineItem({ material_id: 0, quantity: 1, unit_cost: 0, line_total_cost: 0, searchQuery: '' });
        setDisplayUnitCost('');
        setShowMaterialList(false); // FORZAR CIERRE POR SEGURIDAD
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
        setDisplayUnitCost(formatInitialAmount(itemToEdit.unit_cost_calculated || 0));
        setItems(items.filter(i => i.tempId !== tempId));
        setShowMaterialList(false);
    };

    const handleRemoveItem = (tempId?: string) => {
        if(window.confirm("¿Eliminar esta línea?")) {
            setItems(items.filter(i => i.tempId !== tempId));
        }
    };

    const handleDistributeDiscount = () => {
        if (itemsTotal === 0 || targetSubtotal === 0) return;
        const factor = targetSubtotal / itemsTotal;
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
            alert("Faltan datos obligatorios (Proveedor, Folio o Artículos).");
            return;
        }
        if (!isBalanced) {
            const msg = `⚠️ DESCUADRE DETECTADO\n\nSubtotal Calculado (Factura / 1.16): ${formatCurrency(targetSubtotal)}\nSuma Artículos (Sin IVA): ${formatCurrency(itemsTotal)}\n\n¿Deseas guardar así de todos modos?`;
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
            alert("✅ Factura ingresada al almacén correctamente.");
            setItems([]);
            setHeader({
                provider_id: 0, invoice_number: '', invoice_date: new Date().toISOString().split('T')[0],
                due_date: '', total_amount: 0, notes: ''
            });
            setDisplayTotal('');
            navigate('/materials');
        } catch (error) {
            console.error(error);
            alert("❌ Error al guardar en la base de datos.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- ALTA RÁPIDA DE MATERIAL (FLUJO CONTINUO) ---
    const handleSaveNewMaterial = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!newMaterial.sku || !newMaterial.name) {
            alert("SKU y Nombre son obligatorios");
            return;
        }
        setIsSavingMaterial(true);
        try {
            // Hereda el proveedor de la factura actual automáticamente
            const payload = {
                ...newMaterial,
                provider_id: header.provider_id > 0 ? header.provider_id : undefined
            };
            
            const response = await axiosClient.post('/foundations/materials', payload);
            await fetchMaterials();
            const newId = response.data.id || 0;

            // Inyectar directamente a la lista de la factura
            const newItem: ReceptionItem = {
                material_id: newId,
                quantity: Number(lineItem.quantity),
                line_total_cost: Number(lineItem.line_total_cost),
                tempId: Date.now().toString(), 
                material_name: newMaterial.name,
                unit_cost_calculated: Number(lineItem.unit_cost)
            };
            setItems(prev => [...prev, newItem]);
            
            // Limpiar la barra de captura y FORZAR CIERRE DE LA LISTA
            setLineItem({ material_id: 0, quantity: 1, unit_cost: 0, line_total_cost: 0, searchQuery: '' });
            setDisplayUnitCost('');
            setShowMaterialList(false); // EL FIX CLAVE
            setShowNewMaterialModal(false);
            
            // Resetear el formulario
            setNewMaterial({
                sku: '', name: '', category: 'Herrajes', production_route: 'MATERIAL',
                purchase_unit: 'Pieza', usage_unit: 'Pieza', conversion_factor: 1,
                current_cost: 0, physical_stock: 0, committed_stock: 0, is_active: true
            });

        } catch (error) {
            console.error(error);
            alert("Error al crear el material. Verifique que el SKU no exista ya en el catálogo.");
        } finally {
            setIsSavingMaterial(false);
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
                        <div className="text-[10px] uppercase opacity-70">Diferencia VS Subtotal</div>
                        <div className="text-lg">{formatCurrency(difference)}</div>
                    </div>
                </div>
            </div>

            <Card className="p-6 bg-white shadow-sm border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-bold text-slate-700 mb-1">Proveedor *</label>
                        <select 
                            className="w-full p-2.5 border border-slate-300 rounded-md bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                            value={header.provider_id}
                            onChange={(e) => setHeader({...header, provider_id: Number(e.target.value)})}
                        >
                            <option value={0}>-- Seleccionar Proveedor --</option>
                            {providers?.map(p => (
                                <option key={p.id} value={p.id}>{p.business_name} ({p.credit_days} días)</option>
                            )) || <option disabled>Cargando...</option>}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Folio Factura *</label>
                        <Input 
                            placeholder="Ej. A-4500" 
                            className="font-medium"
                            value={header.invoice_number} 
                            onChange={(e) => setHeader({...header, invoice_number: e.target.value})}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1">
                            <Calendar size={14}/> Fecha Factura
                        </label>
                        <Input 
                            type="date"
                            className="font-medium"
                            value={header.invoice_date} 
                            onChange={(e) => setHeader({...header, invoice_date: e.target.value})}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Total Factura (Con IVA) *</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500">$</span>
                            <input 
                                type="text"
                                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-md font-black text-indigo-700 focus:ring-2 focus:ring-indigo-500 outline-none text-lg"
                                placeholder="0.00"
                                value={displayTotal} 
                                onChange={(e) => handleAmountInput(e.target.value, (n) => setHeader({...header, total_amount: n}), setDisplayTotal)}
                                onBlur={() => handleBlur(header.total_amount, setDisplayTotal)}
                            />
                        </div>
                    </div>
                </div>
            </Card>

            <div className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                
                <div className="bg-slate-50 p-4 border-b border-slate-200 grid grid-cols-12 gap-4 items-end">
                    <div className="col-span-5 relative">
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Buscar Artículo o Nuevo</label>
                        <Input 
                            placeholder="Escribe para buscar..." 
                            value={lineItem.searchQuery}
                            onChange={(e) => {
                                setLineItem({...lineItem, searchQuery: e.target.value, material_id: 0}); 
                                setShowMaterialList(true);
                            }}
                            onFocus={() => setShowMaterialList(true)}
                        />
                        {showMaterialList && filteredMaterials.length > 0 && (
                            <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-md shadow-2xl mt-1 max-h-80 overflow-y-auto flex flex-col">
                                {filteredMaterials.map(m => (
                                    <div 
                                        key={m.id}
                                        className="px-4 py-2 hover:bg-indigo-50 cursor-pointer border-b last:border-0 text-sm flex justify-between items-center group"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
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
                            </div>
                        )}
                    </div>
                    
                    <div className="col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Cantidad</label>
                        <Input 
                            type="number" 
                            className="text-center font-bold"
                            value={lineItem.quantity} 
                            onChange={(e) => {
                                const qty = Number(e.target.value);
                                setLineItem({...lineItem, quantity: qty, line_total_cost: qty * lineItem.unit_cost});
                            }} 
                        />
                    </div>
                    
                    <div className="col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Unitario (S/ IVA)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500">$</span>
                            <input 
                                type="text"
                                className="w-full pl-8 pr-2 py-2 border border-slate-300 rounded-md font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-right"
                                placeholder="0.00"
                                value={displayUnitCost} 
                                onChange={(e) => handleAmountInput(e.target.value, (n) => setLineItem({...lineItem, unit_cost: n, line_total_cost: n * lineItem.quantity}), setDisplayUnitCost)}
                                onBlur={() => handleBlur(lineItem.unit_cost, setDisplayUnitCost)}
                            />
                        </div>
                    </div>
                    
                    <div className="col-span-2 bg-indigo-50 border border-indigo-100 rounded-md px-3 py-2 text-right">
                        <div className="text-[9px] font-bold text-indigo-400 uppercase leading-none mb-1">Total Partida</div>
                        <div className="font-black text-indigo-700 leading-none">
                            {formatCurrency(lineItem.line_total_cost)}
                        </div>
                    </div>
                    
                    <div className="col-span-1">
                        <Button 
                            className={`w-full py-2 ${lineItem.material_id === 0 && lineItem.searchQuery ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-800 hover:bg-slate-900'}`} 
                            onClick={handleAddItem} 
                            disabled={!lineItem.searchQuery}
                        >
                            <Plus size={20} className="mx-auto"/>
                        </Button>
                    </div>
                </div>

                <div className="overflow-y-auto min-h-[500px] max-h-[70vh] w-full">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white border-b border-slate-200 text-xs uppercase text-slate-400 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-6 py-3 font-semibold w-5/12">Artículo / Material</th>
                                <th className="px-4 py-3 text-center font-semibold w-2/12">Cantidad</th>
                                <th className="px-4 py-3 text-right font-semibold w-2/12">Unitario</th>
                                <th className="px-4 py-3 text-right font-semibold w-2/12">Total Base</th>
                                <th className="px-4 py-3 text-center font-semibold w-1/12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                                        No hay artículos agregados. Usa la barra superior para buscarlos.
                                    </td>
                                </tr>
                            ) : items.map((item) => (
                                <tr key={item.tempId} className="hover:bg-indigo-50/40 transition-colors">
                                    <td className="px-6 py-3 font-medium text-slate-700">{item.material_name}</td>
                                    <td className="px-4 py-3 text-center font-bold text-slate-600">{item.quantity}</td>
                                    <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(item.unit_cost_calculated || 0)}</td>
                                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{formatCurrency(item.line_total_cost)}</td>
                                    <td className="px-4 py-3 text-center flex justify-center gap-2">
                                        <button onClick={() => handleEditItem(item.tempId)} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                                            <Edit size={16}/>
                                        </button>
                                        <button onClick={() => handleRemoveItem(item.tempId)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                                            <Trash2 size={16}/>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                    <div className="flex gap-8">
                        <div>
                            <div className="text-[10px] uppercase font-bold text-slate-400">Total Factura (Capturado)</div>
                            <div className="text-lg font-bold text-indigo-700">{formatCurrency(header.total_amount)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-slate-400">Subtotal Calculado (/ 1.16)</div>
                            <div className="text-lg font-bold text-slate-600">{formatCurrency(targetSubtotal)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-slate-400">Suma Artículos (En Lista)</div>
                            <div className="text-lg font-black text-slate-800">{formatCurrency(itemsTotal)}</div>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        {!isBalanced && itemsTotal > 0 && (
                            <Button 
                                variant="secondary" 
                                className="bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 shadow-sm"
                                onClick={handleDistributeDiscount}
                            >
                                <Calculator size={18} className="mr-2"/>
                                Cuadrar Diferencia
                            </Button>
                        )}

                        <Button 
                            onClick={handleSubmit} 
                            disabled={isSubmitting || items.length === 0} 
                            className={`shadow-md px-6 ${isBalanced ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-700'}`}
                        >
                            {isSubmitting ? 'Guardando...' : 'Confirmar Ingreso'} <Save size={18} className="ml-2"/>
                        </Button>
                    </div>
                </div>
            </div>

            {/* MODAL DE ALTA RÁPIDA */}
            {showNewMaterialModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4">
                    <form onSubmit={handleSaveNewMaterial} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                <Package className="text-indigo-600" size={20}/> Alta Rápida de Material
                            </h3>
                            <button type="button" onClick={() => setShowNewMaterialModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20}/>
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 mb-1">SKU *</label>
                                    <Input required placeholder="Ej. HER-01" value={newMaterial.sku} onChange={e => setNewMaterial({...newMaterial, sku: e.target.value})}/>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Nombre *</label>
                                    <Input required value={newMaterial.name} onChange={e => setNewMaterial({...newMaterial, name: e.target.value})}/>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Categoría</label>
                                    <select className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:border-indigo-500"
                                        value={newMaterial.category} onChange={e => setNewMaterial({...newMaterial, category: e.target.value})}>
                                        <option value="Tableros">Tableros</option>
                                        <option value="Cubrecantos">Cubrecantos</option>
                                        <option value="Herrajes">Herrajes</option>
                                        <option value="Piedras">Piedras</option>
                                        <option value="Consumibles">Consumibles</option>
                                        <option value="Servicios">Servicios</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Ruta Producción</label>
                                    <select className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:border-indigo-500"
                                        value={newMaterial.production_route} onChange={e => setNewMaterial({...newMaterial, production_route: e.target.value})}>
                                        <option value="MATERIAL">Materia Prima Fija</option>
                                        <option value="CONSUMIBLE">Consumible (Gasto)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">U. Compra</label>
                                    <Input required placeholder="Ej. Caja" value={newMaterial.purchase_unit} onChange={e => setNewMaterial({...newMaterial, purchase_unit: e.target.value})}/>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">U. Uso</label>
                                    <Input required placeholder="Ej. Pieza" value={newMaterial.usage_unit} onChange={e => setNewMaterial({...newMaterial, usage_unit: e.target.value})}/>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Factor Conv.</label>
                                    <Input type="number" step="0.01" required value={newMaterial.conversion_factor} onChange={e => setNewMaterial({...newMaterial, conversion_factor: Number(e.target.value)})}/>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <Button type="button" variant="secondary" onClick={() => setShowNewMaterialModal(false)}>Cancelar</Button>
                            <Button type="submit" disabled={isSavingMaterial} className="bg-indigo-600">
                                {isSavingMaterial ? 'Guardando...' : 'Guardar y Usar'}
                            </Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default InventoryReceptionPage;