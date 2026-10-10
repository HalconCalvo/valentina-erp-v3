import React, { useState } from 'react';
import { Package, Pencil } from 'lucide-react';

import { Input } from '@/components/ui/Input';
import { formatDate } from '@/utils/format';
import { getLocalTodayDateKey, getSemaphoreBadgeMark, getSemaphoreConfig } from '../../../planning/hooks/usePlanning';

/** Texto del badge sin emoji inicial (el dot de color ya identifica el estado). */
function semaphoreBadgeDisplayText(semaphoreLabel: string | null | undefined, cfgLabel: string): string {
  let text = (semaphoreLabel?.trim() || cfgLabel).trim();
  text = text.replace(/^⚪⚠️\s*/u, '').replace(/^🔵🟢\s*/u, '').replace(/^🔵🔵\s*/u, '').replace(/^🟢🟢\s*/u, '');
  text = text.replace(/^[\s]*(?:🔴|🟡|🔵|🟢|⚪|⬜|⚠️|🔘|🟣)\s*/u, '');
  return text.trim();
}

function InstanceSemaphoreBadge({
  semaphore,
  semaphoreLabel,
}: {
  semaphore?: string | null;
  semaphoreLabel?: string | null;
}) {
  const sem = semaphore ?? 'GRAY';
  const cfg = getSemaphoreConfig(sem);
  const mark = getSemaphoreBadgeMark(sem);
  const text = semaphoreBadgeDisplayText(semaphoreLabel, cfg.label);
  return (
    <span
      className={`inline-flex items-center gap-1.5 max-w-[12rem] text-[10px] font-bold shrink-0 ${cfg.text}`}
      title={text}
    >
      {mark.kind === 'icon' ? (
        <span className="text-sm leading-none shrink-0" aria-hidden>{mark.icon}</span>
      ) : (
        <span className={mark.dotClass} aria-hidden />
      )}
      <span className="truncate leading-tight">{text}</span>
    </span>
  );
}

function formatInstanceCasaSubtitle(projectName: string, inst: { street?: string | null; lot?: string | null }) {
  const casa = [inst.street?.trim(), inst.lot?.trim()].filter(Boolean).join(', ');
  return [projectName?.trim(), casa].filter(Boolean).join(' · ');
}

function formatDeliveryDeadlineDisplay(iso: string | null | undefined): string {
  const raw = typeof iso === 'string' ? iso.trim() : '';
  return raw ? formatDate(raw.slice(0, 10)) : 'Sin fecha estimada';
}

function deliveryDeadlineInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function InstanceDeliveryDeadlineCell({
  deliveryDeadline,
  canEdit,
  disabled,
  onCommit,
}: {
  deliveryDeadline?: string | null;
  canEdit: boolean;
  disabled?: boolean;
  onCommit: (dateKey: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const display = formatDeliveryDeadlineDisplay(deliveryDeadline);
  const todayMin = getLocalTodayDateKey();

  if (!canEdit) {
    return (
      <span className="text-[10px] font-semibold text-slate-600 shrink-0" title={display}>
        {display}
      </span>
    );
  }

  if (editing) {
    return (
      <Input
        type="date"
        min={todayMin}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft && draft >= todayMin) {
            onCommit(draft);
            setEditing(false);
          }
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={() => {
          if (draft && draft >= todayMin) {
            onCommit(draft);
          }
          setEditing(false);
        }}
        className="h-7 w-[9.5rem] text-[10px] px-2 py-0 rounded-lg"
        autoFocus
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setDraft(deliveryDeadlineInputValue(deliveryDeadline));
        setEditing(true);
      }}
      className="text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 hover:underline shrink-0 disabled:opacity-50 text-left"
      title="Editar fecha estimada de entrega"
    >
      {display}
    </button>
  );
}

const INSTANCE_STATUS_META: Record<string, { label: string; cls: string }> = {
    PENDING:       { label: 'Pendiente',     cls: 'bg-slate-100 text-slate-600' },
    IN_PRODUCTION: { label: 'En Producción', cls: 'bg-blue-50 text-blue-700' },
    READY:         { label: 'Empacado',      cls: 'bg-cyan-50 text-cyan-700' },
    CARGADO:       { label: 'Cargado',       cls: 'bg-indigo-50 text-indigo-700' },
    INSTALLED:     { label: 'Instalado',     cls: 'bg-green-50 text-green-700' },
    CLOSED:        { label: 'Cerrado',       cls: 'bg-emerald-100 text-emerald-800' },
    WARRANTY:      { label: 'Garantía',      cls: 'bg-amber-50 text-amber-700' },
};

