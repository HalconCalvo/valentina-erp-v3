import { useState } from 'react';
import { useClients, Client } from '../hooks/useClients';
import { 
  Plus, User, Mail, Phone, 
  Smartphone, FileText, X, Pencil, Trash2, Users, Building2 
} from 'lucide-react';

import ExportButton from '../../../components/ui/ExportButton';

export default function ClientsPage() {
  const { clients, loading, createClient, updateClient, deleteClient } = useClients();
  
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false); 
  const [activeTab, setActiveTab] = useState<'general' | 'contacts'>('general');
  
  const initialForm: Client = { 
    id: undefined, 
    full_name: '', email: '', phone: '', rfc_tax_id: '',
    fiscal_address: '', notes: '',
    
    // Contacto 1
    contact_name: '', contact_phone: '', contact_dept: '',
    // Contacto 2
    contact2_name: '', contact2_phone: '', contact2_dept: '',
    // Contacto 3
    contact3_name: '', contact3_phone: '', contact3_dept: '',
    // Contacto 4
    contact4_name: '', contact4_phone: '', contact4_dept: '',
  };
  
  const [form, setForm] = useState<Client>(initialForm);

  // --- CONFIGURACIÓN REPORTE EXCEL (COMPLETO) ---
  const mapClientsForExcel = (c: Client) => ({
      "ID": c.id,
      "Cliente": c.full_name,
      "RFC": c.rfc_tax_id || 'N/A',
      "Email": c.email,
      "Teléfono Ofic.": c.phone,
      
      "C1 Nombre": c.contact_name || '',
      "C1 Depto": c.contact_dept || '',
      "C1 Tel": c.contact_phone || '',

      "C2 Nombre": c.contact2_name || '',
      "C2 Depto": c.contact2_dept || '',
      "C2 Tel": c.contact2_phone || '',

      "C3 Nombre": c.contact3_name || '',
      "C3 Depto": c.contact3_dept || '',
      "C3 Tel": c.contact3_phone || '',

      "C4 Nombre": c.contact4_name || '',
      "C4 Depto": c.contact4_dept || '',
      "C4 Tel": c.contact4_phone || '',
      
      "Observaciones": c.notes || ''
  });

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
      setActiveTab('general');
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
      setActiveTab('general');
  };

  // Helper para renderizar bloques de contacto
  const renderContactFields = (num: number, label: string) => {
      // Truco dinámico para acceder a propiedades contact2_name, contact3_name, etc.
      const suffix = num === 1 ? '' : num;
      
      const getName = () => (form as any)[`contact${suffix}_name`] || '';
      const getPhone = () => (form as any)[`contact${suffix}_phone`] || '';
      const getDept = () => (form as any)[`contact${suffix}_dept`] || '';

      const setName = (val: string) => setForm({...form, [`contact${suffix}_name`]: val});
      const setPhone = (val: string) => setForm({...form, [`contact${suffix}_phone`]: val});
      const setDept = (val: string) => setForm({...form, [`contact${suffix}_dept`]: val});

      return (
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase flex items-center gap-1">
                  <User size={12}/> {label}
              </h4>
              <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-5">
                      <input placeholder="Nombre Completo" className="input-mini" value={getName()} onChange={e => setName(e.target.value)} />
                  </div>
                  <div className="col-span-4">
                      <input placeholder="Teléfono / Celular" className="input-mini" value={getPhone()} onChange={e => setPhone(e.target.value)} />
                  </div>
                  <div className="col-span-3">
                      <input placeholder="Depto." className="input-mini" value={getDept()} onChange={e => setDept(e.target.value)} />
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold text-slate-900">Cartera de Clientes</h1>
            <p className="text-sm text-slate-500">Gestión comercial y agenda de contactos.</p>
        </div>
        
        <div className="flex gap-3">
            <ExportButton data={clients} fileName="Cartera_Clientes_Completa" mapping={mapClientsForExcel}/>
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
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Contacto Principal</th>
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

                {clients.map(c => {
                    // Contar contactos extra
                    const extras = [c.contact2_name, c.contact3_name, c.contact4_name].filter(Boolean).length;

                    return (
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
                                        <div className="flex gap-2 text-xs text-slate-500">
                                            {c.contact_dept && <span className="bg-slate-100 px-1 rounded">{c.contact_dept}</span>}
                                            {c.contact_phone && <span>{c.contact_phone}</span>}
                                        </div>
                                        {extras > 0 && (
                                            <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 w-fit px-1.5 rounded-full mt-1">
                                                +{extras} Contactos más
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
                                    <button onClick={() => handleEdit(c)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Editar / Ver Contactos">
                                        <Pencil size={16} />
                                    </button>
                                    <button onClick={() => c.id && handleDelete(c.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Eliminar">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
      </div>

      {/* MODAL AVANZADO CON PESTAÑAS */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl animate-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header Modal */}
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-white">
                    <h2 className="text-lg font-bold text-slate-800">
                        {isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}
                    </h2>
                    <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                </div>
                
                {/* Tabs */}
                <div className="flex border-b border-slate-200 bg-slate-50">
                    <button 
                        onClick={() => setActiveTab('general')}
                        className={`flex-1 py-3 text-sm font-bold flex justify-center items-center gap-2 border-b-2 transition-colors ${activeTab === 'general' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <Building2 size={16}/> Datos Empresa
                    </button>
                    <button 
                        onClick={() => setActiveTab('contacts')}
                        className={`flex-1 py-3 text-sm font-bold flex justify-center items-center gap-2 border-b-2 transition-colors ${activeTab === 'contacts' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <Users size={16}/> Agenda de Contactos (4)
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 bg-white">
                    
                    {/* PESTAÑA 1: GENERAL */}
                    {activeTab === 'general' && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div>
                                <label className="label-std">Razón Social / Nombre Cliente *</label>
                                <input required className="input-std" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label-std">RFC</label>
                                    <input className="input-std" value={form.rfc_tax_id || ''} onChange={e => setForm({...form, rfc_tax_id: e.target.value})} />
                                </div>
                                <div>
                                    <label className="label-std">Teléfono Oficina *</label>
                                    <input required className="input-std" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
                                </div>
                            </div>

                            <div>
                                <label className="label-std">Email Facturación / General *</label>
                                <input type="email" required className="input-std" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                            </div>

                            <div>
                                <label className="label-std">Dirección Fiscal</label>
                                <input className="input-std" value={form.fiscal_address || ''} onChange={e => setForm({...form, fiscal_address: e.target.value})} />
                            </div>

                            <div>
                                <label className="label-std">Observaciones Generales</label>
                                <textarea className="input-std min-h-[80px]" value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} />
                            </div>
                        </div>
                    )}

                    {/* PESTAÑA 2: CONTACTOS */}
                    {activeTab === 'contacts' && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg mb-4 text-xs text-indigo-800 flex gap-2">
                                <Users size={14} className="mt-0.5"/>
                                <p>Puedes registrar hasta 4 contactos clave para este cliente. Asegúrate de llenar al menos el Contacto Principal.</p>
                            </div>

                            {renderContactFields(1, "Contacto Principal (Obligatorio)")}
                            {renderContactFields(2, "Contacto Adicional 2")}
                            {renderContactFields(3, "Contacto Adicional 3")}
                            {renderContactFields(4, "Contacto Adicional 4")}
                        </div>
                    )}

                </form>

                {/* Footer Modal */}
                <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
                    <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600 font-medium transition-colors">Cancelar</button>
                    <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm transition-colors">
                        {isEditing ? 'Guardar Cambios' : 'Crear Cliente'}
                    </button>
                </div>
            </div>
        </div>
      )}
      
      <style>{`
        .input-std { width: 100%; padding: 0.6rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.875rem; outline: none; transition: border-color 0.2s; }
        .input-std:focus { border-color: #6366f1; ring: 1px; }
        .input-mini { width: 100%; padding: 0.4rem; border: 1px solid #e2e8f0; border-radius: 0.3rem; font-size: 0.75rem; outline: none; }
        .input-mini:focus { border-color: #6366f1; }
        .label-std { display: block; font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 0.25rem; }
      `}</style>
    </div>
  );
}