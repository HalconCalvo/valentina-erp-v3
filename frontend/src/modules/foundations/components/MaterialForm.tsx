import React, { useState } from 'react';
import axiosClient from '../../../api/axios-client';

interface MaterialFormProps {
    initialSku?: string;
    onCreated: (material: any) => void;  // recibe el material creado (con id)
    onCancel: () => void;
}

const ROUTES = [
    { value: 'MATERIAL', label: 'MATERIAL (Inventariable)' },
    { value: 'PROCESO', label: 'PROCESO (Interno)' },
    { value: 'CONSUMIBLE', label: 'CONSUMIBLE (Gasto)' },
    { value: 'SERVICIO', label: 'SERVICIO (Externo)' },
];

export const MaterialForm: React.FC<MaterialFormProps> = ({ initialSku = '', onCreated, onCancel }) => {
    const [form, setForm] = useState<any>({
        sku: initialSku,
        name: '',
        category: '',
        production_route: 'MATERIAL',
        purchase_unit: '',
        usage_unit: '',
        conversion_factor: 1,
        current_cost: 0,
        min_stock: 0,
        max_stock: 0,
        associated_element_sku: '',
        provider_id: 0,
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const upd = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

    const handleSave = async () => {
        if (!form.sku?.trim() || !form.name?.trim() || !form.category?.trim()) {
            setError('SKU, Nombre y Categoría son obligatorios.');
            return;
        }
        if (!form.purchase_unit?.trim() || !form.usage_unit?.trim()) {
            setError('Unidad de compra y de uso son obligatorias.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const payload = {
                ...form,
                sku: form.sku.trim(),
                name: form.name.trim(),
                associated_element_sku: form.associated_element_sku?.trim() === '' ? null : form.associated_element_sku,
                provider_id: form.provider_id === 0 ? null : form.provider_id,
            };
            const res = await axiosClient.post('/foundations/materials', payload);
            onCreated(res.data);  // el material creado, con id
        } catch (err: any) {
            setError(err.response?.data?.detail || 'No se pudo crear el material.');
        } finally {
            setSaving(false);
        }
    };

    const inputCls = "w-full text-xs border border-slate-200 rounded px-2 py-2 outline-none focus:border-indigo-500";
    const labelCls = "text-[10px] font-black text-slate-400 uppercase block mb-1";

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-auto">
                <h3 className="font-black text-slate-800 text-sm uppercase mb-4">Alta de material nuevo</h3>
                {error && <div className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">{error}</div>}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelCls}>SKU (único) *</label>
                        <input className={inputCls} value={form.sku} onChange={e => upd({ sku: e.target.value })} placeholder="Ej. TAB-BL-15" />
                    </div>
                    <div>
                        <label className={labelCls}>Nombre / Descripción *</label>
                        <input className={inputCls} value={form.name} onChange={e => upd({ name: e.target.value })} placeholder="Ej. MDF Blanco 15mm" />
                    </div>
                    <div>
                        <label className={labelCls}>Categoría *</label>
                        <input className={inputCls} value={form.category} onChange={e => upd({ category: e.target.value })} placeholder="Ej. Tableros" />
                    </div>
                    <div>
                        <label className={labelCls}>Ruta Producción *</label>
                        <select className={inputCls} value={form.production_route} onChange={e => upd({ production_route: e.target.value })}>
                            {ROUTES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Unidad Compra *</label>
                        <input className={inputCls} value={form.purchase_unit} onChange={e => upd({ purchase_unit: e.target.value, usage_unit: form.usage_unit || e.target.value })} placeholder="Ej. Hoja" />
                    </div>
                    <div>
                        <label className={labelCls}>Unidad Uso *</label>
                        <input className={inputCls} value={form.usage_unit} onChange={e => upd({ usage_unit: e.target.value })} placeholder="Ej. m2" />
                    </div>
                    <div>
                        <label className={labelCls}>Factor Conversión</label>
                        <input type="number" step="0.01" className={inputCls} value={form.conversion_factor} onChange={e => upd({ conversion_factor: parseFloat(e.target.value) || 1 })} />
                    </div>
                    <div>
                        <label className={labelCls}>Costo Unitario</label>
                        <input type="number" step="0.01" className={inputCls} value={form.current_cost} onChange={e => upd({ current_cost: parseFloat(e.target.value) || 0 })} />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-5">
                    <button type="button" onClick={onCancel} className="text-xs font-black uppercase px-4 py-2 text-slate-500 hover:text-slate-700">Cancelar</button>
                    <button type="button" onClick={handleSave} disabled={saving} className="text-xs font-black uppercase px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50">
                        {saving ? 'Guardando...' : 'Crear y usar'}
                    </button>
                </div>
            </div>
        </div>
    );
};
