import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  Wrench,
  BarChart3,
  Lock,
  Unlock,
  CheckCircle,
  CheckCircle2,
  Bell,
  Search,
  TrendingUp,
  AlertTriangle,
  SkipForward,
} from 'lucide-react';
import { treasuryService, InstallerPayrollOverview, PayrollPaymentRecord } from '../../../api/treasury-service';
import { salesService } from '../../../api/sales-service';
import {
  CommissionsPayrollOverview,
  PayrollCommissionRow,
} from '../../../types/sales';
import { BankAccount, WeeklyFixedCostPayload } from '../../../types/treasury';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export type PayrollLevel1 = 'COMMISSIONS' | 'INSTALLATIONS' | 'WEEKLY' | null;
type SubView = 'RETAINED' | 'PAYABLE' | 'PAID';

function daysWaitingClass(days: number): string {
  if (days > 7) return 'text-red-600 font-black';
  if (days > 3) return 'text-orange-600 font-bold';
  return 'text-slate-600';
}

function groupByInstaller(rows: PayrollPaymentRecord[]): Map<number, PayrollPaymentRecord[]> {
  const m = new Map<number, PayrollPaymentRecord[]>();
  rows.forEach((r) => {
    const list = m.get(r.user_id) || [];
    list.push(r);
    m.set(r.user_id, list);
  });
  return m;
}

/** Misma base visual que las tarjetas del tablero en TreasuryPage.tsx */
const payrollCardShellClass =
  'p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group';

interface Props {
  /** Roles que pueden guardar el cierre semanal de costos fijos (alineado con API). */
  canCaptureWeeklyFixed: boolean;
  payrollLevel1: PayrollLevel1;
  onPayrollLevel1Change: (v: PayrollLevel1) => void;
  accounts: BankAccount[];
  onOrderInspect: (orderId: number) => Promise<void>;
  onRefresh: () => void;
  /** Numeración 5.1–5.3 en tablero Administración V4. */
  adminV4Labels?: boolean;
}

