import { useState, useRef, useMemo } from 'react';
import { useClients, Client } from '../hooks/useClients';
import { 
  Plus, User, Mail, Phone, 
  FileText, Users, Building2, Upload, Search
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

import ExportButton from '@/components/ui/ExportButton';
import { Input } from '@/components/ui/Input';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { TableActionCancelIcon, TableActionEditIcon } from '@/lib/tableActionIcons';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { toast } from '@/components/ui/VToast';
import { RecordHistoryButton } from '@/components/audit/RecordHistoryButton';
import axiosClient from '@/api/axios-client';
import Modal from '@/components/ui/Modal';
import { matchesSearch } from '@/utils/search';

export default function ClientsPage() {
  const { clients, loading, createClient, updateClient, deleteClient } = useClients();
  
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false); 
  const [activeTab, setActiveTab] = useState<'general' | 'contacts'>('general');
  const [importingCsv, setImportingCsv] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  
  const initialForm: Client = { 
    id: undefined, 
    full_name: '', email: '', phone: '', rfc_tax_id: '',
    fiscal_address: '', notes: '',
    
    // Contacto 1
    contact_name: '', contact_phone: '', contact_dept: '', contact_email: '',
    // Contacto 2
    contact2_name: '', contact2_phone: '', contact2_dept: '', contact2_email: '',
    // Contacto 3
    contact3_name: '', contact3_phone: '', contact3_dept: '', contact3_email: '',
    // Contacto 4
    contact4_name: '', contact4_phone: '', contact4_dept: '', contact4_email: '',
  };
  
  const [form, setForm] = useState<Client>(initialForm);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Pilot 2/4 (Gabriel 19/10): on-screen search only; it never changes data
  const visibleClients = useMemo(() => clients.filter((c) => matchesSearch(
    searchTerm, c.full_name, c.rfc_tax_id, c.email, c.phone,
    c.contact_name, c.contact2_name, c.contact3_name, c.contact4_name,
    c.contact_email, c.contact2_email, c.contact3_email, c.contact4_email,
    c.contact_phone, c.contact2_phone, c.contact3_phone, c.contact4_phone,
  )), [clients, searchTerm]);

  // --- CONFIGURACIÓN REPORTE EXCEL (COMPLETO) ---
  const mapClientsForExcel = (c: Client) => ({
      "ID": c.id,
      "Cliente": c.full_name,
      "RFC": c.rfc_tax_id || 'N/A',
      "Email Empresa": c.email,
      "Teléfono Ofic.": c.phone,
      
      "C1 Nombre": c.contact_name || '',
      "C1 Depto": c.contact_dept || '',
      "C1 Tel": c.contact_phone || '',
      "C1 Email": c.contact_email || '',

      "C2 Nombre": c.contact2_name || '',
      "C2 Depto": c.contact2_dept || '',
      "C2 Tel": c.contact2_phone || '',
      "C2 Email": c.contact2_email || '',

      "C3 Nombre": c.contact3_name || '',
      "C3 Depto": c.contact3_dept || '',
      "C3 Tel": c.contact3_phone || '',
      "C3 Email": c.contact3_email || '',

      "C4 Nombre": c.contact4_name || '',
      "C4 Depto": c.contact4_dept || '',
      "C4 Tel": c.contact4_phone || '',
      "C4 Email": c.contact4_email || '',
      
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
        toast.error(res?.error || 'Error desconocido');
    }
  };

  const handleEdit = (client: Client) => {
      setForm(client); 
      setIsEditing(true);
      setActiveTab('general');
      setShowModal(true);
  };

  const handleDelete = (id: number) => {
      setPendingDeleteId(id);
  };

  const executeDelete = async (id: number) => {
      await deleteClient(id);
      setPendingDeleteId(null);
  };

  const closeModal = () => {
      setShowModal(false);
      setForm(initialForm);
      setIsEditing(false);
      setActiveTab('general');
  };

  // Helper para renderizar bloques de contacto (Ahora con Email)
  const renderContactFields = (num: number, label: string) => {
      const suffix = num === 1 ? '' : num;
      
      const getName = () => (form as any)[`contact${suffix}_name`] || '';
      const getPhone = () => (form as any)[`contact${suffix}_phone`] || '';
      const getDept = () => (form as any)[`contact${suffix}_dept`] || '';
      const getEmail = () => (form as any)[`contact${suffix}_email`] || '';

      const setName = (val: string) => setForm({...form, [`contact${suffix}_name`]: val});
      const setPhone = (val: string) => setForm({...form, [`contact${suffix}_phone`]: val});
      const setDept = (val: string) => setForm({...form, [`contact${suffix}_dept`]: val});
      const setEmail = (val: string) => setForm({...form, [`contact${suffix}_email`]: val});

      return (
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <h4 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
                  <User size={12}/> {label}
              </h4>
              <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 md:col-span-4">
                      <Input placeholder="Nombre Completo" className="input-mini h-8 text-xs" value={getName()} onChange={e => setName(e.target.value)} />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                      <Input placeholder="Teléfono / Cel." className="input-mini h-8 text-xs" value={getPhone()} onChange={e => setPhone(e.target.value)} />
                  </div>
                  <div className="col-span-6 md:col-span-5">
                      <Input placeholder="Correo Electrónico" type="email" className="input-mini h-8 text-xs" value={getEmail()} onChange={e => setEmail(e.target.value)} />
                  </div>
                  <div className="col-span-12">
                      <Input placeholder="Departamento o Puesto" className="input-mini h-8 text-xs" value={getDept()} onChange={e => setDept(e.target.value)} />
                  </div>
              </div>
          </div>
      );
  };

  const clientColumns = useMemo((): VTableColumn<Client>[] => [
    {
      key: 'full_name',
      label: 'Cliente / Empresa',
      render: (c) => (
        <div>
          <div className="font-bold text-slate-800">{c.full_name}</div>
          <div className="text-xs font-mono text-slate-500">{c.rfc_tax_id || 'Sin RFC'}</div>
        </div>
      ),
    },
    {
      key: 'contact_name',
      label: 'Contacto Principal',
      render: (c) => {
        const extras = [c.contact2_name, c.contact3_name, c.contact4_name].filter(Boolean).length;
        return c.contact_name ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
              <User size={12} className="text-indigo-500" /> {c.contact_name}
            </span>
            <div className="flex gap-2 text-xs text-slate-500">
              {c.contact_dept && <span className="bg-slate-100 px-1 rounded">{c.contact_dept}</span>}
              {c.contact_phone && <span>{c.contact_phone}</span>}
            </div>
            {c.contact_email && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Mail size={10} /> {c.contact_email}
              </span>
            )}
            {extras > 0 && (
              <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 w-fit px-1.5 rounded-full mt-1">
                +{extras} Contactos más
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-300 italic">No especificado</span>
        );
      },
    },
    {
      key: 'email',
      label: 'Comunicación',
      render: (c) => (
        <div className="flex flex-col gap-1 text-sm text-slate-600">
          <span className="flex items-center gap-2 text-xs"><Building2 size={12} /> {c.email}</span>
          <span className="flex items-center gap-2 text-xs"><Phone size={12} /> {c.phone}</span>
        </div>
      ),
    },
    {
      key: 'notes',
      label: 'Observaciones',
      render: (c) => (
        c.notes ? (
          <div className="text-xs text-slate-500 max-w-xs truncate" title={c.notes}>
            <FileText size={10} className="inline mr-1" />
            {c.notes}
          </div>
        ) : '-'
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
      const { data: result } = await axiosClient.post('/foundations/clients/import-csv', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`Importación completada: ${result.created} creados, ${result.updated} actualizados, ${result.errors?.length ?? 0} errores`);
      window.location.reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al importar el CSV.');
    } finally {
      setImportingCsv(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const tabClass = (tab: 'general' | 'contacts') =>
    `flex-1 rounded-none border-b-2 ${activeTab === tab ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`;

  // Third-wave pilot (guide v2; Gabriel 19/10): list with a table → full width, standard header, Button and Modal
  return (
    <div className="p-8 w-full pb-24 space-y-6 animate-fadeIn">
      <Input
        type="file"
        ref={csvInputRef}
        className="hidden"
        accept=".csv"
        onChange={handleCsvImport}
      />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3 text-slate-800">
            <Users className="text-indigo-600" size={32} /> Cartera de Clientes
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Clientes, sus datos fiscales y sus contactos.</p>
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-xs text-slate-400 font-bold animate-pulse">Cargando...</span>}
          <ExportButton data={clients} fileName="Cartera_Clientes_Completa" mapping={mapClientsForExcel}/>
          <Button type="button" variant="outline" onClick={() => csvInputRef.current?.click()} disabled={importingCsv}>
            <Upload size={16} /> {importingCsv ? 'Procesando...' : 'Importar CSV'}
          </Button>
          <Button type="button" onClick={() => { setIsEditing(false); setForm(initialForm); setShowModal(true); }}>
            <Plus size={16} /> Nuevo Cliente
          </Button>
        </div>
      </div>

      <div className="relative w-full md:w-[32rem]">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search size={18} className="text-slate-400" />
        </div>
        <Input
          type="text"
          className="pl-10 text-sm font-medium shadow-sm"
          placeholder="Buscar por razón social, RFC, contacto, correo o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <VTable
        columns={clientColumns as unknown as VTableColumn<Record<string, unknown>>[]}
        data={visibleClients as unknown as Record<string, unknown>[]}
        isLoading={loading}
        emptyState={{ title: clients.length === 0 ? 'No hay clientes registrados.' : 'No hay clientes que coincidan con la búsqueda.' }}
        className="shadow-sm"
        headerStyle="report"
        actions={(row) => {
          const c = row as unknown as Client;
          return [
            {
              label: '',
              title: 'Editar',
              icon: <TableActionEditIcon />,
              onClick: () => handleEdit(c),
            },
            {
              label: '',
              title: 'Cancelar',
              icon: <TableActionCancelIcon />,
              variant: 'danger' as const,
              onClick: () => c.id && handleDelete(c.id),
            },
          ];
        }}
      />

      {showModal && (
        <Modal
          isOpen size="lg" overlayZIndex={50} onClose={closeModal} title={isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}
          headerActions={isEditing && form.id ? (
            <RecordHistoryButton tableName="clients_v2" recordId={form.id} label={form.full_name || `Cliente #${form.id}`} />
          ) : undefined}
        >
          <div className="flex border-b border-slate-200 bg-slate-50 -mx-6 mb-4">
            <Button type="button" variant="ghost" className={tabClass('general')} onClick={() => setActiveTab('general')}>
              <Building2 size={16}/> Datos Empresa
            </Button>
            <Button type="button" variant="ghost" className={tabClass('contacts')} onClick={() => setActiveTab('contacts')}>
              <Users size={16}/> Agenda de Contactos (4)
            </Button>
          </div>

          <form id="client-form" onSubmit={handleSubmit} className="flex-1">
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div>
                  <label className="label-std">Razón social / nombre del cliente *</label>
                  <Input required className="input-std" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label-std">RFC</label>
                    <Input className="input-std" value={form.rfc_tax_id || ''} onChange={e => setForm({...form, rfc_tax_id: e.target.value})} />
                  </div>
                  <div>
                    <label className="label-std">Teléfono oficina *</label>
                    <Input required className="input-std" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="label-std">Email facturación / empresa *</label>
                  <Input type="email" required className="input-std" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                </div>
                <div>
                  <label className="label-std">Dirección fiscal</label>
                  <Input className="input-std" value={form.fiscal_address || ''} onChange={e => setForm({...form, fiscal_address: e.target.value})} />
                </div>
                <div>
                  <label className="label-std">Observaciones generales</label>
                  <textarea className="input-std min-h-[80px]" value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} />
                </div>
              </div>
            )}

            {activeTab === 'contacts' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">
                  Hasta 4 contactos por cliente; llena al menos el Contacto Principal.
                </p>
                {renderContactFields(1, "Contacto Principal (Obligatorio)")}
                {renderContactFields(2, "Contacto Adicional 2")}
                {renderContactFields(3, "Contacto Adicional 3")}
                {renderContactFields(4, "Contacto Adicional 4")}
              </div>
            )}
          </form>

          <div className="flex items-center justify-between gap-4 pt-6 mt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" form="client-form">{isEditing ? 'Guardar Cambios' : 'Crear Cliente'}</Button>
          </div>
        </Modal>
      )}

      <style>{`
        .input-std { width: 100%; padding: 0.6rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.875rem; outline: none; transition: border-color 0.2s; }
        .input-std:focus { border-color: #6366f1; ring: 1px; }
        .input-mini { width: 100%; padding: 0.4rem; border: 1px solid #e2e8f0; border-radius: 0.3rem; font-size: 0.75rem; outline: none; }
        .input-mini:focus { border-color: #6366f1; }
        .label-std { display: block; font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 0.25rem; }
      `}</style>

      {pendingDeleteId !== null && (
        <VConfirmDialog
          isOpen={pendingDeleteId !== null}
          title="Eliminar cliente"
          message="¿Estás seguro de eliminar este cliente?"
          consequence="Esta acción no se puede deshacer."
          variant="danger"
          confirmLabel="Sí, eliminar"
          onConfirm={() => executeDelete(pendingDeleteId)}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}