/**
 * InstanceBaptismPage  —  "Bautizo" Masivo de Instancias
 *
 * Pantalla intermedia que aparece al confirmar una Orden de Venta.
 * Muestra todas las instancias generadas y permite que el Vendedor /
 * Diseñador asigne aliases (custom_names) antes de pasar a planeación.
 *
 * Ejemplo de nombre: "Casa 123, Calle 98 – Cocina Integral"
 *
 * Uso:
 *   <InstanceBaptismPage orderId={123} instances={instances} onComplete={() => navigate('/planning')} />
 */

import { useState } from 'react';
import { planningService, BaptismEntry } from '../../../api/planning-service';

interface RawInstance {
  id: number;
  custom_name: string;
  product_name?: string;
}

interface Props {
  orderId: number;
  projectName: string;
  instances: RawInstance[];
  onComplete: () => void;
  onSkip?: () => void;
}

export default function InstanceBaptismPage({
  orderId,
  projectName,
  instances,
  onComplete,
  onSkip,
}: Props) {
  const [names, setNames] = useState<Record<number, string>>(
    Object.fromEntries(instances.map(i => [i.id, i.custom_name]))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleChange = (id: number, value: string) => {
    setNames(prev => ({ ...prev, [id]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload: BaptismEntry[] = instances.map(i => ({
        instance_id: i.id,
        custom_name: names[i.id]?.trim() || i.custom_name,
      }));
      await planningService.baptizeInstances(orderId, payload);
      setSaved(true);
      setTimeout(() => onComplete(), 800);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al guardar los alias. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const allFilled = instances.every(i => (names[i.id] ?? '').trim().length > 0);

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center pt-10 px-4 pb-16">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-800 text-white text-xl mb-3">
            🏷️
          </div>
          <h1 className="text-xl font-bold text-slate-800">Configuración de Instancias</h1>
          <p className="text-sm text-slate-500 mt-1">
            Orden de Venta:{' '}
            <span className="font-semibold text-slate-700">{projectName}</span>
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Asigna un alias descriptivo a cada instancia antes de enviarlas a planeación.
            Ej: <em>"Casa 123, Calle 98 – Cocina"</em>
          </p>
        </div>

        {/* Instance table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-[2fr_3fr] text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3 border-b border-slate-100 bg-slate-50">
            <span>Producto</span>
            <span>Alias / Ubicación</span>
          </div>

          <div className="divide-y divide-slate-100">
            {instances.map((inst, idx) => (
              <div
                key={inst.id}
                className="grid grid-cols-[2fr_3fr] items-center gap-3 px-5 py-3"
              >
                <div>
                  <p className="text-sm text-slate-700 font-medium">
                    {inst.product_name ?? 'Producto'}
                  </p>
                  <p className="text-xs text-slate-400">Instancia #{idx + 1}</p>
                </div>
                <input
                  type="text"
                  value={names[inst.id] ?? ''}
                  onChange={e => handleChange(inst.id, e.target.value)}
                  placeholder={`Alias instancia #${idx + 1}`}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition"
                />
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={handleSave}
            disabled={loading || !allFilled || saved}
            className={`
              w-full py-3 rounded-xl text-sm font-semibold transition-all
              ${saved
                ? 'bg-green-500 text-white'
                : 'bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed'}
            `}
          >
            {loading ? 'Guardando...' : saved ? '✓ Alias guardados' : `Confirmar ${instances.length} instancias y enviar a Planeación`}
          </button>

          {onSkip && (
            <button
              onClick={onSkip}
              className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              Omitir por ahora (los alias se pueden editar más tarde)
            </button>
          )}
        </div>

        {/* Progress */}
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-800 rounded-full transition-all"
              style={{
                width: `${Math.round(
                  (instances.filter(i => (names[i.id] ?? '').trim().length > 0).length / instances.length) * 100
                )}%`,
              }}
            />
          </div>
          <span className="text-[10px] text-slate-400">
            {instances.filter(i => (names[i.id] ?? '').trim().length > 0).length}/{instances.length}
          </span>
        </div>
      </div>
    </div>
  );
}
