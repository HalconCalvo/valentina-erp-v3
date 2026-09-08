import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Save, Plus, Trash2, ArrowLeft, Loader, Pencil, X,
} from 'lucide-react';

import { useClients } from '../../foundations/hooks/useClients';
import { useFoundations } from '../../foundations/hooks/useFoundations';
import { designService } from '../../../api/design-service';
import { quotationService, formatQuotationCurrency } from '../../../api/quotation-service';
import axiosClient from '../../../api/axios-client';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { toast } from '@/components/ui/VToast';
import { Quotation } from '../../../types/quotations';

interface DraftItem {
  tempId: number;
  product_name: string;
  origin_version_id: number | null;
  quantity: number;
  unit_price: number;
  frozen_unit_cost: number;
  is_resale: boolean;
  resale_sku: string | null;
  commercial_description: string | null;
  is_cancelled: boolean;
}

const safeDate = (dateString: string | undefined | null): string => {
  if (!dateString) return new Date().toISOString().split('T')[0];
  try {
    return new Date(dateString).toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

const emptyLine = () => ({
  master_id: 0,
  version_id: 0,
  quantity: 1,
  unit_price: 0,
  manual_name: '',
  frozen_cost: 0,
  commercial_description: '',
});

const CreateQuotationPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const isEditMode = Boolean(id);
  const cloneFrom = location.state?.cloneFrom as Quotation | undefined;

  const clientHook = useClients();
  const foundationHook = useFoundations();
  const clients = clientHook?.clients ?? [];
  const taxRates = foundationHook?.taxRates ?? [];
  const config = foundationHook?.config ?? null;

  const [masters, setMasters] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string>('DRAFT');

  const [header, setHeader] = useState({
    client_id: 0,
    project_name: '',
    tax_rate_id: 0,
    valid_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    applied_margin_percent: 0,
    advance_percent: 60,
    notes: '',
    conditions: '',
  });

  const [items, setItems] = useState<DraftItem[]>([]);
  const [lineItem, setLineItem] = useState(emptyLine());
  const [addMode, setAddMode] = useState<'CATALOG' | 'MANUAL'>('CATALOG');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [editingTempId, setEditingTempId] = useState<number | null>(null);
  const [commissionRate, setCommissionRate] = useState(0);
  const [isUserSelectedTax, setIsUserSelectedTax] = useState(false);

  useEffect(() => {
    const loadCatalogs = async () => {
      try {
        clientHook?.fetchClients?.();
        foundationHook?.fetchTaxRates?.();
        foundationHook?.fetchConfig?.();
        const filteredMasters = await designService.getMasters(undefined, true);
        setMasters(filteredMasters ?? []);
        if (!isEditMode) {
          const res = await axiosClient.get('/users/me');
          let rate = res.data?.commission_rate ?? res.data?.commission;
          if (rate != null) {
            let num = parseFloat(String(rate));
            if (!Number.isNaN(num)) {
              if (num > 1) num = num / 100;
              setCommissionRate(num);
            }
          }
        }
      } catch {
        toast.error('Error al cargar catálogos.');
      }
    };
    loadCatalogs();
  }, []);

  useEffect(() => {
    if (!isEditMode && config && !isUserSelectedTax) {
      const defaultMargin = Number(config.target_profit_margin) || 0;
      if (header.applied_margin_percent === 0 && defaultMargin > 0) {
        setHeader((prev) => ({ ...prev, applied_margin_percent: defaultMargin }));
      }
      if (taxRates.length > 0 && header.tax_rate_id === 0) {
        const defaultTaxId = config.default_tax_rate_id || taxRates[0].id;
        setHeader((prev) => ({ ...prev, tax_rate_id: Number(defaultTaxId) }));
      }
    }
  }, [config, taxRates, isEditMode, isUserSelectedTax, header.tax_rate_id]);

  useEffect(() => {
    if (cloneFrom && !isEditMode) {
      setHeader({
        client_id: cloneFrom.client_id,
        project_name: `${cloneFrom.project_name} (v2)`,
        tax_rate_id: cloneFrom.tax_rate_id,
        valid_until: safeDate(cloneFrom.valid_until),
        applied_margin_percent: Number(cloneFrom.applied_margin_percent) || 0,
        advance_percent: Number(cloneFrom.advance_percent) || 60,
        notes: cloneFrom.notes ?? '',
        conditions: cloneFrom.conditions ?? '',
      });
      let rate = Number(cloneFrom.applied_commission_percent) || 0;
      if (rate > 1) rate = rate / 100;
      setCommissionRate(rate);
      setItems(
        (cloneFrom.items ?? []).map((it, idx) => ({
          tempId: -Date.now() - idx,
          product_name: it.product_name,
          origin_version_id: it.origin_version_id ?? null,
          quantity: it.quantity,
          unit_price: it.unit_price,
          frozen_unit_cost: it.frozen_unit_cost ?? 0,
          is_resale: it.is_resale ?? false,
          resale_sku: it.resale_sku ?? null,
          commercial_description: it.commercial_description ?? null,
          is_cancelled: false,
        })),
      );
    }
  }, [cloneFrom, isEditMode]);

  useEffect(() => {
    if (isEditMode && id) {
      setLoadingData(true);
      quotationService.getQuotation(Number(id))
        .then((data) => {
          if (data.status !== 'DRAFT') {
            toast.warning('Solo se pueden editar cotizaciones en borrador.');
            navigate(`/quotations/${id}`);
            return;
          }
          setCurrentStatus(data.status);
          setIsUserSelectedTax(true);
          setHeader({
            client_id: data.client_id,
            project_name: data.project_name,
            tax_rate_id: data.tax_rate_id,
            valid_until: safeDate(data.valid_until),
            applied_margin_percent: Number(data.applied_margin_percent) || 0,
            advance_percent: Number(data.advance_percent) || 60,
            notes: data.notes ?? '',
            conditions: data.conditions ?? '',
          });
          let rate = Number(data.applied_commission_percent) || 0;
          if (rate > 1) rate = rate / 100;
          setCommissionRate(rate);
          setItems(
            (data.items ?? []).map((it, idx) => ({
              tempId: it.id ?? -idx,
              product_name: it.product_name,
              origin_version_id: it.origin_version_id ?? null,
              quantity: it.quantity,
              unit_price: it.unit_price,
              frozen_unit_cost: it.frozen_unit_cost ?? 0,
              is_resale: it.is_resale ?? false,
              resale_sku: it.resale_sku ?? null,
              commercial_description: it.commercial_description ?? null,
              is_cancelled: false,
            })),
          );
        })
        .catch(() => {
          toast.error('Error al cargar cotización.');
          navigate('/quotations');
        })
        .finally(() => setLoadingData(false));
    }
  }, [id, isEditMode, navigate]);

  const activeItems = useMemo(() => items.filter((i) => !i.is_cancelled), [items]);
  const selectedTaxRate = taxRates.find((t) => t.id === header.tax_rate_id);
  const itemsSum = useMemo(
    () => activeItems.reduce((sum, i) => sum + i.quantity * i.unit_price, 0),
    [activeItems],
  );
  const taxAmount = selectedTaxRate ? itemsSum * Number(selectedTaxRate.rate) : 0;
  const total = itemsSum + taxAmount;

  const mastersOfClient = useMemo(
    () => (header.client_id ? masters.filter((m) => m.client_id === Number(header.client_id)) : []),
    [masters, header.client_id],
  );
  const availableCategories = useMemo(
    () => Array.from(new Set(mastersOfClient.map((m) => m.category))),
    [mastersOfClient],
  );
  const filteredMasters = useMemo(
    () => (selectedCategory ? mastersOfClient.filter((m) => m.category === selectedCategory) : []),
    [mastersOfClient, selectedCategory],
  );

  let availableVersions: any[] = [];
  if (lineItem.master_id) {
    const m = masters.find((x) => x.id === Number(lineItem.master_id));
    if (m?.versions) availableVersions = m.versions;
  }

  const calcPriceFromVersion = (version: any) => {
    let realtimeCost = 0;
    if (version?.components?.length) {
      for (const comp of version.components) {
        const qty = Number(comp.quantity) || 0;
        const cost = Number(comp.current_cost) || 0;
        const factor = Number(comp.conversion_factor) || 1;
        realtimeCost += Math.ceil(qty * (cost / factor) * 100) / 100;
      }
      realtimeCost = Math.round(realtimeCost * 100) / 100;
    }
    const estimatedCost = realtimeCost > 0
      ? realtimeCost
      : Number(version?.estimated_cost ?? version?.total_cost ?? 0);
    const margin = Number(header.applied_margin_percent) || 0;
    const marginMult = margin > 0 && margin <= 1 ? 1 + margin : 1 + margin / 100;
    const commissionMult = 1 + (Number(commissionRate) || 0);
    return {
      price: Number((estimatedCost * marginMult * commissionMult).toFixed(2)),
      cost: estimatedCost,
      description: version?.commercial_description ?? '',
    };
  };

  const handleVersionSelect = (versionId: string) => {
    const vid = Number(versionId);
    const master = masters.find((m) => m.id === lineItem.master_id);
    const version = master?.versions?.find((v: any) => v.id === vid);
    if (!version) return;
    const { price, cost, description } = calcPriceFromVersion(version);
    setLineItem({
      ...lineItem,
      version_id: vid,
      unit_price: price,
      frozen_cost: cost,
      commercial_description: description,
    });
  };

  const handleAddItem = () => {
    if (lineItem.quantity <= 0 || lineItem.unit_price <= 0) {
      toast.warning('Cantidad y precio deben ser mayores a cero.');
      return;
    }
    let productName = lineItem.manual_name.trim();
    if (addMode === 'CATALOG') {
      const master = masters.find((m) => m.id === Number(lineItem.master_id));
      const version = master?.versions?.find((v: any) => v.id === Number(lineItem.version_id));
      if (!version) {
        toast.warning('Selecciona un producto del catálogo o usa entrada manual.');
        return;
      }
      productName = `${master?.name ?? 'Producto'} - ${version.version_name}`;
    } else if (!productName) {
      toast.warning('Indica el nombre del producto.');
      return;
    }

    const newItem: DraftItem = {
      tempId: editingTempId ?? -Date.now(),
      product_name: productName,
      origin_version_id: addMode === 'CATALOG' ? Number(lineItem.version_id) : null,
      quantity: Number(lineItem.quantity),
      unit_price: Number(lineItem.unit_price),
      frozen_unit_cost: addMode === 'CATALOG' ? lineItem.frozen_cost : 0,
      is_resale: false,
      resale_sku: null,
      commercial_description: lineItem.commercial_description || null,
      is_cancelled: false,
    };

    if (editingTempId !== null) {
      setItems((prev) => prev.map((i) => (i.tempId === editingTempId ? newItem : i)));
      setEditingTempId(null);
    } else {
      setItems((prev) => [...prev, newItem]);
    }
    setLineItem(emptyLine());
    setAddMode('CATALOG');
    setSelectedCategory('');
  };

  const handleRemoveItem = (tempId: number) => {
    setItems((prev) =>
      prev.map((i) => (i.tempId === tempId ? { ...i, is_cancelled: true } : i)),
    );
    if (editingTempId === tempId) {
      setEditingTempId(null);
      setLineItem(emptyLine());
    }
  };

  const handleEditItem = (item: DraftItem) => {
    setEditingTempId(item.tempId);
    setLineItem({
      master_id: 0,
      version_id: item.origin_version_id ?? 0,
      quantity: item.quantity,
      unit_price: item.unit_price,
      manual_name: item.product_name,
      frozen_cost: item.frozen_unit_cost,
      commercial_description: item.commercial_description ?? '',
    });
    if (item.origin_version_id) {
      setAddMode('CATALOG');
      for (const m of masters) {
        const v = m.versions?.find((ver: any) => ver.id === item.origin_version_id);
        if (v) {
          setSelectedCategory(m.category);
          setLineItem((prev) => ({ ...prev, master_id: m.id, version_id: v.id }));
          break;
        }
      }
    } else {
      setAddMode('MANUAL');
    }
  };

  const buildPayloadItems = () =>
    activeItems.map((item) => ({
      product_name: item.product_name,
      origin_version_id: item.origin_version_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      frozen_unit_cost: item.frozen_unit_cost,
      cost_snapshot: {},
      is_resale: item.is_resale,
      resale_sku: item.resale_sku,
      commercial_description: item.commercial_description,
    }));

  const handleSave = async () => {
    const missing: string[] = [];
    if (!header.client_id) missing.push('Cliente');
    if (!header.project_name.trim()) missing.push('Proyecto');
    if (!header.tax_rate_id) missing.push('Impuesto');
    if (activeItems.length === 0) missing.push('Al menos 1 partida');

    if (missing.length) {
      toast.warning(`Faltan: ${missing.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        client_id: Number(header.client_id),
        project_name: header.project_name.trim(),
        tax_rate_id: Number(header.tax_rate_id),
        valid_until: new Date(header.valid_until).toISOString(),
        applied_margin_percent: Number(header.applied_margin_percent),
        applied_commission_percent: commissionRate * 100,
        advance_percent: Number(header.advance_percent),
        currency: 'MXN',
        notes: header.notes || null,
        conditions: header.conditions || null,
        items: buildPayloadItems(),
      };

      let saved;
      if (isEditMode && id) {
        saved = await quotationService.updateQuotation(Number(id), payload);
        toast.success('Cotización actualizada.');
      } else {
        saved = await quotationService.createQuotation(payload);
        toast.success('Cotización creada.');
      }
      navigate(`/quotations/${saved.id}`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const itemColumns: VTableColumn<DraftItem>[] = [
    { key: 'product_name', label: 'Producto' },
    {
      key: 'quantity',
      label: 'Cant.',
      render: (row) => row.quantity.toLocaleString('en-US', { maximumFractionDigits: 2 }),
    },
    {
      key: 'unit_price',
      label: 'Precio',
      render: (row) => formatQuotationCurrency(row.unit_price),
    },
    {
      key: 'subtotal',
      label: 'Subtotal',
      render: (row) => formatQuotationCurrency(row.quantity * row.unit_price),
    },
  ];

  if (loadingData) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50">
        <Loader className="animate-spin text-indigo-600 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(isEditMode ? `/quotations/${id}` : '/quotations')}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
          title="Volver"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-800">
            {isEditMode ? 'Editar cotización' : cloneFrom ? 'Nueva versión' : 'Nueva cotización'}
          </h1>
          {isEditMode && (
            <p className="text-xs text-slate-400 font-bold uppercase mt-1">Estatus: {currentStatus}</p>
          )}
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-sm font-black uppercase text-slate-500 tracking-wider">Datos generales</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Cliente</label>
            <SearchableSelect
              items={clients}
              value={header.client_id ? String(header.client_id) : ''}
              onChange={(v) => {
                setHeader({ ...header, client_id: Number(v) });
                setSelectedCategory('');
                setLineItem(emptyLine());
              }}
              getLabel={(c) => c.business_name ?? c.trade_name ?? `Cliente #${c.id}`}
              getValue={(c) => String(c.id)}
              placeholder="Buscar cliente..."
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Proyecto</label>
            <Input
              value={header.project_name}
              onChange={(e) => setHeader({ ...header, project_name: e.target.value })}
              placeholder="Nombre del proyecto"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Impuesto (IVA)</label>
            <SearchableSelect
              items={taxRates}
              value={header.tax_rate_id ? String(header.tax_rate_id) : ''}
              onChange={(v) => {
                if (!v) return;
                setIsUserSelectedTax(true);
                setHeader({ ...header, tax_rate_id: Number(v) });
              }}
              getLabel={(t) => `${t.name} (${(Number(t.rate) * 100).toFixed(0)}%)`}
              getValue={(t) => String(t.id)}
              placeholder="Seleccionar IVA"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Válida hasta</label>
            <Input
              type="date"
              value={header.valid_until}
              onChange={(e) => setHeader({ ...header, valid_until: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Margen (%)</label>
            <Input
              type="number"
              value={String(header.applied_margin_percent)}
              onChange={(e) => setHeader({ ...header, applied_margin_percent: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Anticipo (%)</label>
            <Input
              type="number"
              value={String(header.advance_percent)}
              onChange={(e) => setHeader({ ...header, advance_percent: Number(e.target.value) })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Notas</label>
            <Input
              value={header.notes}
              onChange={(e) => setHeader({ ...header, notes: e.target.value })}
              placeholder="Notas internas o comerciales"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Condiciones</label>
            <Input
              value={header.conditions}
              onChange={(e) => setHeader({ ...header, conditions: e.target.value })}
              placeholder="Condiciones comerciales"
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-black uppercase text-slate-500 tracking-wider">Partidas</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAddMode('CATALOG')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${addMode === 'CATALOG' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              Catálogo
            </button>
            <button
              type="button"
              onClick={() => setAddMode('MANUAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${addMode === 'MANUAL' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              Manual (sin receta)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
          {addMode === 'CATALOG' ? (
            <>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Categoría</label>
                <SearchableSelect
                  items={availableCategories.map((c) => ({ id: c, name: c }))}
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                  getLabel={(c) => c.name}
                  getValue={(c) => c.id}
                  placeholder="Categoría"
                  disabled={!header.client_id}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Producto</label>
                <SearchableSelect
                  items={filteredMasters}
                  value={lineItem.master_id ? String(lineItem.master_id) : ''}
                  onChange={(v) => setLineItem({ ...lineItem, master_id: Number(v), version_id: 0, unit_price: 0 })}
                  getLabel={(m) => m.name}
                  getValue={(m) => String(m.id)}
                  placeholder="Producto"
                  disabled={!selectedCategory}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Versión</label>
                <SearchableSelect
                  items={availableVersions}
                  value={lineItem.version_id ? String(lineItem.version_id) : ''}
                  onChange={handleVersionSelect}
                  getLabel={(v) => v.version_name ?? `v${v.id}`}
                  getValue={(v) => String(v.id)}
                  placeholder="Versión / receta"
                  disabled={!lineItem.master_id}
                />
              </div>
            </>
          ) : (
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nombre producto</label>
              <Input
                value={lineItem.manual_name}
                onChange={(e) => setLineItem({ ...lineItem, manual_name: e.target.value })}
                placeholder="Descripción del producto"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Cantidad</label>
            <Input
              type="number"
              min={0}
              value={String(lineItem.quantity)}
              onChange={(e) => setLineItem({ ...lineItem, quantity: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Precio unitario</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={String(lineItem.unit_price)}
              onChange={(e) => setLineItem({ ...lineItem, unit_price: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handleAddItem} className="gap-2 w-full">
              {editingTempId !== null ? <Pencil size={16} /> : <Plus size={16} />}
              {editingTempId !== null ? 'Actualizar' : 'Agregar'}
            </Button>
            {editingTempId !== null && (
              <button
                type="button"
                onClick={() => {
                  setEditingTempId(null);
                  setLineItem(emptyLine());
                }}
                className="p-2.5 rounded-lg bg-slate-200 hover:bg-slate-300"
                title="Cancelar edición"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <VTable
          columns={itemColumns}
          data={activeItems as unknown as Record<string, unknown>[] as DraftItem[]}
          emptyState={{
            title: 'Sin partidas',
            description: 'Agrega productos del catálogo o entrada manual.',
          }}
          actions={(row) => {
            const item = row as DraftItem;
            return [
              {
                label: '',
                icon: <span title="Editar"><Pencil size={14} /></span>,
                onClick: () => handleEditItem(item),
              },
              {
                label: '',
                icon: <span title="Eliminar"><Trash2 size={14} /></span>,
                variant: 'danger' as const,
                onClick: () => handleRemoveItem(item.tempId),
              },
            ];
          }}
          className="border-0 shadow-none"
        />
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap justify-between gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-slate-500">Subtotal: <span className="font-bold text-slate-800">{formatQuotationCurrency(itemsSum)}</span></p>
            <p className="text-slate-500">IVA: <span className="font-bold text-slate-800">{formatQuotationCurrency(taxAmount)}</span></p>
            <p className="text-lg font-black text-indigo-700">Total: {formatQuotationCurrency(total)}</p>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2 self-end">
            <Save size={18} />
            {saving ? 'Guardando...' : 'Guardar cotización'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default CreateQuotationPage;