export const PayrollAuditPanel: React.FC<Props> = ({
  canCaptureWeeklyFixed,
  payrollLevel1: level1,
  onPayrollLevel1Change: setLevel1,
  accounts,
  onOrderInspect,
  onRefresh,
  adminV4Labels = false,
}) => {
  const [commSub, setCommSub] = useState<SubView>('RETAINED');
  const [instSub, setInstSub] = useState<SubView>('RETAINED');

  const [coOverview, setCoOverview] = useState<CommissionsPayrollOverview | null>(null);
  const [instOverview, setInstOverview] = useState<InstallerPayrollOverview | null>(null);

  const [commDeferReason, setCommDeferReason] = useState<Record<string, string>>({});
  const [expandedCommDeferKey, setExpandedCommDeferKey] = useState<string | null>(null);
  const [instDeferReason, setInstDeferReason] = useState<Record<number, string>>({});
  const [expandedInstDeferId, setExpandedInstDeferId] = useState<number | null>(null);
  const [instBankPick, setInstBankPick] = useState<Record<number, number>>({});

  const [weekly, setWeekly] = useState<WeeklyFixedCostPayload>({
    week_reference_date: new Date().toISOString().slice(0, 10),
    admin_payroll: 0,
    design_sales_payroll: 0,
    production_plant_payroll: 0,
    notes: '',
  });
  const [weeklySaving, setWeeklySaving] = useState(false);
  const [weeklyLast, setWeeklyLast] = useState<Awaited<
    ReturnType<typeof treasuryService.getLatestWeeklyFixedCosts>
  >>(null);

  const loadOverviews = useCallback(async () => {
    try {
      const [co, inst, wk] = await Promise.all([
        salesService.getCommissionsPayrollOverview(),
        treasuryService.getInstallerPayrollOverview(),
        treasuryService.getLatestWeeklyFixedCosts(),
      ]);
      setCoOverview(co);
      setInstOverview(inst);
      setWeeklyLast(wk);
      if (wk) {
        setWeekly((prev) => ({
          ...prev,
          week_reference_date: wk.week_reference_date.slice(0, 10),
          admin_payroll: wk.admin_payroll,
          design_sales_payroll: wk.design_sales_payroll,
          production_plant_payroll: wk.production_plant_payroll,
          notes: wk.notes || '',
        }));
      }
    } catch (e) {
      console.error('Error cargando nómina:', e);
    }
  }, []);

  useEffect(() => {
    loadOverviews();
  }, [loadOverviews]);

  const fmt = (n: number) =>
    n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  const commissionRows = useMemo(() => {
    if (!coOverview) return { RETAINED: [] as PayrollCommissionRow[], PAYABLE: [] as PayrollCommissionRow[], PAID: [] as PayrollCommissionRow[] };
    return {
      RETAINED: coOverview.retained,
      PAYABLE: coOverview.payable,
      PAID: coOverview.paid,
    };
  }, [coOverview]);

  const installationRows = useMemo(() => {
    if (!instOverview) {
      return { RETAINED: [] as PayrollPaymentRecord[], PAYABLE: [] as PayrollPaymentRecord[], PAID: [] as PayrollPaymentRecord[] };
    }
    return {
      RETAINED: instOverview.retained,
      PAYABLE: instOverview.payable,
      PAID: instOverview.paid,
    };
  }, [instOverview]);

  const totals = useMemo(
    () => ({
      comm: {
        RETAINED: coOverview?.retained_total ?? 0,
        PAYABLE: coOverview?.payable_total ?? 0,
        PAID: coOverview?.paid_total ?? 0,
      },
      inst: {
        RETAINED: instOverview?.retained_total ?? 0,
        PAYABLE: instOverview?.payable_total ?? 0,
        PAID: instOverview?.paid_total ?? 0,
      },
    }),
    [coOverview, instOverview]
  );

  const commKey = (row: PayrollCommissionRow) =>
    row.id != null ? `id:${row.id}` : `so:${row.sales_order_id}`;

  const openCommDefer = (row: PayrollCommissionRow) => {
    const k = commKey(row);
    setExpandedCommDeferKey((prev) => (prev === k ? null : k));
    setCommDeferReason((m) => ({
      ...m,
      [k]: m[k] ?? row.admin_notes ?? '',
    }));
  };

  const openInstDefer = (row: PayrollPaymentRecord) => {
    setExpandedInstDeferId((prev) => (prev === row.id ? null : row.id));
    setInstDeferReason((m) => ({
      ...m,
      [row.id]: m[row.id] ?? row.admin_notes ?? '',
    }));
  };

  const handleDeferCommission = async (row: PayrollCommissionRow) => {
    if (!row.id) return;
    const k = commKey(row);
    const note = commDeferReason[k]?.trim();
    if (!note) {
      alert('Escribe el motivo del diferimiento u omisión.');
      return;
    }
    await salesService.updateCommissionPayroll(row.id, {
      admin_notes: note,
      payroll_deferred: true,
    });
    setExpandedCommDeferKey(null);
    await loadOverviews();
    onRefresh();
  };

  const handleDeferInstall = async (row: PayrollPaymentRecord) => {
    const note = instDeferReason[row.id]?.trim();
    if (!note) {
      alert('Escribe el motivo del diferimiento u omisión.');
      return;
    }
    await treasuryService.deferInstallerPayroll(row.id, note);
    setExpandedInstDeferId(null);
    await loadOverviews();
    onRefresh();
  };

  const handlePayInstall = async (row: PayrollPaymentRecord) => {
    const bankId = instBankPick[row.id];
    if (accounts.length > 0) {
      if (bankId == null || Number.isNaN(bankId)) {
        alert('Selecciona la cuenta bancaria de salida.');
        return;
      }
    }
    await treasuryService.markPayrollPaid(row.id, true, bankId);
    await loadOverviews();
    onRefresh();
  };

  const saveWeekly = async () => {
    if (!canCaptureWeeklyFixed) return;
    setWeeklySaving(true);
    try {
      await treasuryService.saveWeeklyFixedCosts(weekly);
      await loadOverviews();
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setWeeklySaving(false);
    }
  };

  const renderCommissionTable = (view: SubView) => {
    const rows = commissionRows[view];
    const payableCols = 4;
    return (
      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b text-[10px] uppercase text-slate-500 font-bold">
              <th className="p-3">OV / Referencia</th>
              <th className="p-3">Asesor</th>
              <th className="p-3 text-right">Monto</th>
              {view === 'RETAINED' && <th className="p-3 text-center">Días espera</th>}
              <th className="p-3 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, idx) => (
              <React.Fragment key={`${row.kind}-${row.id ?? idx}`}>
                <tr className="hover:bg-slate-50">
                  <td className="p-3">
                    <p className="font-bold text-slate-800">
                      OV-{String(row.sales_order_id).padStart(4, '0')} · {row.project_name || '—'}
                    </p>
                    <p className="text-xs text-slate-500">{row.reference_label}</p>
                  </td>
                  <td className="p-3">{row.seller_name || '—'}</td>
                  <td className="p-3 text-right font-black text-slate-800">{fmt(row.amount)}</td>
                  {view === 'RETAINED' && (
                    <td className={`p-3 text-center ${daysWaitingClass(row.days_waiting)}`}>
                      {row.days_waiting} d
                    </td>
                  )}
                  <td className="p-3 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => onOrderInspect(row.sales_order_id)}
                    >
                      Rayos X
                    </Button>
                    {view === 'PAYABLE' && row.id != null && (
                      <button
                        type="button"
                        className="ml-2 text-xs text-orange-700 font-bold inline-flex items-center gap-1"
                        onClick={() => openCommDefer(row)}
                      >
                        <SkipForward size={12} /> Diferir / Omitir
                      </button>
                    )}
                  </td>
                </tr>
                {view === 'PAYABLE' && row.id != null && expandedCommDeferKey === commKey(row) && (
                  <tr className="bg-orange-50/50">
                    <td colSpan={payableCols} className="p-4 border-t border-orange-100">
                      <p className="text-xs font-bold text-orange-900 mb-2">
                        Motivo del diferimiento u omisión (obligatorio)
                      </p>
                      <textarea
                        className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm mb-3"
                        rows={3}
                        placeholder="Describe la razón para auditoría…"
                        value={commDeferReason[commKey(row)] ?? ''}
                        onChange={(e) =>
                          setCommDeferReason((m) => ({ ...m, [commKey(row)]: e.target.value }))
                        }
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="bg-orange-700 hover:bg-orange-800"
                          onClick={() => handleDeferCommission(row)}
                        >
                          Confirmar omisión
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setExpandedCommDeferKey(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-8 text-center text-slate-500 italic">Sin registros en esta bandeja.</div>
        )}
      </div>
    );
  };

  const renderInstallationGrouped = (view: SubView) => {
    const rows = installationRows[view];
    const grouped = groupByInstaller(rows);
    return (
      <div className="space-y-8">
        {rows.length === 0 && (
          <div className="p-8 text-center text-slate-500 italic bg-white rounded-xl border shadow-sm">
            Sin registros.
          </div>
        )}
        {Array.from(grouped.entries()).map(([uid, list]) => (
          <div
            key={uid}
            className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm"
          >
            <div className="bg-slate-100 px-4 py-2 font-black text-slate-800 flex justify-between items-center">
              <span>{list[0]?.user_name || `Instalador #${uid}`}</span>
              <span className="text-emerald-700">
                {fmt(list.reduce((s, r) => s + r.total_amount, 0))}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase text-slate-500 border-b">
                  <th className="p-2 text-left">Instancia</th>
                  <th className="p-2 text-right">Total</th>
                  {view === 'RETAINED' && <th className="p-2 text-center">Días espera</th>}
                  {view === 'PAYABLE' && <th className="p-2 text-center">Pago</th>}
                  {view === 'PAID' && <th className="p-2 text-left text-xs">Pagado</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr>
                      <td className="p-2">{r.instance_name || '—'}</td>
                      <td className="p-2 text-right font-bold text-emerald-800">{fmt(r.total_amount)}</td>
                      {view === 'RETAINED' && (
                        <td className={`p-2 text-center ${daysWaitingClass(r.days_waiting ?? 0)}`}>
                          {r.days_waiting ?? 0} d
                        </td>
                      )}
                      {view === 'PAYABLE' && (
                        <td className="p-2 text-center flex flex-wrap gap-1 justify-center items-center">
                          <select
                            className="text-xs border rounded px-1 py-1 max-w-[140px]"
                            value={instBankPick[r.id] != null ? String(instBankPick[r.id]) : ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              setInstBankPick((m) => {
                                const n = { ...m };
                                if (!v) delete n[r.id];
                                else n[r.id] = Number(v);
                                return n;
                              });
                            }}
                          >
                            <option value="">Cuenta banco</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="px-2 py-1 bg-emerald-600 text-white text-xs font-bold rounded"
                            onClick={() => handlePayInstall(r)}
                          >
                            Pagar
                          </button>
                          <button
                            type="button"
                            className="text-xs text-orange-700 font-bold"
                            onClick={() => openInstDefer(r)}
                          >
                            Diferir / Omitir
                          </button>
                        </td>
                      )}
                      {view === 'PAID' && (
                        <td className="p-2 text-xs text-slate-500">
                          {r.paid_at ? new Date(r.paid_at).toLocaleString('es-MX') : '—'}
                        </td>
                      )}
                    </tr>
                    {view === 'PAYABLE' && expandedInstDeferId === r.id && (
                      <tr className="bg-orange-50/50">
                        <td colSpan={view === 'RETAINED' ? 3 : 3} className="p-4 border-t border-orange-100">
                          <p className="text-xs font-bold text-orange-900 mb-2">
                            Motivo del diferimiento u omisión (obligatorio)
                          </p>
                          <textarea
                            className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm mb-3"
                            rows={3}
                            placeholder="Describe la razón para auditoría…"
                            value={instDeferReason[r.id] ?? ''}
                            onChange={(e) =>
                              setInstDeferReason((m) => ({ ...m, [r.id]: e.target.value }))
                            }
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              className="bg-orange-700 hover:bg-orange-800"
                              onClick={() => handleDeferInstall(r)}
                            >
                              Confirmar omisión
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setExpandedInstDeferId(null)}>
                              Cancelar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  };

  if (!level1) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in">
        <div className="w-full relative h-40">
          <Card
            onClick={() => setLevel1('COMMISSIONS')}
            className={`${payrollCardShellClass} border-l-indigo-500`}
          >
            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 group-hover:bg-indigo-100 transition-colors">
              <Users size={28} />
            </div>
            <div className="ml-16 h-full flex flex-col justify-between pl-2">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Nómina</p>
                <Users size={16} className="text-indigo-500" />
              </div>
              <div className="flex justify-end">
                <div className="text-lg font-black text-indigo-600 tracking-tight leading-none truncate">
                  {adminV4Labels ? '5.1 Comisiones' : 'Comisiones'}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                  {adminV4Labels ? 'Vendedores (ingreso real)' : 'Retenidas, por pagar, histórico'}
                </p>
                <TrendingUp size={14} className="text-indigo-400" />
              </div>
            </div>
          </Card>
        </div>

        <div className="w-full relative h-40">
          <Card
            onClick={() => setLevel1('INSTALLATIONS')}
            className={`${payrollCardShellClass} border-l-emerald-500`}
          >
            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 group-hover:bg-emerald-100 transition-colors">
              <Wrench size={28} />
            </div>
            <div className="ml-16 h-full flex flex-col justify-between pl-2">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Destajos</p>
                <Wrench size={16} className="text-emerald-500" />
              </div>
              <div className="flex justify-end">
                <div className="text-lg font-black text-emerald-600 tracking-tight leading-none truncate">
                  {adminV4Labels ? '5.2 Instalaciones' : 'Instalaciones'}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                  {adminV4Labels ? 'Doble verde / firmas cliente' : 'Firma, doble verde, pagados'}
                </p>
                <CheckCircle2 size={14} className="text-emerald-400" />
              </div>
            </div>
          </Card>
        </div>

        <div className="w-full relative h-40">
          <Card
            onClick={() => setLevel1('WEEKLY')}
            className={`${payrollCardShellClass} border-l-violet-500`}
          >
            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-violet-50 text-violet-700 border-r border-violet-100 group-hover:bg-violet-100 transition-colors">
              <BarChart3 size={28} />
            </div>
            <div className="ml-16 h-full flex flex-col justify-between pl-2">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">KPI</p>
                <BarChart3 size={16} className="text-violet-500" />
              </div>
              <div className="flex justify-end">
                <div className="text-lg font-black text-violet-700 tracking-tight leading-none truncate">
                  {adminV4Labels ? '5.3 Captura semanal' : 'Nómina semanal'}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                  {adminV4Labels
                    ? 'Admin., Diseño, Producción, Ventas'
                    : 'Cierre jueves — costos fijos'}
                </p>
                <AlertTriangle size={14} className="text-violet-400" />
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      {level1 === 'COMMISSIONS' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="w-full relative h-40">
              <Card
                onClick={() => setCommSub('RETAINED')}
                className={`${payrollCardShellClass} border-l-amber-500 ${commSub === 'RETAINED' ? 'ring-2 ring-amber-200' : ''}`}
              >
                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center border-r font-black transition-colors bg-amber-50 text-amber-700 border-amber-100 group-hover:bg-amber-100">
                  <Lock size={24} />
                </div>
                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                  <div className="flex justify-between items-start">
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Comisiones</p>
                    <Lock size={16} className="text-amber-600" />
                  </div>
                  <div className="flex justify-end">
                    <div className="text-lg font-black text-amber-700 tracking-tight leading-none truncate">
                      A. Retenidas
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{fmt(totals.comm.RETAINED)}</p>
                    <Bell size={14} className="text-amber-400" />
                  </div>
                </div>
              </Card>
            </div>
            <div className="w-full relative h-40">
              <Card
                onClick={() => setCommSub('PAYABLE')}
                className={`${payrollCardShellClass} border-l-indigo-500 ${commSub === 'PAYABLE' ? 'ring-2 ring-indigo-200' : ''}`}
              >
                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-indigo-50 text-indigo-700 border-r border-indigo-100 font-black group-hover:bg-indigo-100 transition-colors">
                  <Unlock size={24} />
                </div>
                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                  <div className="flex justify-between items-start">
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Comisiones</p>
                    <Unlock size={16} className="text-indigo-500" />
                  </div>
                  <div className="flex justify-end">
                    <div className="text-lg font-black text-indigo-600 tracking-tight leading-none truncate">
                      B. Por Pagar
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{fmt(totals.comm.PAYABLE)}</p>
                    <Search size={14} className="text-indigo-400" />
                  </div>
                </div>
              </Card>
            </div>
            <div className="w-full relative h-40">
              <Card
                onClick={() => setCommSub('PAID')}
                className={`${payrollCardShellClass} border-l-emerald-500 ${commSub === 'PAID' ? 'ring-2 ring-emerald-200' : ''}`}
              >
                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black group-hover:bg-emerald-100 transition-colors">
                  <CheckCircle size={24} />
                </div>
                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                  <div className="flex justify-between items-start">
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Comisiones</p>
                    <CheckCircle size={16} className="text-emerald-500" />
                  </div>
                  <div className="flex justify-end">
                    <div className="text-lg font-black text-emerald-600 tracking-tight leading-none truncate">
                      C. Histórico de Pagos
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{fmt(totals.comm.PAID)}</p>
                    <CheckCircle2 size={14} className="text-emerald-400" />
                  </div>
                </div>
              </Card>
            </div>
          </div>
          {commSub === 'RETAINED' && renderCommissionTable('RETAINED')}
          {commSub === 'PAYABLE' && renderCommissionTable('PAYABLE')}
          {commSub === 'PAID' && renderCommissionTable('PAID')}
        </div>
      )}

      {level1 === 'INSTALLATIONS' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="w-full relative h-40">
              <Card
                onClick={() => setInstSub('RETAINED')}
                className={`${payrollCardShellClass} border-l-amber-500 ${instSub === 'RETAINED' ? 'ring-2 ring-amber-200' : ''}`}
              >
                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-amber-50 text-amber-700 border-r border-amber-100 font-black group-hover:bg-amber-100 transition-colors">
                  <Lock size={24} />
                </div>
                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                  <div className="flex justify-between items-start">
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Instalaciones</p>
                    <Lock size={16} className="text-amber-600" />
                  </div>
                  <div className="flex justify-end">
                    <div className="text-lg font-black text-amber-700 tracking-tight leading-none truncate">
                      {fmt(totals.inst.RETAINED)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Sin firma</p>
                    <Bell size={14} className="text-amber-400" />
                  </div>
                </div>
              </Card>
            </div>
            <div className="w-full relative h-40">
              <Card
                onClick={() => setInstSub('PAYABLE')}
                className={`${payrollCardShellClass} border-l-emerald-500 ${instSub === 'PAYABLE' ? 'ring-2 ring-emerald-200' : ''}`}
              >
                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 font-black group-hover:bg-emerald-100 transition-colors">
                  <Unlock size={24} />
                </div>
                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                  <div className="flex justify-between items-start">
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Instalaciones</p>
                    <Unlock size={16} className="text-emerald-500" />
                  </div>
                  <div className="flex justify-end">
                    <div className="text-lg font-black text-emerald-600 tracking-tight leading-none truncate">
                      {fmt(totals.inst.PAYABLE)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Por pagar (doble verde)</p>
                    <Search size={14} className="text-emerald-400" />
                  </div>
                </div>
              </Card>
            </div>
            <div className="w-full relative h-40">
              <Card
                onClick={() => setInstSub('PAID')}
                className={`${payrollCardShellClass} border-l-slate-400 ${instSub === 'PAID' ? 'ring-2 ring-slate-200' : ''}`}
              >
                <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-slate-50 text-slate-700 border-r border-slate-200 font-black group-hover:bg-slate-100 transition-colors">
                  <CheckCircle size={24} />
                </div>
                <div className="ml-16 h-full flex flex-col justify-between pl-2">
                  <div className="flex justify-between items-start">
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Instalaciones</p>
                    <CheckCircle size={16} className="text-slate-600" />
                  </div>
                  <div className="flex justify-end">
                    <div className="text-lg font-black text-slate-700 tracking-tight leading-none truncate">
                      {fmt(totals.inst.PAID)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">Pagadas</p>
                    <CheckCircle2 size={14} className="text-slate-400" />
                  </div>
                </div>
              </Card>
            </div>
          </div>
          {instSub === 'RETAINED' && renderInstallationGrouped('RETAINED')}
          {instSub === 'PAYABLE' && renderInstallationGrouped('PAYABLE')}
          {instSub === 'PAID' && renderInstallationGrouped('PAID')}
        </div>
      )}

      {level1 === 'WEEKLY' && canCaptureWeeklyFixed && (
        <Card className="p-6 border border-slate-200 bg-white shadow-sm rounded-xl">
          <h3 className="font-black text-lg text-slate-800 flex items-center gap-2 mb-4">
            <BarChart3 size={20} className="text-violet-600" /> Cierre de jueves — costos fijos semanales
          </h3>
          {weeklyLast && (
            <p className="text-xs text-slate-600 mb-4">
              Último registro: semana del {weeklyLast.week_reference_date.slice(0, 10)}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm font-bold text-slate-700">
              Fecha referencia (jueves)
              <input
                type="date"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
                value={weekly.week_reference_date}
                onChange={(e) => setWeekly((w) => ({ ...w, week_reference_date: e.target.value }))}
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Nómina Administración
              <input
                type="number"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
                value={weekly.admin_payroll || ''}
                onChange={(e) =>
                  setWeekly((w) => ({ ...w, admin_payroll: parseFloat(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Nómina Diseño / Ventas
              <input
                type="number"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
                value={weekly.design_sales_payroll || ''}
                onChange={(e) =>
                  setWeekly((w) => ({
                    ...w,
                    design_sales_payroll: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Nómina Producción (Planta)
              <input
                type="number"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
                value={weekly.production_plant_payroll || ''}
                onChange={(e) =>
                  setWeekly((w) => ({
                    ...w,
                    production_plant_payroll: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </label>
            <label className="block text-sm font-bold text-slate-700 md:col-span-2">
              Notas del cierre (opcional)
              <textarea
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                rows={2}
                value={weekly.notes || ''}
                onChange={(e) => setWeekly((w) => ({ ...w, notes: e.target.value }))}
              />
            </label>
          </div>
          <Button className="mt-6 bg-violet-700 hover:bg-violet-800" onClick={saveWeekly} disabled={weeklySaving}>
            {weeklySaving ? 'Guardando…' : 'Guardar cierre semanal'}
          </Button>
        </Card>
      )}

      {level1 === 'WEEKLY' && !canCaptureWeeklyFixed && (
        <p className="text-slate-500">Solo personal autorizado puede capturar el cierre semanal.</p>
      )}
    </div>
  );
};
