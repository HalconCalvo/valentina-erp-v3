import React, { useState } from 'react';
import { useFoundations } from '../hooks/useFoundations';
import { Percent, Plus, Power, CheckCircle, XCircle } from 'lucide-react';

export default function TaxRatesPage() {
  const { taxRates, createTaxRate, toggleTaxRate, loading } = useFoundations();
  const [showForm, setShowForm] = useState(false);
  
  // Estado formulario
  const [name, setName] = useState('');
  const [rateStr, setRateStr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Validar inputs visualmente
    if (!name) return alert("El campo Nombre está vacío");
    if (!rateStr) return alert("El campo Tasa está vacío");
    
    // 2. Diagnóstico de conversión
    const rateDecimal = parseFloat(rateStr) / 100;
    console.log("Enviando datos:", { name, rateDecimal }); // Mira la consola (F12)
    
    try {
        // 3. Llamada e impresión de respuesta
        const res = await createTaxRate(name, rateDecimal);
        console.log("Respuesta del Hook:", res);

        if (res.success) {
            alert("¡Guardado correctamente!"); // Confirmación de éxito
            setName('');
            setRateStr('');
            setShowForm(false);
        } else {
            // 4. Mostrar el error REAL que devuelve el hook
            alert("Error del Backend: " + (res.error || "Desconocido")); 
        }
    } catch (error) {
        // 5. Capturar errores de red o javascript
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
            onClick={() => setShowForm(!showForm)}
            className="btn-primary bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm font-bold"
        >
            <Plus size={18} /> Nuevo Impuesto
        </button>
      </div>

      {/* FORMULARIO */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-6 animate-in slide-in-from-top-2">
            <form onSubmit={handleSubmit} className="flex gap-4 items-end">
                <div className="flex-1">
                    <label className="text-xs font-bold text-blue-800 uppercase mb-1 block">Nombre Etiqueta</label>
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
                    Guardar
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
                 taxRates.map(tax => (
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
                        <td className="px-6 py-4 text-right">
                            <button 
                                onClick={() => toggleTaxRate(tax.id)}
                                className={`p-2 rounded hover:bg-slate-100 transition-colors ${tax.is_active ? 'text-red-500' : 'text-green-600'}`}
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