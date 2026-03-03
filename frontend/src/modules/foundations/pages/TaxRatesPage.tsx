import React, { useState } from 'react';
import { useFoundations } from '../hooks/useFoundations';
import { Percent, Plus, Power, CheckCircle, XCircle, Pencil, Trash2 } from 'lucide-react';

export default function TaxRatesPage() {
  // NOTA: Agregamos updateTaxRate y deleteTaxRate a la desestructuración del hook
  const { taxRates, createTaxRate, updateTaxRate, deleteTaxRate, toggleTaxRate, loading } = useFoundations();
  const [showForm, setShowForm] = useState(false);
  
  // Estado formulario
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [rateStr, setRateStr] = useState('');

  const resetForm = () => {
    setName('');
    setRateStr('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleEditClick = (tax: any) => {
    setEditingId(tax.id);
    setName(tax.name);
    setRateStr((tax.rate * 100).toString()); // Convertimos el decimal de vuelta a porcentaje para editar
    setShowForm(true);
  };

  const handleDeleteClick = async (id: number) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar este impuesto? Esta acción lo ocultará del sistema.")) {
        const res = await deleteTaxRate(id);
        if (res?.success) {
            alert("Impuesto eliminado correctamente.");
        } else {
            alert("Error al eliminar: " + (res?.error || "Desconocido"));
        }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Validar inputs visualmente
    if (!name) return alert("El campo Nombre está vacío");
    if (!rateStr) return alert("El campo Tasa está vacío");
    
    // 2. Diagnóstico de conversión
    const rateDecimal = parseFloat(rateStr) / 100;
    
    try {
        // 3. Llamada dinámica (Crear o Actualizar)
        let res;
        if (editingId) {
            res = await updateTaxRate(editingId, name, rateDecimal);
        } else {
            res = await createTaxRate(name, rateDecimal);
        }

        if (res.success) {
            alert("¡Guardado correctamente!");
            resetForm();
        } else {
            alert("Error del Backend: " + (res.error || "Desconocido")); 
        }
    } catch (error) {
        alert("Error Crítico en Frontend: " + error);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Percent className="text-blue-600"/> Catálogo de Impuestos
          </h1>
          <p className="text-slate-500 text-sm">Define las tasas de IVA aplicables (0%, 8%, 16%, etc).</p>
        </div>
        <button 
            onClick={() => {
                resetForm();
                setShowForm(true);
            }}
            className="btn-primary bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm font-bold"
        >
            <Plus size={18} /> Nuevo Impuesto
        </button>
      </div>

      {/* FORMULARIO */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-6 animate-in slide-in-from-top-2 relative">
            {/* Botón para cerrar el formulario */}
            <button 
                onClick={resetForm} 
                className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
            >
                <XCircle size={20} />
            </button>
            <form onSubmit={handleSubmit} className="flex gap-4 items-end mt-2">
                <div className="flex-1">
                    <label className="text-xs font-bold text-blue-800 uppercase mb-1 block">
                        {editingId ? "Editando Etiqueta" : "Nombre Etiqueta"}
                    </label>
                    <input 
                        autoFocus
                        placeholder="Ej. IVA General" 
                        className="w-full p-2 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-200"
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                </div>
                <div className="w-32">
                    <label className="text-xs font-bold text-blue-800 uppercase mb-1 block">Tasa (%)</label>
                    <input 
                        type="number" 
                        placeholder="16" 
                        className="w-full p-2 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-200 text-center font-bold"
                        value={rateStr}
                        onChange={e => setRateStr(e.target.value)}
                    />
                </div>
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700">
                    {editingId ? "Actualizar" : "Guardar"}
                </button>
            </form>
        </div>
      )}

      {/* LISTA */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Nombre</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Tasa Decimal</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Tasa %</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Estado</th>
                    <th className="px-6 py-4 text-right">Acción</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-400">Cargando...</td></tr> : 
                 taxRates.map((tax: any) => (
                    <tr key={tax.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-700">{tax.name}</td>
                        <td className="px-6 py-4 text-center font-mono text-slate-500">{tax.rate}</td>
                        <td className="px-6 py-4 text-center">
                            <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-bold border border-slate-200">
                                {(tax.rate * 100).toFixed(0)}%
                            </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                            {tax.is_active ? (
                                <span className="inline-flex items-center gap-1 text-xs text-green-600 font-bold bg-green-50 px-2 py-1 rounded-full border border-green-100">
                                    <CheckCircle size={12}/> Activo
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-bold bg-slate-100 px-2 py-1 rounded-full border border-slate-200">
                                    <XCircle size={12}/> Inactivo
                                </span>
                            )}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                            <button 
                                onClick={() => handleEditClick(tax)}
                                className="p-2 rounded hover:bg-slate-100 transition-colors text-blue-600"
                                title="Editar"
                            >
                                <Pencil size={18}/>
                            </button>
                            <button 
                                onClick={() => handleDeleteClick(tax.id)}
                                className="p-2 rounded hover:bg-slate-100 transition-colors text-red-600"
                                title="Eliminar"
                            >
                                <Trash2 size={18}/>
                            </button>
                            <button 
                                onClick={() => toggleTaxRate(tax.id)}
                                className={`p-2 rounded hover:bg-slate-100 transition-colors ${tax.is_active ? 'text-slate-400 hover:text-red-500' : 'text-slate-400 hover:text-green-600'}`}
                                title={tax.is_active ? "Desactivar" : "Activar"}
                            >
                                <Power size={18}/>
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
}