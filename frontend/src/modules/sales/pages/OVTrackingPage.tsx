import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { salesService } from '../../../api/sales-service';

interface InstanceStatus {
  id: number;
  product_name: string;
  custom_name: string;
  production_status: string;
  production_batch_id: number | null;
  qr_code: string | null;
}

interface HouseStatus {
  street: string;
  lot: string;
  grouping_key: string;
  total: number;
  by_status: Record<string, number>;
  instances: InstanceStatus[];
}

interface OrderHousesStatus {
  order_id: number;
  order_folio: string;
  project_name: string;
  client_name: string;
  status: string;
  houses: HouseStatus[];
  unassigned: InstanceStatus[];
}

// Etapas del flujo normal (en orden, sin PENDING ni WARRANTY)
const FLOW_STAGES = [
  { key: 'IN_PRODUCTION', label: 'En producción' },
  { key: 'READY',         label: 'Empacado'      },
  { key: 'CARGADO',       label: 'Cargado'       },
  { key: 'INSTALLED',     label: 'Instalado'     },
  { key: 'CLOSED',        label: 'Firmado'       },
];

// Orden numérico de estados para saber cuáles están "completados"
const STATUS_RANK: Record<string, number> = {
  PENDING: 0, IN_PRODUCTION: 1, READY: 2,
  CARGADO: 3, INSTALLED: 4, CLOSED: 5, WARRANTY: 6,
};

const OV_STATUS_LABEL: Record<string, string> = {
  WAITING_ADVANCE: 'Esperando anticipo',
  SOLD:            'Vendida',
  IN_PRODUCTION:   'En producción',
};

function houseProgress(by: Record<string, number>, total: number): number {
  if (total === 0) return 0;
  const done = (by.CLOSED || 0) + (by.INSTALLED || 0) + (by.CARGADO || 0) + (by.READY || 0);
  return Math.round((done / total) * 100);
}

function houseBadge(by: Record<string, number>, total: number) {
  if ((by.CLOSED || 0) === total && total > 0)
    return { label: 'Completa', color: '#0F6E56', bg: '#E1F5EE' };
  if ((by.INSTALLED || 0) + (by.CLOSED || 0) > 0)
    return { label: 'Instalando', color: '#185FA5', bg: '#E6F1FB' };
  if ((by.READY || 0) + (by.CARGADO || 0) > 0)
    return { label: 'Lista', color: '#3B6D11', bg: '#EAF3DE' };
  if ((by.IN_PRODUCTION || 0) > 0)
    return { label: 'En producción', color: '#854F0B', bg: '#FAEEDA' };
  return { label: 'Pendiente', color: '#5F5E5A', bg: '#F1EFE8' };
}

