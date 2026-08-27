import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Clock,
  ClipboardList,
  Package,
  Plus,
  Snowflake,
  Tag,
  X,
} from 'lucide-react';
import axiosClient from '../../../api/axios-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { VConfirmDialog } from '@/components/ui/VConfirmDialog';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { VStatusBadge } from '@/components/ui/VStatusBadge';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { toast } from '@/components/ui/VToast';

interface Material {
  id: number;
  sku: string;
  name: string;
  physical_stock: number;
  min_stock: number;
  usage_unit: string;
}

interface Requisition {
  id: number;
  material_id: number;
  custom_description?: string;
  requested_quantity: number;
  status: string;
  notes: string;
  created_at: string;
  requested_by_user_id?: number;
}

interface PurchaseOrder {
  status?: string;
  items?: Array<{ material_id: number }>;
}

type RequisitionSubSection = 'CRITICAL' | 'FROZEN' | 'MINE' | 'NEW' | null;

interface RequisitionsModuleProps {
  onSubSectionChange?: (isActive: boolean) => void;
}

const formatDate = (value: string): string => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const RequisitionsModule: React.FC<RequisitionsModuleProps> = ({ onSubSectionChange }) => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSubSection, setActiveSubSection] = useState<RequisitionSubSection>(null);
  const [cancelReqId, setCancelReqId] = useState<number | null>(null);

  const [manualMatId, setManualMatId] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [manualQty, setManualQty] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  const currentUserId = parseInt(localStorage.getItem('user_id') || '0', 10);

  useEffect(() => {
    onSubSectionChange?.(activeSubSection !== null);
  }, [activeSubSection, onSubSectionChange]);

  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [matRes, reqRes, ordRes] = await Promise.all([
        axiosClient.get('/foundations/materials'),
        axiosClient.get('/purchases/requisitions/'),
        axiosClient.get('/purchases/orders/'),
      ]);

      setMaterials(matRes.data);
      setRequisitions(Array.isArray(reqRes.data) ? reqRes.data : []);
      setOrders(Array.isArray(ordRes.data) ? ordRes.data : []);
    } catch {
      toast.error('No se pudieron cargar las requisiciones.');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 15000);
    return () => clearInterval(interval);
  }, []);

  const frozenReqs = requisitions.filter((r) => r.status?.toUpperCase() === 'APLAZADA');

  const myReqs = requisitions.filter(
    (r) =>
      r.requested_by_user_id === currentUserId &&
      r.status?.toUpperCase() !== 'CANCELADA',
  );

  const reqMaterialIds = frozenReqs.map((r) => r.material_id);
  const activeOrders = orders.filter((o) =>
    ['DRAFT', 'ENVIADA'].includes(o.status?.toUpperCase() ?? ''),
  );
  const orderMaterialIds = activeOrders.flatMap(
    (o) => o.items?.map((i) => i.material_id) || [],
  );
  const materialesAtendidos = [...reqMaterialIds, ...orderMaterialIds];

  const criticalStock = materials.filter(
    (m) =>
      (m.min_stock || 0) > 0 &&
      (m.physical_stock || 0) <= (m.min_stock || 0) &&
      !materialesAtendidos.includes(m.id),
  );

  const getMaterial = (materialId: number) =>
    materials.find((m) => m.id === materialId);

  const getMaterialLabel = (req: Requisition): React.ReactNode => {
    if (
      req.custom_description &&
      req.custom_description !== 'REPOSICIÓN AUTOMÁTICA'
    ) {
      return (
        <span className="flex items-center gap-1 font-bold text-red-700">
          <Tag size={14} />
          {req.custom_description}
        </span>
      );
    }

    const mat = getMaterial(req.material_id);
    return mat ? `[${mat.sku}] ${mat.name}` : `ID: ${req.material_id}`;
  };

  const getMaterialUnit = (req: Requisition): string => {
    const mat = getMaterial(req.material_id);
    return mat?.usage_unit ?? '';
  };

  const isAutomaticReq = (req: Requisition): boolean => {
    const notes = req.notes || '';
    const desc = req.custom_description || '';
    return (
      notes.includes('Valentina') ||
      notes.includes('[AUTO]') ||
      desc === 'REPOSICIÓN AUTOMÁTICA'
    );
  };

  const requisitionColumns: VTableColumn<Requisition>[] = useMemo(
    () => [
      {
        key: 'material',
        label: 'Material',
        render: (row) => (
          <div className="flex flex-col">
            {getMaterialLabel(row)}
            {isAutomaticReq(row) && (
              <span className="mt-1 text-[9px] font-black uppercase tracking-widest text-blue-400">
                Alarma pausada
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'requested_quantity',
        label: 'Cantidad',
        sortable: true,
        render: (row) => (
          <span className="font-bold text-slate-800">
            {row.requested_quantity}
            {getMaterialUnit(row) ? ` ${getMaterialUnit(row)}` : ''}
          </span>
        ),
      },
      {
        key: 'notes',
        label: 'Notas',
        render: (row) => (
          <span className="text-xs text-slate-500">{row.notes || '—'}</span>
        ),
      },
      {
        key: 'status',
        label: 'Estado',
        render: (row) => (
          <VStatusBadge status={row.status} entity="requisition" />
        ),
      },
      {
        key: 'created_at',
        label: 'Fecha de creación',
        sortable: true,
        render: (row) => formatDate(row.created_at),
      },
    ],
    [materials],
  );

  const handleUpdateStatus = async (id: number, newStatus: string) => {
    setIsSaving(true);
    try {
      await axiosClient.put(`/purchases/requisitions/${id}/status?status=${newStatus}`);
      toast.success('Estado actualizado correctamente.');
      loadData(true);
    } catch {
      toast.error('No se pudo actualizar el estado.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelReq = async (id: number) => {
    try {
      await axiosClient.put(`/purchases/requisitions/${id}/cancel`);
      toast.success('Solicitud cancelada correctamente.');
      loadData(true);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'No se pudo cancelar la solicitud.');
      throw error;
    }
  };

  const handleCreateManualReq = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!manualMatId && !customDescription.trim()) {
      toast.warning('Selecciona un material o ingresa una descripción.');
      return;
    }

    setIsSaving(true);
    try {
      await axiosClient.post('/purchases/requisitions/', {
        material_id: manualMatId ? parseInt(manualMatId, 10) : null,
        custom_description: !manualMatId ? customDescription.trim() : null,
        requested_quantity: parseFloat(manualQty),
        notes: manualNotes.trim()
          ? `[MANUAL] ${manualNotes.trim()}`
          : '[MANUAL] Petición Ad-hoc',
      });

      setManualMatId('');
      setCustomDescription('');
      setManualQty('');
      setManualNotes('');
      toast.success('Requisición creada correctamente.');
      loadData(true);
      setActiveSubSection('MINE');
    } catch {
      toast.error('No se pudo crear la requisición.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickRestock = async (material: Material) => {
    setIsSaving(true);
    const qtyToOrder = material.min_stock > 0 ? material.min_stock : 1;
    try {
      await axiosClient.post('/purchases/requisitions/', {
        material_id: material.id,
        custom_description: null,
        requested_quantity: qtyToOrder,
        notes: `[AUTO] Reposición por stock crítico. Actual: ${material.physical_stock}`,
      });
      toast.success('Solicitud de reposición creada.');
      loadData(true);
    } catch {
      toast.error('No se pudo crear la requisición de reposición.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderSectionHeader = (
    title: string,
    description: string,
    icon: React.ReactNode,
  ) => (
    <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 md:flex-row md:items-center md:justify-between">
      <div>
        <h3 className="flex items-center gap-2 text-2xl font-black uppercase tracking-tighter text-slate-800">
          {icon}
          {title}
        </h3>
        <p className="text-sm font-medium italic text-slate-500">{description}</p>
      </div>
      <Button
        onClick={() => setActiveSubSection(null)}
        variant="outline"
        className="border-slate-300 px-4 text-[10px] font-black uppercase tracking-widest"
      >
        <ArrowLeft size={16} className="mr-2" />
        Regresar
      </Button>
    </div>
  );

  const renderCriticalSection = () => (
    <Card className="animate-in slide-in-from-right-4 space-y-6 rounded-3xl border-slate-100 bg-white p-8 shadow-xl duration-300">
      {renderSectionHeader(
        'Urgentes',
        'Materiales bajo el punto de reorden.',
        <AlertTriangle className="text-orange-500" />,
      )}

      <VTable
        columns={[
          {
            key: 'name',
            label: 'Material / SKU',
            sortable: true,
            render: (row: Material) => (
              <span className="font-bold uppercase text-slate-700">
                [{row.sku}] {row.name}
              </span>
            ),
          },
          {
            key: 'physical_stock',
            label: 'Stock actual',
            sortable: true,
            render: (row: Material) => (
              <span className="font-black text-orange-600">{row.physical_stock}</span>
            ),
          },
          {
            key: 'min_stock',
            label: 'Mínimo',
            sortable: true,
            render: (row: Material) => (
              <span className="text-slate-400">{row.min_stock}</span>
            ),
          },
        ]}
        data={criticalStock}
        isLoading={isLoading}
        emptyState={{
          icon: <Package size={48} />,
          title: 'Almacén saludable',
          description: 'No hay materiales con stock crítico en este momento.',
        }}
        actions={(row) => [
          {
            label: 'Solicitar',
            onClick: () => handleQuickRestock(row),
          },
        ]}
      />
    </Card>
  );

  const renderFrozenSection = () => (
    <Card className="animate-in slide-in-from-right-4 space-y-6 rounded-3xl border-slate-100 bg-white p-8 shadow-xl duration-300">
      {renderSectionHeader(
        'Aplazadas',
        'Solicitudes en estado APLAZADA.',
        <Snowflake className="text-slate-400" />,
      )}

      <VTable
        columns={requisitionColumns}
        data={frozenReqs}
        isLoading={isLoading}
        emptyState={{
          icon: <Snowflake size={48} />,
          title: 'Sin solicitudes aplazadas',
          description: 'No hay requisiciones en la congeladora.',
        }}
        actions={(row) => [
          {
            label: 'Descongelar',
            icon: <Clock size={14} />,
            onClick: () => handleUpdateStatus(row.id, 'PENDIENTE'),
          },
        ]}
      />
    </Card>
  );

  const renderMyRequisitionsSection = () => (
    <Card className="space-y-6 p-6">
      {renderSectionHeader(
        'Mis solicitudes',
        'Requisiciones creadas por ti.',
        <ClipboardList className="text-purple-500" />,
      )}

      <VTable
        columns={requisitionColumns}
        data={myReqs}
        isLoading={isLoading}
        emptyState={{
          icon: <ClipboardList size={48} />,
          title: 'Sin solicitudes activas',
          description: 'Aún no has creado requisiciones o todas fueron canceladas.',
        }}
        actions={(row) => [
          {
            label: 'Cancelar',
            icon: <X size={14} />,
            variant: 'danger',
            hidden: ['PROCESADA', 'CANCELADA'].includes(row.status?.toUpperCase() ?? ''),
            onClick: () => setCancelReqId(row.id),
          },
        ]}
      />
    </Card>
  );

  const renderNewRequisitionForm = () => (
    <Card className="animate-in slide-in-from-right-4 space-y-6 rounded-3xl border-slate-100 bg-white p-8 shadow-xl duration-300">
      {renderSectionHeader(
        'Nueva solicitud',
        'Solicitud manual de material o servicio.',
        <Plus className="text-indigo-500" />,
      )}

      <form onSubmit={handleCreateManualReq} className="max-w-xl space-y-6">
        <div className="space-y-1.5">
          <label className="text-xs font-black uppercase tracking-wider text-slate-500">
            Material del catálogo
          </label>
          <SearchableSelect
            items={materials}
            value={manualMatId}
            onChange={setManualMatId}
            getLabel={(material) => `[${material.sku}] ${material.name}`}
            getValue={(material) => String(material.id)}
            placeholder="Buscar por SKU o nombre..."
            disabled={isSaving}
          />
        </div>

        {!manualMatId && (
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-slate-500">
              Descripción personalizada *
            </label>
            <Input
              value={customDescription}
              onChange={(event) => setCustomDescription(event.target.value)}
              placeholder="Material o servicio no catalogado..."
              disabled={isSaving}
              required={!manualMatId}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-black uppercase tracking-wider text-slate-500">
            Cantidad *
          </label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={manualQty}
            onChange={(event) => setManualQty(event.target.value)}
            placeholder="0"
            disabled={isSaving}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black uppercase tracking-wider text-slate-500">
            Notas (opcional)
          </label>
          <Input
            value={manualNotes}
            onChange={(event) => setManualNotes(event.target.value)}
            placeholder="Motivo de la solicitud..."
            disabled={isSaving}
          />
        </div>

        <Button
          type="submit"
          disabled={isSaving || isLoading}
          className="w-full bg-indigo-600 py-3 font-black uppercase tracking-widest text-white hover:bg-indigo-700"
        >
          <Plus size={16} className="mr-2" />
          {isSaving ? 'Creando...' : 'Crear requisición'}
        </Button>
      </form>
    </Card>
  );

  if (activeSubSection === 'CRITICAL') return renderCriticalSection();
  if (activeSubSection === 'FROZEN') return renderFrozenSection();
  if (activeSubSection === 'MINE') return renderMyRequisitionsSection();
  if (activeSubSection === 'NEW') return renderNewRequisitionForm();

  const subMenuItems = [
    {
      id: 'CRITICAL' as const,
      title: 'A. Urgentes',
      count: criticalStock.length,
      bg: 'bg-orange-50',
      text: 'text-orange-600',
      border: 'border-orange-100',
      desc: 'Stock crítico',
    },
    {
      id: 'FROZEN' as const,
      title: 'B. Aplazadas',
      count: frozenReqs.length,
      bg: 'bg-slate-50',
      text: 'text-slate-600',
      border: 'border-slate-100',
      desc: 'Requisiciones aplazadas',
    },
    {
      id: 'MINE' as const,
      title: 'C. Mis solicitudes',
      count: myReqs.length,
      bg: 'bg-purple-50',
      text: 'text-purple-600',
      border: 'border-purple-100',
      desc: 'Creadas por mí',
    },
    {
      id: 'NEW' as const,
      title: 'D. Nueva solicitud',
      count: '+',
      bg: 'bg-indigo-50',
      text: 'text-indigo-600',
      border: 'border-indigo-100',
      desc: 'Crear solicitud',
    },
  ];

  return (
    <>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {subMenuItems.map((item) => (
          <Card
            key={item.id}
            onClick={() => setActiveSubSection(item.id)}
            className="relative h-40 cursor-pointer border-l-4 border-l-indigo-500 bg-white p-6 shadow-sm transition-all hover:-translate-y-1"
          >
            <div
              className={`absolute bottom-0 left-0 top-0 flex w-20 items-center justify-center border-r text-3xl font-black ${item.bg} ${item.text} ${item.border}`}
            >
              {item.count}
            </div>
            <div className="ml-20 flex h-full flex-col justify-between">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-800">
                {item.title}
              </p>
              <div className="text-right">
                <p className={`text-xl font-black leading-none ${item.text}`}>{item.desc}</p>
              </div>
              <ArrowUpRight size={18} className="self-end text-slate-400" />
            </div>
          </Card>
        ))}
      </div>

      {!isLoading &&
        materials.length === 0 &&
        requisitions.length === 0 && (
          <VEmptyState
            icon={<Package size={48} />}
            title="Sin datos de requisiciones"
            description="No se encontraron materiales ni solicitudes registradas."
          />
        )}

      <VConfirmDialog
        isOpen={cancelReqId !== null}
        title="Cancelar solicitud"
        message="Esta solicitud quedará registrada como cancelada."
        consequence="Deberás crear una nueva solicitud si la necesitas."
        variant="danger"
        confirmLabel="Sí, cancelar"
        onConfirm={async () => {
          if (cancelReqId !== null) {
            await handleCancelReq(cancelReqId);
            setCancelReqId(null);
          }
        }}
        onCancel={() => setCancelReqId(null)}
      />
    </>
  );
};
