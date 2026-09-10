import { useState, useRef, useMemo } from 'react';
import { useProviders } from '../hooks/useProviders';
import { Provider } from '../../../types/foundations';
import { Plus, Search, X, Phone, Mail, User, Building2, Smartphone, Upload } from 'lucide-react';

// 1. IMPORTAR BOTÓN DE EXPORTACIÓN
import ExportButton from '@/components/ui/ExportButton';
import { Input } from '@/components/ui/Input';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { TableActionCancelIcon, TableActionEditIcon } from '@/lib/tableActionIcons';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { toast } from '@/components/ui/VToast';

export default function ProvidersPage() {
  const { providers, loading, createProvider, updateProvider, deleteProvider } = useProviders();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  
  const initialForm: Provider = { 
    business_name: '', 
    rfc_tax_id: '', 
    credit_days: 0,
    email: '',
    phone: '',
    phone2: '',
    contact_name: '',
    contact_email: '',
    contact_cellphone: '',
    is_active: true
  };
  const [formData, setFormData] = useState<Provider>(initialForm);

  // --- 2. CONFIGURACIÓN DEL REPORTE EXCEL ---
  const mapProvidersForExcel = (p: Provider) => ({
      "ID Sistema": p.id,
      "Razón Social / Empresa": p.business_name,
      "RFC": p.rfc_tax_id || 'N/A',
      "Días Crédito": p.credit_days || 0,
      "Correo Empresa": p.email || '',
      "Tel. Empresa 1": p.phone || '',
      "Tel. Empresa 2": p.phone2 || '',
      "Asesor / Contacto": p.contact_name || '',
      "Celular Contacto": p.contact_cellphone || '',
      "Correo Contacto": p.contact_email || ''
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
        rfc_tax_id: prov.rfc_tax_id || '',
        email: prov.email || '',
        phone: prov.phone || '',
        phone2: prov.phone2 || '',
        contact_name: prov.contact_name || '',
        contact_email: prov.contact_email || '',
        contact_cellphone: prov.contact_cellphone || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = editingId 
      ? await updateProvider(editingId, formData)
      : await createProvider(formData);

    if (result.success) {
      toast.success(editingId ? 'Proveedor actualizado correctamente.' : 'Proveedor creado correctamente.');
      setIsModalOpen(false);
    } else {
      toast.error(result.error || 'Error al guardar el proveedor.');
    }
  };

  const filteredProviders = providers.filter(p => 
    p.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.rfc_tax_id && p.rfc_tax_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.contact_name && p.contact_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const providerColumns = useMemo((): VTableColumn<Provider>[] => [
    {
      key: 'business_name',
      label: 'Empresa & Condiciones',
      render: (prov) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-800 text-sm">{prov.business_name}</span>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${prov.credit_days > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
              {prov.credit_days > 0 ? `Crédito: ${prov.credit_days} días` : 'Pago de Contado'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'contact_name',
      label: 'Información de Contacto',
      render: (prov) => (
        <div className="grid grid-cols-1 gap-1 text-xs">
          {prov.contact_name && (
            <span className="font-bold text-slate-700 flex items-center gap-1.5 mb-1">
              <User size={12} className="text-slate-400" /> {prov.contact_name}
            </span>
          )}
          {prov.contact_cellphone && (
            <span className="text-slate-600 flex items-center gap-1.5">
              <Smartphone size={12} className="text-emerald-500" /> {prov.contact_cellphone}
            </span>
          )}
          {prov.contact_email && (
            <span className="text-slate-600 flex items-center gap-1.5">
              <Mail size={12} className="text-blue-500" /> {prov.contact_email}
            </span>
          )}
          {(prov.phone || prov.phone2) && (
            <div className="mt-2 pt-2 border-t border-slate-100 text-slate-500 flex items-center gap-1.5">
              <Building2 size={12} />
              {prov.phone} {prov.phone2 ? ` / ${prov.phone2}` : ''}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'rfc_tax_id',
      label: 'RFC',
      render: (prov) => (
        prov.rfc_tax_id ? (
          <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">
            {prov.rfc_tax_id}
          </span>
        ) : (
          <span className="text-xs text-slate-400 italic">No registrado</span>
        )
      ),
    },
  ], []);

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingCsv(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('token');
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      const res = await fetch(`${baseUrl}/foundations/providers/import-csv`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const result = await res.json();
      toast.success(
        `Importación completada: ${result.created} creados, ${result.updated} actualizados, ${result.errors?.length ?? 0} errores.`,
      );
      window.location.reload();
    } catch {
      toast.error('Error al importar el CSV.');
    } finally {
      setImportingCsv(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-24">
      <Input
        type="file"
        ref={csvInputRef}
        className="hidden"
        accept=".csv"
        onChange={handleCsvImport}
      />

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Directorio de Proveedores</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Gestión de socios comerciales, créditos y contactos de compra.</p>
        </div>
        
        {/* 3. BOTONERA DE ACCIÓN */}
        <div className="flex gap-3">
            <ExportButton 
                data={providers} 
                fileName="Reporte_Proveedores" 
                mapping={mapProvidersForExcel}
            />

            <button
                onClick={() => csvInputRef.current?.click()}
                disabled={importingCsv}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-sm transition-all transform hover:-translate-y-0.5 disabled:opacity-50"
            >
                <Upload size={18} />
                {importingCsv ? 'Importando...' : 'Importar CSV'}
            </button>
            
            <button 
                onClick={handleOpenCreate}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm transition-all transform hover:-translate-y-0.5"
            >
                <Plus size={18} />
                Nuevo Proveedor
            </button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder="Buscar por Empresa, RFC o Contacto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 text-sm text-slate-700 placeholder:text-slate-400 border-0 shadow-none focus-visible:ring-0 bg-transparent"
          />
        </div>
      </div>

      {/* TABLA DE DATOS */}
      <VTable
        columns={providerColumns as unknown as VTableColumn<Record<string, unknown>>[]}
        data={filteredProviders as unknown as Record<string, unknown>[]}
        isLoading={loading}
        emptyState={{
          icon: <Building2 size={40} strokeWidth={1} className="opacity-20" />,
          title: 'No se encontraron proveedores en el sistema.',
        }}
        className="shadow-xl"
        actions={(row) => {
          const prov = row as unknown as Provider;
          return [
            {
              label: '',
              title: 'Editar',
              icon: <TableActionEditIcon />,
              onClick: () => handleOpenEdit(prov),
            },
            {
              label: '',
              title: 'Cancelar',
              icon: <TableActionCancelIcon />,
              variant: 'danger' as const,
              onClick: () => setPendingDelete({ id: prov.id!, name: prov.business_name }),
            },
          ];
        }}
      />

      {/* MODAL / FORMULARIO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                        <Building2 className="text-indigo-500"/>
                        {editingId ? 'Editar Proveedor' : 'Alta de Nuevo Proveedor'}
                    </h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    
                    {/* SECCIÓN 1: DATOS EMPRESARIALES */}
                    <div>
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">1. Información de la Empresa</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Comercial o Razón Social *</label>
                                <Input
                                    required autoFocus
                                    type="text"
                                    className="input-std"
                                    placeholder="Ej. Maderas del Sur S.A. de C.V."
                                    value={formData.business_name}
                                    onChange={e => setFormData({...formData, business_name: e.target.value})}
                                />
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">RFC</label>
                                <Input
                                    type="text"
                                    className="input-std font-mono uppercase"
                                    placeholder="XAXX010101000"
                                    value={formData.rfc_tax_id}
                                    onChange={e => setFormData({...formData, rfc_tax_id: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Días de Crédito *</label>
                                <Input
                                    type="number" min="0" required
                                    className="input-std"
                                    placeholder="0 para pago de contado"
                                    value={formData.credit_days}
                                    onChange={e => setFormData({...formData, credit_days: Number(e.target.value)})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono Fijo / Conmutador</label>
                                <Input
                                    type="tel"
                                    className="input-std"
                                    placeholder="Ej. 55 1234 5678"
                                    value={formData.phone}
                                    onChange={e => setFormData({...formData, phone: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono Secundario</label>
                                <Input
                                    type="tel"
                                    className="input-std"
                                    placeholder="Opcional"
                                    value={formData.phone2}
                                    onChange={e => setFormData({...formData, phone2: e.target.value})}
                                />
                            </div>
                         </div>
                    </div>

                    {/* SECCIÓN 2: CONTACTO DIRECTO */}
                    <div>
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">2. Asesor o Contacto de Ventas</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Completo del Contacto</label>
                                <Input
                                    type="text"
                                    className="input-std"
                                    placeholder="Ej. Juan Pérez"
                                    value={formData.contact_name}
                                    onChange={e => setFormData({...formData, contact_name: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Celular / WhatsApp</label>
                                <Input
                                    type="tel"
                                    className="input-std"
                                    placeholder="Para enviar cotizaciones..."
                                    value={formData.contact_cellphone}
                                    onChange={e => setFormData({...formData, contact_cellphone: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Correo Electrónico (Email)</label>
                                <Input
                                    type="email"
                                    className="input-std"
                                    placeholder="juan@empresa.com"
                                    value={formData.contact_email}
                                    onChange={e => setFormData({...formData, contact_email: e.target.value})}
                                />
                            </div>
                         </div>
                    </div>

                    {/* BOTONERA */}
                    <div className="pt-4 flex justify-end gap-3 mt-8">
                        <button 
                            type="button" 
                            onClick={() => setIsModalOpen(false)}
                            className="px-6 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all transform hover:-translate-y-0.5"
                        >
                            {editingId ? 'Actualizar Proveedor' : 'Guardar Nuevo Proveedor'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      <style>{`
        .input-std {
            width: 100%;
            padding: 0.625rem 0.75rem;
            border: 1px solid #cbd5e1;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            color: #334155;
            background-color: #f8fafc;
            outline: none;
            transition: all 0.2s ease-in-out;
        }
        .input-std:focus {
            background-color: #ffffff;
            border-color: #6366f1;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        .input-std::placeholder {
            color: #94a3b8;
        }
      `}</style>

      <VConfirmDialog
        isOpen={pendingDelete !== null}
        title="Eliminar proveedor"
        message={pendingDelete ? `¿Estás seguro de eliminar a ${pendingDelete.name}?` : ''}
        consequence="El proveedor quedará dado de baja y no estará disponible para nuevas órdenes de compra."
        variant="danger"
        confirmLabel="Sí, eliminar"
        onConfirm={async () => {
          if (pendingDelete) {
            await deleteProvider(pendingDelete.id);
            toast.success('Proveedor eliminado correctamente.');
            setPendingDelete(null);
          }
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}