function HouseCard({ house }: { house: HouseStatus }) {
  const [open, setOpen] = useState(false);
  const badge = houseBadge(house.by_status, house.total);
  const pct = houseProgress(house.by_status, house.total);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <Home size={14} className="text-slate-400 shrink-0" />
        <span className="text-sm font-bold text-slate-700 flex-1 truncate">
          {house.street}, {house.lot}
        </span>
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-lg shrink-0"
          style={{ background: badge.bg, color: badge.color }}
        >
          {badge.label}
        </span>
        <span className="text-[11px] text-slate-400 shrink-0">
          {house.total} muebles · {pct}%
        </span>
        {open
          ? <ChevronUp size={14} className="text-slate-400 shrink-0" />
          : <ChevronDown size={14} className="text-slate-400 shrink-0" />
        }
      </div>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/50 divide-y divide-slate-50">
          {house.instances.map(inst => {
            const rank = STATUS_RANK[inst.production_status] ?? 0;
            const isWarranty = inst.production_status === 'WARRANTY';
            return (
              <div key={inst.id} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-slate-700 truncate flex-1">
                    {inst.product_name}
                  </span>
                  {isWarranty && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700">
                      ⚠ Garantía
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  {FLOW_STAGES.map(stage => {
                    const checked = !isWarranty && rank >= STATUS_RANK[stage.key];
                    return (
                      <label
                        key={stage.key}
                        className="flex items-center gap-1.5 cursor-default select-none"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          readOnly
                          className="w-3.5 h-3.5 accent-indigo-600 cursor-default"
                        />
                        <span className={`text-[11px] font-bold ${checked ? 'text-slate-700' : 'text-slate-300'}`}>
                          {stage.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OVCard({ ov }: { ov: OrderHousesStatus }) {
  const [open, setOpen] = useState(false);
  const listas = ov.houses.filter(
    h => (h.by_status.CLOSED || 0) === h.total && h.total > 0
  ).length;
  const enProceso = ov.houses.filter(
    h => houseProgress(h.by_status, h.total) > 0 && (h.by_status.CLOSED || 0) < h.total
  ).length;
  const pendientes = ov.houses.length - listas - enProceso;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div
        className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {open
          ? <ChevronUp size={16} className="text-slate-400 shrink-0" />
          : <ChevronDown size={16} className="text-slate-400 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-bold text-slate-800 text-sm">
              {ov.order_folio} — {ov.project_name}
            </p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
              {OV_STATUS_LABEL[ov.status] || ov.status}
            </span>
          </div>
          <p className="text-xs text-slate-400">{ov.client_name}</p>
        </div>
        <div className="flex gap-5 shrink-0">
          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: '#0F6E56' }}>{listas}</p>
            <p className="text-[10px] text-slate-400 uppercase font-bold">Listas</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: '#185FA5' }}>{enProceso}</p>
            <p className="text-[10px] text-slate-400 uppercase font-bold">En proceso</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-400">{pendientes}</p>
            <p className="text-[10px] text-slate-400 uppercase font-bold">Pendientes</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-700">{ov.houses.length}</p>
            <p className="text-[10px] text-slate-400 uppercase font-bold">Casas</p>
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 space-y-3">
          {ov.houses.length === 0 && ov.unassigned.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">
              Sin instancias en esta OV.
            </p>
          )}
          {ov.houses.map(h => <HouseCard key={h.grouping_key} house={h} />)}
          {ov.unassigned.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="shrink-0" />
              {ov.unassigned.length} instancia(s) sin asignar a una casa en esta OV.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OVTrackingPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<OrderHousesStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'attention'>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await salesService.getHousesStatus();
      setData(result);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return data;
    return data.filter(ov =>
      ov.unassigned.length > 0 ||
      ov.houses.some(h => houseProgress(h.by_status, h.total) < 50)
    );
  }, [data, filter]);

  const totalCasas   = data.reduce((s, ov) => s + ov.houses.length, 0);
  const totalListas  = data.reduce((s, ov) => s + ov.houses.filter(
    h => (h.by_status.CLOSED || 0) === h.total && h.total > 0
  ).length, 0);
  const totalProceso = data.reduce((s, ov) => s + ov.houses.filter(
    h => houseProgress(h.by_status, h.total) > 0 && (h.by_status.CLOSED || 0) < h.total
  ).length, 0);

  return (
    <div className="p-8 max-w-5xl mx-auto pb-24 space-y-6 animate-fadeIn">
      <div className="flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mb-2 transition-colors"
          >
            <ArrowLeft size={14} /> Regresar
          </button>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">
            Seguimiento de OV
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Estado de casas por orden de venta activa
            {lastUpdated && (
              <span className="text-slate-300 ml-2">
                · Actualizado {lastUpdated.toLocaleTimeString('es-MX', {
                  hour: '2-digit', minute: '2-digit'
                })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {!loading && !error && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'OVs activas',   value: data.length,    color: 'text-slate-700' },
            { label: 'Casas totales', value: totalCasas,     color: 'text-slate-700' },
            { label: 'Listas',        value: totalListas,    color: 'text-emerald-700' },
            { label: 'En proceso',    value: totalProceso,   color: 'text-blue-700' },
          ].map(m => (
            <div
              key={m.label}
              className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm"
            >
              <p className={`text-2xl font-black ${m.color}`}>{m.value}</p>
              <p className="text-[11px] text-slate-400 uppercase font-bold mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && (
        <div className="flex gap-2">
          {[
            { key: 'all',       label: 'Todas las OVs' },
            { key: 'attention', label: 'Requieren atención' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as 'all' | 'attention')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${
                filter === f.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <RefreshCw size={20} className="animate-spin mr-3" />
          Cargando seguimiento de OVs...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm">No hay OVs que mostrar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(ov => <OVCard key={ov.order_id} ov={ov} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
