import React, { useMemo, useState } from 'react';
import { useFoundations } from '../hooks/useFoundations';
import { Percent, Plus, Power, CheckCircle, XCircle, Pencil, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { toast } from '@/components/ui/VToast';

export default function TaxRatesPage() {
  const { taxRates, createTaxRate, updateTaxRate, deleteTaxRate, toggleTaxRate, loading } = useFoundations();
  const [showForm, setShowForm] = useState(false);
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [rateStr, setRateStr] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const resetForm = () => {
    setName('');
    setRateStr('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleEditClick = (tax: any) => {
    setEditingId(tax.id);
    setName(tax.name);
    setRateStr((tax.rate * 100).toString());
    setShowForm(true);
  };

  const handleDeleteClick = (id: number) => {
    setPendingDeleteId(id);
  };

  const executeDelete = async (id: number) => {
    const res = await deleteTaxRate(id);
    if (res?.success) {
      toast.success('Impuesto eliminado correctamente.');
    } else {
      toast.error(res?.error || 'Error al eliminar el impuesto.');
    }
    setPendingDeleteId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name) { toast.warning('El campo Nombre está vacío'); return; }
    if (!rateStr) { toast.warning('El campo Tasa está vacío'); return; }
    
    const rateDecimal = parseFloat(rateStr) / 100;
    
    try {
        let res;
        if (editingId) {
            res = await updateTaxRate(editingId, name, rateDecimal);
        } else {
            res = await createTaxRate(name, rateDecimal);
        }

        if (res.success) {
            toast.success('Guardado correctamente.');
            resetForm();
        } else {
            toast.error(res.error || 'Error del backend al guardar.');
        }
    } catch {
        toast.error('Error al guardar el impuesto.');
    }
  };

  const taxColumns = useMemo((): VTableColumn<any>[] => [
    {
      key: 'name',
      label: 'Nombre',
      render: (tax) => <span className="font-bold text-slate-700">{tax.name}</span>,
    },
    {
      key: 'rate',
      label: 'Tasa Decimal',
      render: (tax) => <span className="font-mono text-slate-500 text-center block">{tax.rate}</span>,
    },
    {
      key: 'rate_pct',
      label: 'Tasa %',
      render: (tax) => (
        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-bold border border-slate-200 inline-block mx-auto">
          {(tax.rate * 100).toFixed(0)}%
        </span>
      ),
    },
    {
      key: 'is_active',
      label: 'Estado',
      render: (tax) => (
        tax.is_active ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-bold bg-green-50 px-2 py-1 rounded-full border border-green-100">
            <CheckCircle size={12}/> Activo
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-bold bg-slate-100 px-2 py-1 rounded-full border border-slate-200">
            <XCircle size={12}/> Inactivo
          </span>
        )
      ),
    },
  ], []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      
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

      {showForm && (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-6 animate-in slide-in-from-top-2 relative">
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
                    <Input 
                        autoFocus
                        placeholder="Ej. IVA General" 
                        className="w-full p-2 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-200 h-auto"
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                </div>
                <div className="w-32">
                    <label className="text-xs font-bold text-blue-800 uppercase mb-1 block">Tasa (%)</label>
                    <Input 
                        type="number" 
                        placeholder="16" 
                        className="w-full p-2 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-200 text-center font-bold h-auto"
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

      <VTable
        columns={taxColumns as unknown as VTableColumn<Record<string, unknown>>[]}
        data={taxRates as unknown as Record<string, unknown>[]}
        isLoading={loading}
        emptyState={{ title: 'No hay impuestos registrados.' }}
        className="shadow-sm"
        actions={(row) => {
          const tax = row as any;
          return [
            {
              label: '',
              icon: <Pencil size={18} />,
              onClick: () => handleEditClick(tax),
            },
            {
              label: '',
              icon: <Trash2 size={18} />,
              variant: 'danger' as const,
              onClick: () => handleDeleteClick(tax.id),
            },
            {
              label: '',
              icon: <Power size={18} />,
              onClick: () => toggleTaxRate(tax.id),
            },
          ];
        }}
      />

      {pendingDeleteId !== null && (
        <VConfirmDialog
          isOpen={pendingDeleteId !== null}
          title="Eliminar impuesto"
          message="¿Estás seguro de que deseas eliminar este impuesto?"
          consequence="Esta acción lo ocultará del sistema."
          variant="danger"
          confirmLabel="Sí, eliminar"
          onConfirm={() => executeDelete(pendingDeleteId)}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