interface DeliverablesSectionProps {
    uniqueItems: any[];
    resaleItems: any[];
    housesInOrder: any[];
    projectName: string;
    canEditDescription: boolean;
    canEditDeliveryDeadline: boolean;
    savingDeliveryInstanceId: number | null;
    onDeliveryDeadlineCommit: (instanceId: number, dateKey: string) => void;
    onEditDescription: (item: any) => void;
    formatCurrency: (value: number) => string;
}

/** Deliverables of the OV by instance or by house: production status, traffic light and estimated delivery date. */
export const DeliverablesSection: React.FC<DeliverablesSectionProps> = ({
    uniqueItems, resaleItems, housesInOrder, projectName, canEditDescription, canEditDeliveryDeadline,
    savingDeliveryInstanceId, onDeliveryDeadlineCommit, onEditDescription, formatCurrency,
}) => {
    const [deliverablesTab, setDeliverablesTab] = useState<'instancia' | 'casa'>('instancia');
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <h3 className="text-sm font-black text-slate-700 flex items-center gap-2 mb-2">
                    <Package size={16} className="text-slate-400"/>
                    Desglose de Entregables
                </h3>
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => setDeliverablesTab('instancia')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition ${deliverablesTab === 'instancia' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                    >
                        Por Instancia
                    </button>
                    <button
                        type="button"
                        onClick={() => setDeliverablesTab('casa')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition ${deliverablesTab === 'casa' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                    >
                        Por Casa
                    </button>
                </div>
            </div>
            <div className="max-h-72 overflow-y-auto p-3 space-y-3">
              {deliverablesTab === 'instancia' && (
                <>
                {/* ESCUDO: Cortamos las instancias a la cantidad real que marca la OV */}
                {uniqueItems.filter((item: any) => !item.is_resale).map((item: any) => {
                    const units = item.instances ?? [];
                    if (units.length === 0 && !item.is_cancelled) return null;
                    const cancelledLine = Boolean(item.is_cancelled);
                    return (
                        <div key={item.id} className={`border rounded-lg overflow-hidden shadow-sm ${cancelledLine ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
                            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                                <div className="min-w-0">
                                    <p className={`text-sm font-black text-slate-700 truncate ${cancelledLine ? 'line-through' : ''}`}>{item.product_name}</p>
                                    {item.commercial_description && (
                                        <p className="text-[11px] text-slate-500 truncate" title={item.commercial_description}>{item.commercial_description}</p>
                                    )}
                                    <p className="text-[11px] text-slate-500">
                                        {cancelledLine
                                            ? `Partida cancelada: ${item.cancel_reason || 'sin motivo'}`
                                            : `${item.quantity} ${item.quantity === 1 ? 'unidad' : 'unidades'} × ${formatCurrency(item.unit_price || 0)}`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {!cancelledLine && (
                                        <span className="text-sm font-black text-slate-700">
                                            {formatCurrency((item.unit_price || 0) * (item.quantity || 0))}
                                        </span>
                                    )}
                                    {canEditDescription && !cancelledLine && (
                                        <button
                                            type="button"
                                            onClick={() => onEditDescription(item)}
                                            className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                                            title="Editar descripción comercial"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="divide-y divide-slate-100 bg-white">
                                {units.map((inst: any) => (
                                    <div key={inst.id} className={`py-2 pl-8 pr-4 flex flex-wrap gap-2 justify-between items-center text-sm ${inst.is_cancelled ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50'}`}>
                                        <div className="flex items-start gap-3 min-w-0 flex-1 flex-wrap">
                                            <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-slate-300" />
                                            <div className="min-w-0">
                                                <span className={`font-bold text-slate-700 block truncate ${inst.is_cancelled ? 'line-through' : ''}`}>
                                                    {inst.custom_name || inst.item_name}
                                                </span>
                                                <p className="text-[10px] text-slate-600 truncate">
                                                    {inst.is_cancelled
                                                        ? `Cancelada: ${inst.cancel_reason || 'sin motivo'}`
                                                        : formatInstanceCasaSubtitle(projectName, inst)}
                                                </p>
                                            </div>
                                            {!inst.is_cancelled && (
                                                <>
                                                    <InstanceSemaphoreBadge
                                                        semaphore={inst.semaphore}
                                                        semaphoreLabel={inst.semaphore_label}
                                                    />
                                                    <InstanceDeliveryDeadlineCell
                                                        deliveryDeadline={inst.delivery_deadline}
                                                        canEdit={canEditDeliveryDeadline}
                                                        disabled={savingDeliveryInstanceId === inst.id}
                                                        onCommit={(dateKey) => onDeliveryDeadlineCommit(inst.id, dateKey)}
                                                    />
                                                </>
                                            )}
                                        </div>
                                        <div className="text-right flex items-center justify-end gap-2 shrink-0 flex-wrap">
                                            <span className={`text-xs font-bold px-2 py-1 rounded ${
                                                inst.is_cancelled
                                                ? 'bg-slate-200 text-slate-500'
                                                : inst.customer_payment_id
                                                ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                                : 'bg-slate-100 text-slate-500'
                                            }`}>
                                                {inst.is_cancelled ? 'CANCELADA' : inst.customer_payment_id ? 'FACTURADO' : 'PENDIENTE'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
                {resaleItems.length > 0 && (
                    <div className="mt-4 px-5 pb-3">
                        <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                            Accesorios de reventa
                        </p>
                        <div className="space-y-2">
                            {resaleItems.map((item: any) => (
                                <div key={item.id} className={`bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2 ${item.is_cancelled ? 'opacity-60' : ''}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="min-w-0">
                                            <p className={`text-sm font-bold text-slate-800 truncate ${item.is_cancelled ? 'line-through' : ''}`}>{item.product_name}</p>
                                            <p className="text-xs text-slate-500">
                                                {item.is_cancelled
                                                    ? `Cancelado: ${item.cancel_reason || 'sin motivo'}`
                                                    : `SKU ${item.resale_sku ?? '—'} · Cant. ${item.quantity}`}
                                            </p>
                                        </div>
                                        <div className="flex items-center shrink-0">
                                            {!item.is_cancelled && (
                                                <p className="text-sm font-black text-emerald-700">
                                                    {formatCurrency((item.unit_price || 0) * (item.quantity || 1))}
                                                </p>
                                            )}
                                            {canEditDescription && !item.is_cancelled && (
                                                <button
                                                    type="button"
                                                    onClick={() => onEditDescription(item)}
                                                    className="ml-3 p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                                                    title="Editar descripción comercial"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                </>
              )}

              {deliverablesTab === 'casa' && (
                <div className="space-y-3">
                  {housesInOrder.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">No hay instancias.</p>
                  ) : (
                    housesInOrder.map((house: any) => (
                      <div key={house.key} className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                        <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                          <p className="text-sm font-black text-slate-700">
                            {house.key === '__unassigned__'
                              ? '⬜ Sin asignar'
                              : `🏠 ${house.street}${house.street && house.lot ? ', ' : ''}${house.lot}`}
                          </p>
                          <span className="text-[11px] text-slate-500">{house.items.length} mueble{house.items.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="divide-y divide-slate-100 bg-white">
                          {house.items.map((mueble: any) => {
                            const meta = INSTANCE_STATUS_META[mueble.production_status] ?? { label: mueble.production_status, cls: 'bg-slate-100 text-slate-500' };
                            return (
                              <div key={mueble.id} className="py-2 px-4 flex flex-wrap gap-2 justify-between items-center hover:bg-slate-50 text-sm">
                                <div className="flex items-start gap-3 min-w-0 flex-1 flex-wrap">
                                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-slate-300" />
                                  <div className="min-w-0">
                                    <span className="font-bold text-slate-700 block truncate">
                                      {mueble.custom_name || mueble.product_name}
                                    </span>
                                    <p className="text-[10px] text-slate-600 truncate">
                                      {formatInstanceCasaSubtitle(projectName, mueble)}
                                    </p>
                                  </div>
                                  <InstanceSemaphoreBadge
                                    semaphore={mueble.semaphore}
                                    semaphoreLabel={mueble.semaphore_label}
                                  />
                                  <InstanceDeliveryDeadlineCell
                                    deliveryDeadline={mueble.delivery_deadline}
                                    canEdit={canEditDeliveryDeadline}
                                    disabled={savingDeliveryInstanceId === mueble.id}
                                    onCommit={(dateKey) => onDeliveryDeadlineCommit(mueble.id, dateKey)}
                                  />
                                </div>
                                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                  {mueble.customer_payment_id ? (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">FACTURADO</span>
                                  ) : (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${meta.cls}`}>{meta.label}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
        </div>
    );
};
