import { useState } from 'react';
import { useProviders, Provider } from '../hooks/useProviders';
import { Plus, Search, Edit, Trash2, X, Phone, Mail, User, Building2 } from 'lucide-react';

// 1. IMPORTAR BOTÓN DE EXPORTACIÓN
import ExportButton from '../../../components/ui/ExportButton';

export default function ProvidersPage() {
  const { providers, loading, createProvider, updateProvider, deleteProvider } = useProviders();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const initialForm: Provider = { 
    business_name: '', 
    rfc_tax_id: '', 
    credit_days: 0,
    contact_name: '',
    email: '',
    phone: ''
  };
  const [formData, setFormData] = useState<Provider>(initialForm);

  // --- 2. CONFIGURACIÓN DEL REPORTE EXCEL ---
  const mapProvidersForExcel = (p: Provider) => ({
      "ID Sistema": p.id,
      "Empresa / Razón Social": p.business_name,
      "RFC": p.rfc_tax_id || 'N/A',
      "Días Crédito": p.credit_days || 0,
      "Contacto": p.contact_name || '',
      "Teléfono": p.phone || '',
      "Email": p.email || ''
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData(initialForm);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (prov: Provider) => {
    setEditingId(prov.id!);
    setFormData({
        ...prov,
        contact_name: prov.contact_name || '',
        email: prov.email || '',
        phone: prov.phone || '',
        rfc_tax_id: prov.rfc_tax_id || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = editingId 
      ? await updateProvider(editingId, formData)
      : await createProvider(formData);

    if (result.success) setIsModalOpen(false);
    else alert(result.error);
  };

  const filteredProviders = providers.filter(p => 
    p.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.rfc_tax_id && p.rfc_tax_id.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Directorio de Proveedores</h1>
          <p className="text-sm text-slate-500">Gestión de socios comerciales y cuentas por pagar.</p>
        </div>
        
        {/* 3. BOTONERA DE ACCIÓN */}
        <div className="flex gap-3">
            <ExportButton 
                data={providers} 
                fileName="Reporte_Proveedores" 
                mapping={mapProvidersForExcel}
            />
            
            <button 
                onClick={handleOpenCreate}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition-all"
            >
                <Plus size={16} />
                Nuevo Proveedor
            </button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por Empresa o RFC..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 outline-none"
          />
        </div>
      </div>

      {/* TABLA DE DATOS */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Empresa</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contacto</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">RFC</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                 <tr><td colSpan={4} className="p-8 text-center text-slate-400">Cargando directorio...</td></tr>
              ) : filteredProviders.length === 0 ? (
                 <tr>
                    <td colSpan={4} className="p-12 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                            <Building2 size={48} className="mb-4 opacity-20" />
                            <p>No se encontraron proveedores.</p>
                        </div>
                    </td>
                 </tr>
              ) : (
                filteredProviders.map((prov) => (
                  <tr key={prov.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                        <div className="flex flex-col">
                            <span className="font-bold text-slate-900 text-sm">{prov.business_name}</span>
                            <span className="text-xs text-slate-500">Crédito: {prov.credit_days} días</span>
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                            {prov.contact_name && (
                                <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
                                    <User size={12} className="text-slate-400"/> {prov.contact_name}
                                </span>
                            )}
                            {prov.phone && (
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                    <Phone size={10} /> {prov.phone}
                                </span>
                            )}
                            {prov.email && (
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                    <Mail size={10} /> {prov.email}
                                </span>
                            )}
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                            {prov.rfc_tax_id || 'N/A'}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                        <button 
                            onClick={() => handleOpenEdit(prov)} 
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Editar Proveedor"
                        >
                            <Edit size={18} />
                        </button>
                        <button 
                            onClick={() => deleteProvider(prov.id!)} 
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Eliminar Proveedor"
                        >
                            <Trash2 size={18} />
                        </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL / FORMULARIO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800">
                        {editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                    </h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* SECCIÓN DATOS EMPRESARIALES */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre Comercial / Empresa *</label>
                        <input 
                            required autoFocus
                            type="text" 
                            className="input-std"
                            placeholder="Ej. Maderas del Sur"
                            value={formData.business_name}
                            onChange={e => setFormData({...formData, business_name: e.target.value})}
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">RFC / Tax ID *</label>
                            <input 
                                required
                                type="text" 
                                className="input-std font-mono uppercase"
                                placeholder="XAXX010101000"
                                value={formData.rfc_tax_id}
                                onChange={e => setFormData({...formData, rfc_tax_id: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Días Crédito</label>
                            <input 
                                type="number" min="0"
                                className="input-std"
                                value={formData.credit_days}
                                onChange={e => setFormData({...formData, credit_days: Number(e.target.value)})}
                            />
                        </div>
                    </div>

                    {/* SECCIÓN CONTACTO */}
                    <div className="pt-2 border-t border-slate-100">
                        <h4 className="text-xs font-bold text-indigo-600 uppercase mb-3 flex items-center gap-1">
                            Datos de Contacto
                        </h4>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Nombre Contacto</label>
                                <input 
                                    type="text" 
                                    className="input-std" 
                                    placeholder="Ej. Juan Pérez"
                                    value={formData.contact_name}
                                    onChange={e => setFormData({...formData, contact_name: e.target.value})}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Teléfono</label>
                                    <input 
                                        type="tel" 
                                        className="input-std" 
                                        placeholder="555-000-0000"
                                        value={formData.phone}
                                        onChange={e => setFormData({...formData, phone: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                                    <input 
                                        type="email" 
                                        className="input-std" 
                                        placeholder="contacto@empresa.com"
                                        value={formData.email}
                                        onChange={e => setFormData({...formData, email: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button 
                            type="button" 
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors"
                        >
                            Guardar
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      <style>{`
        .input-std {
            width: 100%;
            padding: 0.5rem 0.75rem;
            border: 1px solid #e2e8f0;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            outline: none;
            transition: all 0.2s;
        }
        .input-std:focus {
            ring: 2px;
            ring-color: #6366f1;
            border-color: #6366f1;
        }
      `}</style>
    </div>
  );
}