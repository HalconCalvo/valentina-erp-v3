import React, { useState, useEffect, useCallback } from 'react';
import axiosClient from '../../../api/axios-client';
import { ClipboardList, DollarSign, Printer, ClipboardCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';

type SubSection = 'CONTEO' | 'COSTEO' | null;
type Tab = 'REPORTE' | 'CAPTURA';

interface Material {
  id: number;
  sku: string;
  name: string;
  category: string;
  usage_unit: string;
  physical_stock: number;
  current_cost: number;
  provider_name: string | null;
}

interface PhysicalInventoryModuleProps {
  activeSubSection?: string | null;
  onSubSectionChange?: (section: string | null) => void;
}

export const PhysicalInventoryModule = ({ activeSubSection, onSubSectionChange }: PhysicalInventoryModuleProps = {}) => {
  const [internalSection, setInternalSection] = useState<SubSection>(null);
  const activeSection = (activeSubSection !== undefined ? activeSubSection : internalSection) as SubSection;
  const setActiveSection = (s: SubSection) => {
    if (onSubSectionChange) onSubSectionChange(s);
    else setInternalSection(s);
  };
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [categories, setCategories] = useState<string[]>([]);
  const [countEntries, setCountEntries] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('REPORTE');
  const [sortKey, setSortKey] = useState<'sku' | 'name' | 'category'>('sku');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const loadMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosClient.get('/foundations/materials');
      setMaterials(res.data);
      const cats = [...new Set(res.data.map((m: Material) => m.category))].sort() as string[];
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);

  const filtered = categoryFilter === 'ALL'
    ? materials
    : materials.filter(m => m.category === categoryFilter);

  const totalValuation = filtered.reduce((sum, m) => sum + m.physical_stock * m.current_cost, 0);

  const sorted = [...filtered].sort((a, b) => {
    const valA = a[sortKey].toLowerCase();
    const valB = b[sortKey].toLowerCase();
    return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });

  const SortHeader = ({ col, label }: { col: 'sku' | 'name' | 'category'; label: string }) => {
    const active = sortKey === col;
    const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';
    return (
      <th
        className="px-4 py-3 text-left font-bold cursor-pointer select-none hover:bg-slate-200 transition-colors"
        onClick={() => {
          if (active) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
          else { setSortKey(col); setSortDir('asc'); }
        }}
      >
        {label}<span className="text-slate-400 text-xs">{arrow}</span>
      </th>
    );
  };

  const handlePrint = () => {
    const rows = filtered.map(m =>
      `<tr>
        <td style="padding:6px 8px;border:1px solid #ddd;font-family:monospace;font-size:11px">${m.sku}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;font-size:12px">${m.name}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;font-size:12px">${m.category}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;font-size:12px;text-align:center">${m.usage_unit}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;min-width:80px">&nbsp;</td>
      </tr>`
    ).join('');
    const html = `<html><head><title>Inventario Físico</title>
      <style>body{font-family:Arial,sans-serif;padding:20px}h2{font-size:16px}table{width:100%;border-collapse:collapse}th{background:#f1f5f9;padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left}</style>
      </head><body>
      <h2>📋 Reporte de Inventario Físico — ${new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' })}</h2>
      <p style="font-size:11px;color:#666">Categoría: ${categoryFilter === 'ALL' ? 'Todas' : categoryFilter} · Total materiales: ${filtered.length}</p>
      <table><thead><tr>
        <th>SKU</th><th>Material</th><th>Categoría</th><th>Unidad de Uso</th><th>Cantidad Física</th>
      </tr></thead><tbody>${rows}</tbody></table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const handleAdjust = async (material: Material) => {
    const val = countEntries[material.id];
    if (val === undefined || val === '') return;
    setSaving(true);
    try {
      await axiosClient.patch(`/foundations/materials/${material.id}/adjust-stock`, {
        counted_quantity: parseFloat(val),
        notes: `Inventario físico ${new Date().toLocaleDateString('es-MX')}`,
      });
      setSavedIds(prev => [...prev, material.id]);
      await loadMaterials();
    } catch { alert('Error al guardar ajuste.'); }
    finally { setSaving(false); }
  };

  const handleAdjustAll = async () => {
    const entries = Object.entries(countEntries).filter(([, v]) => v !== '');
    if (entries.length === 0) return alert('No hay cantidades capturadas.');
    if (!confirm(`¿Confirmas aplicar ${entries.length} ajuste(s) de inventario?`)) return;
    setSaving(true);
    try {
      for (const [id, val] of entries) {
        await axiosClient.patch(`/foundations/materials/${id}/adjust-stock`, {
          counted_quantity: parseFloat(val),
          notes: `Inventario físico ${new Date().toLocaleDateString('es-MX')}`,
        });
        setSavedIds(prev => [...prev, parseInt(id)]);
      }
      await loadMaterials();
      setCountEntries({});
    } catch { alert('Error al guardar ajustes.'); }
    finally { setSaving(false); }
  };

  const FilterBar = () => (
    <div className="flex items-center gap-3">
      <label className="text-xs font-bold text-slate-500 uppercase">Categoría:</label>
      <select
        value={categoryFilter}
        onChange={e => setCategoryFilter(e.target.value)}
        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 font-medium text-slate-700 bg-white"
      >
        <option value="ALL">Todas</option>
        {categories.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <span className="text-xs text-slate-400">{filtered.length} materiales</span>
    </div>
  );

  // ─── DASHBOARD DE SUB-TARJETAS ───────────────────────────────────────────
  if (!activeSection) return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-6 mt-2">

        {/* SUB-TARJETA 1 — CONTEO */}
        <div className="w-full md:w-[calc(50%-12px)] relative h-40">
          <Card
            onClick={() => { setActiveSection('CONTEO'); setActiveTab('REPORTE'); setSavedIds([]); setCountEntries({}); }}
            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-orange-500 transform hover:-translate-y-1 h-full bg-white overflow-hidden group"
          >
            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-orange-50 text-orange-600 border-r border-orange-100 transition-colors group-hover:bg-orange-100">
              <ClipboardList size={28} />
            </div>
            <div className="ml-16 h-full flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">1. Conteo de Inventario</p>
                <ClipboardList size={16} className="text-orange-400" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-orange-600 tracking-tight">Conteo Físico</div>
                <p className="text-xs text-slate-400 mt-1">Reporte ciego e captura de ajustes</p>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Imprimir · Capturar · Ajustar</p>
              </div>
            </div>
          </Card>
        </div>

        {/* SUB-TARJETA 2 — COSTEO */}
        <div className="w-full md:w-[calc(50%-12px)] relative h-40">
          <Card
            onClick={() => setActiveSection('COSTEO')}
            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-emerald-500 transform hover:-translate-y-1 h-full bg-white overflow-hidden group"
          >
            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-600 border-r border-emerald-100 transition-colors group-hover:bg-emerald-100">
              <DollarSign size={28} />
            </div>
            <div className="ml-16 h-full flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">2. Costeo de Inventario</p>
                <DollarSign size={16} className="text-emerald-400" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-emerald-600 tracking-tight">Valuación</div>
                <p className="text-xs text-slate-400 mt-1">Stock × último precio de compra</p>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase">El dinero dormido en almacén</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );

  // ─── SECCIÓN CONTEO ──────────────────────────────────────────────────────
  if (activeSection === 'CONTEO') return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {([['REPORTE', '📋 Reporte de Conteo'], ['CAPTURA', '✏️ Captura de Inventario']] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 text-sm font-bold rounded-t-lg border-b-2 transition-all ${
              activeTab === key
                ? 'border-orange-500 text-orange-700 bg-orange-50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}>{label}</button>
        ))}
      </div>

      <FilterBar />

      {/* TAB REPORTE */}
      {activeTab === 'REPORTE' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">Imprime este reporte para el conteo físico. <strong>No muestra cantidades del sistema.</strong></p>
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition">
              <Printer size={15}/> Imprimir Reporte
            </button>
          </div>
          {loading ? <div className="text-center py-12 text-slate-400">Cargando...</div> : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wider">
                  <tr>
                    <SortHeader col="sku" label="SKU" />
                    <SortHeader col="name" label="Material" />
                    <SortHeader col="category" label="Categoría" />
                    <th className="px-4 py-3 text-center font-bold">Unidad de Uso</th>
                    <th className="px-4 py-3 text-center font-bold">Cantidad Física</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((m, i) => (
                    <tr key={m.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{m.sku}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{m.name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{m.category}</td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{m.usage_unit}</td>
                      <td className="px-4 py-2.5 text-center"><div className="w-24 mx-auto border-b-2 border-slate-300 h-6"/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CAPTURA */}
      {activeTab === 'CAPTURA' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">Captura las cantidades contadas. Valentina calculará y aplicará los ajustes.</p>
            <button onClick={handleAdjustAll} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition disabled:opacity-50">
              <ClipboardCheck size={15}/> Aplicar Todos los Ajustes
            </button>
          </div>
          {loading ? <div className="text-center py-12 text-slate-400">Cargando...</div> : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wider">
                  <tr>
                    <SortHeader col="sku" label="SKU" />
                    <SortHeader col="name" label="Material" />
                    <th className="px-4 py-3 text-center font-bold">Unidad de Uso</th>
                    <th className="px-4 py-3 text-center font-bold">Stock Sistema</th>
                    <th className="px-4 py-3 text-center font-bold">Cantidad Contada</th>
                    <th className="px-4 py-3 text-center font-bold">Diferencia</th>
                    <th className="px-4 py-3 text-center font-bold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((m, i) => {
                    const counted = countEntries[m.id];
                    const diff = counted !== undefined && counted !== '' ? parseFloat(counted) - m.physical_stock : null;
                    const isSaved = savedIds.includes(m.id);
                    return (
                      <tr key={m.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} ${isSaved ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-2 font-mono text-xs text-slate-500">{m.sku}</td>
                        <td className="px-4 py-2 font-medium text-slate-800">{m.name}</td>
                        <td className="px-4 py-2 text-center text-slate-500">{m.usage_unit}</td>
                        <td className="px-4 py-2 text-center font-bold text-slate-700">{m.physical_stock}</td>
                        <td className="px-4 py-2 text-center">
                          <input type="number" min="0" step="0.01" disabled={isSaved}
                            value={counted ?? ''}
                            onChange={e => setCountEntries(prev => ({ ...prev, [m.id]: e.target.value }))}
                            className="w-24 text-center border border-slate-300 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:border-orange-400 disabled:bg-slate-100"
                            placeholder="0"/>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {diff !== null
                            ? <span className={`font-bold text-sm ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-400'}`}>{diff > 0 ? '+' : ''}{diff.toFixed(2)}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {isSaved
                            ? <span className="text-xs font-bold text-emerald-600">✅ Guardado</span>
                            : <button onClick={() => handleAdjust(m)} disabled={saving || counted === undefined || counted === ''}
                                className="px-3 py-1 text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-30 transition">
                                Ajustar
                              </button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ─── SECCIÓN COSTEO ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <FilterBar />
        <div className="text-right">
          <p className="text-xs text-slate-400 uppercase font-bold">Valuación Total</p>
          <p className="text-2xl font-black text-emerald-600">
            ${totalValuation.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-slate-400">Cargando...</div> : (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wider">
              <tr>
                <SortHeader col="sku" label="SKU" />
                <SortHeader col="name" label="Material" />
                <SortHeader col="category" label="Categoría" />
                <th className="px-4 py-3 text-center font-bold">Unidad de Uso</th>
                <th className="px-4 py-3 text-right font-bold">Stock</th>
                <th className="px-4 py-3 text-right font-bold">Último Precio</th>
                <th className="px-4 py-3 text-right font-bold">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((m, i) => (
                <tr key={m.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{m.sku}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{m.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{m.category}</td>
                  <td className="px-4 py-2.5 text-center text-slate-600">{m.usage_unit}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-700">{m.physical_stock}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">${m.current_cost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2.5 text-right font-black text-emerald-700">
                    ${(m.physical_stock * m.current_cost).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
              <tr>
                <td colSpan={6} className="px-4 py-3 font-black text-emerald-800 text-right uppercase text-xs tracking-wider">Total Valuación</td>
                <td className="px-4 py-3 font-black text-emerald-700 text-right text-base">
                  ${totalValuation.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default PhysicalInventoryModule;
