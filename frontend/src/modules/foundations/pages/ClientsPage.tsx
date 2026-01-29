import { useState } from 'react';
import { useClients, Client } from '../hooks/useClients';
import { 
  Plus, User, Mail, Phone, 
  Smartphone, FileText, X, Pencil, Trash2 
} from 'lucide-react';

// 1. IMPORTAR EL BOTÓN DE EXPORTACIÓN
import ExportButton from '../../../components/ui/ExportButton';

export default function ClientsPage() {
  const { clients, loading, createClient, updateClient, deleteClient } = useClients();
  
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false); 
  
  const initialForm: Client = { 
    id: undefined, 
    full_name: '', email: '', phone: '', rfc_tax_id: '',
    contact_name: '', contact_phone: '', notes: '',
    fiscal_address: '' 
  };
  
  const [form, setForm] = useState<Client>(initialForm);

  // --- 2. CONFIGURACIÓN DEL REPORTE EXCEL ---
  // Esto define qué columnas salen en el Excel y con qué nombre
  const mapClientsForExcel = (c: Client) => ({
      "ID Sistema": c.id,
      "Razón Social / Cliente": c.full_name,
      "RFC": c.rfc_tax_id || 'N/A',
      "Email": c.email,
      "Teléfono": c.phone,
      "Dirección Fiscal": c.fiscal_address || '',
      "Nombre Contacto": c.contact_name || '',
      "Celular Contacto": c.contact_phone || '',
      "Observaciones": c.notes || ''
  });

  // --- LÓGICA DE GUARDADO ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let res;
    if (isEditing && form.id) {
        res = await updateClient(form.id, form);
    } else {
        res = await createClient(form);
    }

    if (res && res.success) {
        closeModal();
    } else {
        alert(res ? res.error : "Error desconocido");
    }
  };

  const handleEdit = (client: Client) => {
      setForm(client); 
      setIsEditing(true);
      setShowModal(true);
  };

  const handleDelete = async (id: number) => {
      if (window.confirm('¿Estás seguro de eliminar este cliente?')) {
          await deleteClient(id);
      }
  };

  const closeModal = () => {
      setShowModal(false);
      setForm(initialForm);
      setIsEditing(false);
  };

  return (
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold text-slate-900">Cartera de Clientes</h1>
            <p className="text-sm text-slate-500">Gestión comercial y contactos.</p>
        </div>
        
        {/* 3. BOTONERA DE ACCIÓN */}
        <div className="flex gap-3">
            <ExportButton 
                data={clients} 
                fileName="Reporte_Clientes" 
                mapping={mapClientsForExcel}
            />
            
            <button 
                onClick={() => { setIsEditing(false); setForm(initialForm); setShowModal(true); }} 
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium shadow-sm"
            >
                <Plus size={18} /> Nuevo Cliente
            </button>
        </div>
      </div>

      {/* TABLA DE CLIENTES */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Cliente / Empresa</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Contacto Directo</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Comunicación</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Observaciones</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Acciones</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-400">Cargando cartera...</td></tr> : null}
                
                {clients.length === 0 && !loading && (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">No hay clientes registrados.</td></tr>
                )}

                {clients.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                            <div className="font-bold text-slate-800">{c.full_name}</div>
                            <div className="text-xs font-mono text-slate-500">{c.rfc_tax_id || 'Sin RFC'}</div>
                        </td>
                        <td className="p-4">
                            {c.contact_name ? (
                                <div className="flex flex-col gap-1">
                                    <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
                                        <User size={12} className="text-indigo-500"/> {c.contact_name}
                                    </span>
                                    {c.contact_phone && (
                                        <span className="text-xs text-slate-500 flex items-center gap-1">
                                            <Smartphone size={10} /> {c.contact_phone}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <span className="text-xs text-slate-300 italic">No especificado</span>
                            )}
                        </td>
                        <td className="p-4">
                            <div className="flex flex-col gap-1 text-sm text-slate-600">
                                <span className="flex items-center gap-2 text-xs"><Mail size={12}/> {c.email}</span>
                                <span className="flex items-center gap-2 text-xs"><Phone size={12}/> {c.phone}</span>
                            </div>
                        </td>
                        <td className="p-4">
                            {c.notes ? (
                                <div className="text-xs text-slate-500 max-w-xs truncate" title={c.notes}>
                                    <FileText size={10} className="inline mr-1"/>
                                    {c.notes}
                                </div>
                            ) : '-'}
                        </td>
                        <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                                <button 
                                    onClick={() => handleEdit(c)}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                    title="Editar"
                                >
                                    <Pencil size={16} />
                                </button>
                                <button 
                                    onClick={() => c.id && handleDelete(c.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                    title="Eliminar"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl animate-in zoom-in duration-200">
                <div className="flex justify-between items-center p-5 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800">
                        {isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}
                    </h2>
                    <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Datos Fiscales / Empresa</h3>
                        <div>
                            <input placeholder="Nombre del Cliente / Razón Social *" required className="input-std" 
                                value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <input placeholder="RFC (Opcional)" className="input-std" 
                                value={form.rfc_tax_id || ''} onChange={e => setForm({...form, rfc_tax_id: e.target.value})} />
                            <input placeholder="Teléfono Oficina *" required className="input-std" 
                                value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
                        </div>
                        <input placeholder="Email General *" type="email" required className="input-std" 
                            value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                        <input placeholder="Dirección Fiscal (Opcional)" className="input-std" 
                            value={form.fiscal_address || ''} onChange={e => setForm({...form, fiscal_address: e.target.value})} />
                    </div>

                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Contacto Directo</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <input placeholder="Nombre Contacto (Ej. Juan)" className="input-std" 
                                value={form.contact_name || ''} onChange={e => setForm({...form, contact_name: e.target.value})} />
                            <input placeholder="Celular Contacto" className="input-std" 
                                value={form.contact_phone || ''} onChange={e => setForm({...form, contact_phone: e.target.value})} />
                        </div>
                    </div>

                    <div className="pt-2">
                        <textarea placeholder="Observaciones..." className="input-std min-h-[80px]" 
                            value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} />
                    </div>
                    
                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 font-medium">Cancelar</button>
                        <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm">
                            {isEditing ? 'Guardar Cambios' : 'Crear Cliente'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
      <style>{`.input-std { width: 100%; padding: 0.6rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.875rem; outline: none; transition: border-color 0.2s; } .input-std:focus { border-color: #6366f1; ring: 1px; }`}</style>
    </div>
  );
}