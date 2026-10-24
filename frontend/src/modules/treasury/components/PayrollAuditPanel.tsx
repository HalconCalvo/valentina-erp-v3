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
import { BankAccount, WeeklyFixedCostPayload, WeeklyFixedCostRecord } from '../../../types/treasury';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { VTextarea } from '@/components/ui/VTextarea';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { toast } from '@/components/ui/VToast';
import { formatDate, formatDateTime, formatMoney, businessToday } from '@/utils/format';
import { TableActionEditIcon } from '@/lib/tableActionIcons';
import { PayoutDialog, payoutMethodLabel, type PayoutChoice } from './PayoutDialog';

export type PayrollLevel1 = 'COMMISSIONS' | 'INSTALLATIONS' | 'WEEKLY' | null;
type SubView = 'RETAINED' | 'PAYABLE' | 'PAID';
/** Tray chosen inside Comisiones or Destajos; null = the screen of its three cards (Gabriel 20/10). */
export type PayrollTray = SubView | null;

function daysWaitingClass(days: number): string {
  if (days > 7) return 'text-red-600 font-black';
  if (days > 3) return 'text-orange-600 font-bold';
  return 'text-slate-600';
}

const PAYROLL_LANE_LABEL: Record<string, string> = { IM: 'Muebles', IP: 'Piedra' };

const SUB_VIEW_LABEL: Record<SubView, string> = { RETAINED: 'Retenidas (sin firma)', PAYABLE: 'Por pagar', PAID: 'Pagadas' };

/** H50: each payment is one installation (lane) of the house: "Piloto 1 · Muebles". */
export function payrollInstallationLabel(r: Pick<PayrollPaymentRecord, 'instance_name' | 'lane'>): string {
  const lane = r.lane ? PAYROLL_LANE_LABEL[r.lane] ?? r.lane : null;
  return [r.instance_name || '—', lane].filter(Boolean).join(' · ');
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

/** D44: the global commission (beneficiary set in Configuración) shares the trays with the seller's. */
const isGlobal = (row: PayrollCommissionRow) => row.commission_type === 'DIRECTOR_GLOBAL';

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
  /** Navigation rule (Gabriel 20/10): a screen of sub-cards shows only the cards; the chosen tray is its own screen. */
  tray: PayrollTray;
  onTrayChange: (tray: PayrollTray) => void;
}

export const PayrollAuditPanel: React.FC<Props> = ({
  canCaptureWeeklyFixed,
  payrollLevel1: level1,
  onPayrollLevel1Change: setLevel1,
  accounts,
  onOrderInspect,
  onRefresh,
  tray,
  onTrayChange,
}) => {
  // D41 (17:04): only Dirección pays crew payroll and commissions; Gerencia sees the trays (the API enforces it too)
  const canPay = (localStorage.getItem('user_role') || '').toUpperCase().trim() === 'DIRECTOR';
  const [payingId, setPayingId] = useState<number | null>(null);
  const [payInstall, setPayInstall] = useState<{ rows: PayrollPaymentRecord[] } | null>(null);
  const [payComm, setPayComm] = useState<{ rows: PayrollCommissionRow[] } | null>(null);
  const [payingCommission, setPayingCommission] = useState(false);

  const [coOverview, setCoOverview] = useState<CommissionsPayrollOverview | null>(null);
  const [instOverview, setInstOverview] = useState<InstallerPayrollOverview | null>(null);

  const [commDeferReason, setCommDeferReason] = useState<Record<string, string>>({});
  const [expandedCommDeferKey, setExpandedCommDeferKey] = useState<string | null>(null);
  const [instDeferReason, setInstDeferReason] = useState<Record<number, string>>({});
  const [expandedInstDeferId, setExpandedInstDeferId] = useState<number | null>(null);

  const [weekly, setWeekly] = useState<WeeklyFixedCostPayload>({
    week_reference_date: businessToday(),
    admin_payroll: 0,
    design_sales_payroll: 0,
    production_plant_payroll: 0,
    notes: '',
  });
  const [weeklySaving, setWeeklySaving] = useState(false);
  const [weeklyLast, setWeeklyLast] = useState<Awaited<
    ReturnType<typeof treasuryService.getLatestWeeklyFixedCosts>
  >>(null);

  const [histFrom, setHistFrom] = useState<string>('');
  const [histTo, setHistTo] = useState<string>('');
  const [history, setHistory] = useState<WeeklyFixedCostRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editVals, setEditVals] = useState<{ admin_payroll: number; design_sales_payroll: number; production_plant_payroll: number; notes: string }>({ admin_payroll: 0, design_sales_payroll: 0, production_plant_payroll: 0, notes: '' });
  const [savingEdit, setSavingEdit] = useState(false);

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
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error al cargar datos de nómina.');
    }
  }, []);

  useEffect(() => {
    loadOverviews();
  }, [loadOverviews]);

  const fmt = (n: number) =>
    formatMoney(n);

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
      toast.warning('Escribe el motivo del diferimiento u omisión.');
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
      toast.warning('Escribe el motivo del diferimiento u omisión.');
      return;
    }
    await treasuryService.deferInstallerPayroll(row.id, note);
    setExpandedInstDeferId(null);
    await loadOverviews();
    onRefresh();
  };

  // D37/H66: one row or every row of a person, through Banco (account) or Efectivo (petty cash), one movement
  const handlePayInstall = async (choice: PayoutChoice): Promise<boolean> => {
    if (!payInstall) return false;
    const { rows } = payInstall;
    setPayingId(rows[0].id);
    try {
      if (rows.length === 1) await treasuryService.markPayrollPaid(rows[0].id, choice);
      else await treasuryService.payPersonPayroll(rows[0].user_id, rows.map((r) => r.id), choice);
      toast.success(`Pagado ${fmt(rows.reduce((sum, r) => sum + r.total_amount, 0))} a ${rows[0].user_name || 'instalador'}.`);
      await loadOverviews();
      onRefresh();
      return true;
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error al registrar el pago.');
      return false;
    } finally {
      setPayingId(null);
    }
  };

  const saveWeekly = async () => {
    if (!canCaptureWeeklyFixed) return;
    setWeeklySaving(true);
    try {
      await treasuryService.saveWeeklyFixedCosts(weekly);
      await loadOverviews();
      onRefresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error al guardar el cierre semanal.');
    } finally {
      setWeeklySaving(false);
    }
  };

  const loadHistory = async () => {
    if (!histFrom || !histTo) return;
    setLoadingHistory(true);
    try {
      const data = await treasuryService.listWeeklyFixedCosts(histFrom, histTo);
      setHistory(data);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error al cargar el histórico.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const startEdit = (row: WeeklyFixedCostRecord) => {
    setEditingId(row.id);
    setEditVals({
      admin_payroll: row.admin_payroll,
      design_sales_payroll: row.design_sales_payroll,
      production_plant_payroll: row.production_plant_payroll,
      notes: row.notes || '',
    });
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = async (row: WeeklyFixedCostRecord) => {
    setSavingEdit(true);
    try {
      await treasuryService.updateWeeklyFixedCost(row.id, {
        week_reference_date: row.week_reference_date.slice(0, 10),
        admin_payroll: editVals.admin_payroll,
        design_sales_payroll: editVals.design_sales_payroll,
        production_plant_payroll: editVals.production_plant_payroll,
        notes: editVals.notes || null,
      });
      setEditingId(null);
      await loadHistory();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error al guardar la corrección.');
    } finally {
      setSavingEdit(false);
    }
  };

  const fmtMoney = (n: number) => formatMoney(n);

  const historyColumns = useMemo((): VTableColumn<WeeklyFixedCostRecord>[] => [
    {
      key: 'week_reference_date',
      label: 'Semana (jueves)',
      sortable: true,
      render: (row) => (
        <span className="font-medium text-slate-700">{formatDate(row.week_reference_date.slice(0, 10))}</span>
      ),
    },
    {
      key: 'admin_payroll',
      align: 'right',
      sortable: true,
      label: 'Administración',
      render: (row) => {
        const isEd = editingId === row.id;
        return isEd ? (
          <Input
            type="number"
            step="0.01"
            value={editVals.admin_payroll || ''}
            onChange={(e) =>
              setEditVals((v) => ({ ...v, admin_payroll: parseFloat(e.target.value) || 0 }))
            }
            className="w-28 text-right ml-auto"
          />
        ) : (
          <span className="block text-right tabular-nums">{fmtMoney(row.admin_payroll)}</span>
        );
      },
    },
    {
      key: 'design_sales_payroll',
      align: 'right',
      sortable: true,
      label: 'Diseño/Ventas',
      render: (row) => {
        const isEd = editingId === row.id;
        return isEd ? (
          <Input
            type="number"
            step="0.01"
            value={editVals.design_sales_payroll || ''}
            onChange={(e) =>
              setEditVals((v) => ({ ...v, design_sales_payroll: parseFloat(e.target.value) || 0 }))
            }
            className="w-28 text-right ml-auto"
          />
        ) : (
          <span className="block text-right tabular-nums">{fmtMoney(row.design_sales_payroll)}</span>
        );
      },
    },
    {
      key: 'production_plant_payroll',
      align: 'right',
      sortable: true,
      label: 'Producción',
      render: (row) => {
        const isEd = editingId === row.id;
        return isEd ? (
          <Input
            type="number"
            step="0.01"
            value={editVals.production_plant_payroll || ''}
            onChange={(e) =>
              setEditVals((v) => ({ ...v, production_plant_payroll: parseFloat(e.target.value) || 0 }))
            }
            className="w-28 text-right ml-auto"
          />
        ) : (
          <span className="block text-right tabular-nums">{fmtMoney(row.production_plant_payroll)}</span>
        );
      },
    },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.admin_payroll + row.design_sales_payroll + row.production_plant_payroll,
      render: (row) => {
        const isEd = editingId === row.id;
        const total = isEd
          ? editVals.admin_payroll + editVals.design_sales_payroll + editVals.production_plant_payroll
          : row.admin_payroll + row.design_sales_payroll + row.production_plant_payroll;
        return <span className="block text-right font-bold text-slate-800 tabular-nums">{fmtMoney(total)}</span>;
      },
    },
    {
      key: 'action',
      label: 'Acción',
      align: 'center',
      render: (row) => {
        const isEd = editingId === row.id;
        return (
          <div className="text-center whitespace-nowrap">
            {isEd ? (
              <>
                <Button
                  type="button"
                  size="xs"
                  onClick={() => saveEdit(row)}
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Procesando...' : 'Guardar'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="ml-1"
                  onClick={cancelEdit}
                >
                  Cancelar
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Editar"
                aria-label="Editar"
                className="group hover:bg-indigo-50"
                onClick={() => startEdit(row)}
              >
                <TableActionEditIcon />
              </Button>
            )}
          </div>
        );
      },
    },
  ], [editingId, editVals, savingEdit]);

  const renderCommissionTable = (view: SubView) => {
    const rows = commissionRows[view];
    const columns: VTableColumn<PayrollCommissionRow>[] = [
      {
        key: 'reference',
        label: 'OV / Referencia',
        sortable: true,
        sortValue: (row) => row.sales_order_id,
        render: (row) => (
          <div>
            <p className="font-bold text-slate-800">
              OV-{String(row.sales_order_id).padStart(4, '0')} · {row.project_name || '—'}
            </p>
            <p className="text-xs text-slate-500">{row.reference_label}</p>
          </div>
        ),
      },
      {
        key: 'seller',
        label: 'Asesor',
        sortable: true,
        sortValue: (row) => row.seller_name || '',
        render: (row) => (
          <span className="inline-flex items-center gap-1">
            {row.seller_name || '—'}
            {isGlobal(row) && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200"
                title="Comisión global (Configuración)">Global</span>
            )}
          </span>
        ),
      },
      {
        key: 'amount',
        label: 'Monto',
        align: 'right',
        sortable: true,
        render: (row) => (
          <span className="block text-right font-bold text-slate-800 tabular-nums">{fmt(row.amount)}</span>
        ),
      },
    ];
    if (view === 'PAID') {
      columns.push({
        key: 'paid_at',
        label: 'Pagado',
        sortable: true,
        sortValue: (row) => (row.paid_at ? new Date(row.paid_at).getTime() : 0),
        render: (row) => (
          <span className="text-xs text-slate-500">
            {row.paid_at ? formatDateTime(row.paid_at) : '—'}
            {(row.payment_detail || row.payment_method) &&
              ` · ${row.payment_detail || payoutMethodLabel(row.payment_method || '')}`}
          </span>
        ),
      });
    }
    if (view === 'RETAINED') {
      columns.push({
        key: 'days_waiting',
        label: 'Días espera',
        align: 'right',
        sortable: true,
        render: (row) => (
          <span className={`block text-right tabular-nums ${daysWaitingClass(row.days_waiting)}`}>
            {row.days_waiting} d
          </span>
        ),
      });
    }
    columns.push({
      key: 'action',
      label: 'Acción',
      align: 'right',
      render: (row) => (
        <div className="text-right">
          <div className="inline-flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              title="Consultar la OV"
              onClick={() => onOrderInspect(row.sales_order_id)}
            >
              Rayos X
            </Button>
            {canPay && view === 'PAYABLE' && row.id != null && (
              <Button type="button" variant="outline" size="sm" className="text-orange-700"
                onClick={() => openCommDefer(row)}>
                <SkipForward size={12} /> Diferir / Omitir
              </Button>
            )}
            {canPay && view === 'PAYABLE' && row.id != null && (
              <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700"
                disabled={payingCommission} onClick={() => setPayComm({ rows: [row] })}>
                Pagar
              </Button>
            )}
          </div>
          {canPay && view === 'PAYABLE' && row.id != null && expandedCommDeferKey === commKey(row) && (
            <div className="mt-3 text-left bg-white p-3 rounded-lg border border-orange-200">
              <p className="text-xs font-bold text-orange-800 mb-2">
                Motivo del diferimiento u omisión (obligatorio)
              </p>
              <VTextarea
                className="mb-3"
                placeholder="Describe la razón para auditoría…"
                value={commDeferReason[commKey(row)] ?? ''}
                onChange={(e) =>
                  setCommDeferReason((m) => ({ ...m, [commKey(row)]: e.target.value }))
                }
              />
              <div className="flex justify-between gap-2">
                <Button size="sm" variant="outline" onClick={() => setExpandedCommDeferKey(null)}>
                  Cancelar
                </Button>
                <Button size="sm" variant="outline" className="border-orange-300 text-orange-700"
                  onClick={() => handleDeferCommission(row)}>
                  Confirmar omisión
                </Button>
              </div>
            </div>
          )}
        </div>
      ),
    });

    // H68: one "Pagar todo a <asesor>" per seller with two or more commissions to pay
    const bySeller = new Map<string, PayrollCommissionRow[]>();
    if (view === 'PAYABLE') {
      rows.filter((r) => r.id != null).forEach((r) => {
        const key = String(r.seller_id ?? r.seller_name ?? '');
        bySeller.set(key, [...(bySeller.get(key) ?? []), r]);
      });
    }
    return (
      <div className="space-y-3">
        {Array.from(bySeller.values()).filter((list) => canPay && list.length > 1).map((list) => (
          <div key={String(list[0].seller_id ?? list[0].seller_name)} className="flex flex-wrap justify-end">
            <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700"
              disabled={payingCommission} onClick={() => setPayComm({ rows: list })}>
              Pagar todo a {list[0].seller_name || 'asesor'} ({list.length} · {fmt(list.reduce((sum, r) => sum + r.amount, 0))})
            </Button>
          </div>
        ))}
        <VTable
          columns={columns as unknown as VTableColumn<Record<string, unknown>>[]}
          data={rows as unknown as Record<string, unknown>[]}
          isLoading={coOverview === null}
          emptyState={{ title: 'Sin registros en esta bandeja.' }}
          className="shadow-sm"
          headerStyle="report"
        />
      </div>
    );
  };

  const handlePayCommissions = async (choice: PayoutChoice): Promise<boolean> => {
    if (!payComm) return false;
    const ids = payComm.rows.map((r) => r.id as number);
    setPayingCommission(true);
    try {
      if (ids.length === 1) await salesService.payCommission(ids[0], choice);
      else await salesService.payPersonCommissions(payComm.rows[0].seller_id as number, ids, choice);
      toast.success(`Comisión pagada: ${fmt(payComm.rows.reduce((sum, r) => sum + r.amount, 0))}.`);
      await loadOverviews();
      onRefresh();
      return true;
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'No se pudo registrar el pago de comisión.');
      return false;
    } finally {
      setPayingCommission(false);
    }
  };

  const buildInstallationColumns = (view: SubView): VTableColumn<PayrollPaymentRecord>[] => {
    const cols: VTableColumn<PayrollPaymentRecord>[] = [
      {
        key: 'instance',
        label: 'Instalación',
        sortable: true,
        sortValue: (r) => payrollInstallationLabel(r),
        render: (r) => <span className="font-medium text-slate-800">{payrollInstallationLabel(r)}</span>,
      },
      {
        // D18: days of the recipe's installation line × daily rate
        key: 'basis',
        label: 'Cálculo',
        render: (r) => (
          <span className="block text-xs text-slate-600" title={r.admin_notes || undefined}>
            {r.days_worked} {r.days_worked === 1 ? 'día' : 'días'} × {fmt(r.daily_rate)}
            {r.admin_notes?.includes('no tiene la línea') && (
              <span className="block text-amber-700">Receta sin línea de instalación</span>
            )}
          </span>
        ),
      },
      {
        key: 'total',
        label: 'Total',
        align: 'right',
        sortable: true,
        sortValue: (r) => r.total_amount,
        render: (r) => (
          <span className="block text-right font-bold text-emerald-700 tabular-nums">{fmt(r.total_amount)}</span>
        ),
      },
    ];
    if (view === 'RETAINED') {
      cols.push({
        key: 'days_waiting',
        label: 'Días espera',
        align: 'right',
        sortable: true,
        sortValue: (r) => r.days_waiting ?? 0,
        render: (r) => (
          <span className={`block text-right tabular-nums ${daysWaitingClass(r.days_waiting ?? 0)}`}>
            {r.days_waiting ?? 0} d
          </span>
        ),
      });
    }
    if (view === 'PAYABLE') {
      cols.push({
        key: 'payment',
        label: 'Pago',
        align: 'right',
        render: (r) => (
          <div className="text-right">
            <div className="inline-flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" className="text-orange-700"
                onClick={() => openInstDefer(r)}>
                Diferir / Omitir
              </Button>
              {canPay && (
                <Button
                  type="button"
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={payingId === r.id}
                  onClick={() => setPayInstall({ rows: [r] })}
                >
                  {payingId === r.id ? 'Procesando...' : 'Pagar'}
                </Button>
              )}
            </div>
            {expandedInstDeferId === r.id && (
              <div className="w-full mt-3 text-left bg-white p-3 rounded-lg border border-orange-200">
                <p className="text-xs font-bold text-orange-800 mb-2">
                  Motivo del diferimiento u omisión (obligatorio)
                </p>
                <VTextarea
                  className="mb-3"
                  placeholder="Describe la razón para auditoría…"
                  value={instDeferReason[r.id] ?? ''}
                  onChange={(e) =>
                    setInstDeferReason((m) => ({ ...m, [r.id]: e.target.value }))
                  }
                />
                <div className="flex justify-between gap-2">
                  <Button size="sm" variant="outline" onClick={() => setExpandedInstDeferId(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" variant="outline" className="border-orange-300 text-orange-700"
                    onClick={() => handleDeferInstall(r)}>
                    Confirmar omisión
                  </Button>
                </div>
              </div>
            )}
          </div>
        ),
      });
    }
    if (view === 'PAID') {
      cols.push({
        key: 'paid_at',
        label: 'Pagado',
        sortable: true,
        sortValue: (r) => (r.paid_at ? new Date(r.paid_at).getTime() : 0),
        render: (r) => (
          <span className="text-xs text-slate-500">
            {formatDateTime(r.paid_at)}
            {(r.payment_detail || r.payment_method) && ` · ${r.payment_detail || payoutMethodLabel(r.payment_method || '')}`}
          </span>
        ),
      });
    }
    return cols;
  };

  // Guide v2 §5: one table per tray, one group row per installer (name, subtotal and "Pagar todo")
  const renderInstallationGrouped = (view: SubView) => {
    const rows = installationRows[view];
    const grouped = groupByInstaller(rows);
    const columns = buildInstallationColumns(view);
    const totalColumns = columns.map((c) => (c.key === 'total'
      ? { ...c, footer: <span className="text-emerald-800">{fmt(rows.reduce((s, r) => s + r.total_amount, 0))}</span> }
      : c.key === 'instance' ? { ...c, footer: <span className="text-slate-700 uppercase text-xs tracking-wide">Totales ({rows.length} {rows.length === 1 ? 'pago' : 'pagos'})</span> } : c));
    return (
      <div className="space-y-3">
        <p className="text-sm font-bold text-slate-700">
          {SUB_VIEW_LABEL[view]} · {rows.length} {rows.length === 1 ? 'pago' : 'pagos'}
        </p>
        <VTable
          columns={(rows.length > 0 ? totalColumns : columns) as unknown as VTableColumn<Record<string, unknown>>[]}
          data={rows as unknown as Record<string, unknown>[]}
          isLoading={instOverview === null}
          emptyState={{ title: `Sin registros en ${SUB_VIEW_LABEL[view]}.` }}
          className="shadow-sm"
          headerStyle="report"
          groupBy={(row) => String((row as unknown as PayrollPaymentRecord).user_id)}
          renderGroupHeader={(key) => {
            const list = grouped.get(Number(key)) ?? [];
            return (
              <div className="flex justify-between items-center gap-3">
                <span className="font-black text-indigo-900">{list[0]?.user_name || `Instalador #${key}`}</span>
                <span className="flex items-center gap-3">
                  <span className="font-black text-indigo-800 tabular-nums">
                    {fmt(list.reduce((s, r) => s + r.total_amount, 0))}
                  </span>
                  {canPay && view === 'PAYABLE' && list.length > 1 && (
                    <Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={payingId != null} onClick={() => setPayInstall({ rows: list })}>
                      Pagar todo a {list[0]?.user_name?.split(' ')[0] || 'instalador'}
                    </Button>
                  )}
                </span>
              </div>
            );
          }}
        />
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
                  Comisiones
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                  Por pagar {fmt(coOverview?.payable_total ?? 0)}
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
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Nómina</p>
                <Wrench size={16} className="text-emerald-500" />
              </div>
              <div className="flex justify-end">
                <div className="text-lg font-black text-emerald-600 tracking-tight leading-none truncate">
                  Destajos
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                  Por pagar {fmt(instOverview?.payable_total ?? 0)}
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
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Nómina</p>
                <BarChart3 size={16} className="text-violet-500" />
              </div>
              <div className="flex justify-end">
                <div className="text-lg font-black text-violet-700 tracking-tight leading-none truncate">
                  Nómina semanal
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                  {weeklyLast
                    ? `Último cierre ${fmt(
                        (weeklyLast.admin_payroll || 0) +
                        (weeklyLast.design_sales_payroll || 0) +
                        (weeklyLast.production_plant_payroll || 0)
                      )}`
                    : 'Sin cierres'}
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
      {level1 === 'COMMISSIONS' && tray !== null && renderCommissionTable(tray)}
      {level1 === 'COMMISSIONS' && tray === null && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="w-full relative h-40">
              <Card
                onClick={() => onTrayChange('RETAINED')}
                className={`${payrollCardShellClass} border-l-amber-500`}
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
                      Retenidas
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
                onClick={() => onTrayChange('PAYABLE')}
                className={`${payrollCardShellClass} border-l-indigo-500`}
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
                      Por pagar
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
                onClick={() => onTrayChange('PAID')}
                className={`${payrollCardShellClass} border-l-emerald-500`}
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
                      Histórico de pagos
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
        </div>
      )}

      {level1 === 'INSTALLATIONS' && tray !== null && renderInstallationGrouped(tray)}
      {level1 === 'INSTALLATIONS' && tray === null && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="w-full relative h-40">
              <Card
                onClick={() => onTrayChange('RETAINED')}
                className={`${payrollCardShellClass} border-l-amber-500`}
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
                      Sin firma
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{fmt(totals.inst.RETAINED)}</p>
                    <Bell size={14} className="text-amber-400" />
                  </div>
                </div>
              </Card>
            </div>
            <div className="w-full relative h-40">
              <Card
                onClick={() => onTrayChange('PAYABLE')}
                className={`${payrollCardShellClass} border-l-emerald-500`}
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
                      Por pagar
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{fmt(totals.inst.PAYABLE)}</p>
                    <Search size={14} className="text-emerald-400" />
                  </div>
                </div>
              </Card>
            </div>
            <div className="w-full relative h-40">
              <Card
                onClick={() => onTrayChange('PAID')}
                className={`${payrollCardShellClass} border-l-slate-400`}
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
                      Pagadas
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{fmt(totals.inst.PAID)}</p>
                    <CheckCircle2 size={14} className="text-slate-400" />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {level1 === 'WEEKLY' && canCaptureWeeklyFixed && (
        <Card className="p-6 border border-slate-200 bg-white shadow-sm rounded-xl max-w-4xl">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-1">
            <BarChart3 size={20} className="text-indigo-600" /> Cierre de jueves: costos fijos semanales
          </h3>
          {weeklyLast && (
            <p className="text-sm text-slate-500 mb-4">
              Último registro: semana del {formatDate(weeklyLast.week_reference_date.slice(0, 10))}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-xs font-bold text-slate-500">
              Fecha referencia (jueves)
              <Input
                type="date"
                className="mt-1"
                value={weekly.week_reference_date}
                onChange={(e) => setWeekly((w) => ({ ...w, week_reference_date: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-500">
              Nómina Administración
              <Input
                type="number"
                className="mt-1"
                value={weekly.admin_payroll || ''}
                onChange={(e) =>
                  setWeekly((w) => ({ ...w, admin_payroll: parseFloat(e.target.value) || 0 }))
                }
              />
            </label>
            <label className="block text-xs font-bold text-slate-500">
              Nómina Diseño / Ventas
              <Input
                type="number"
                className="mt-1"
                value={weekly.design_sales_payroll || ''}
                onChange={(e) =>
                  setWeekly((w) => ({
                    ...w,
                    design_sales_payroll: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </label>
            <label className="block text-xs font-bold text-slate-500">
              Nómina Producción (Planta)
              <Input
                type="number"
                className="mt-1"
                value={weekly.production_plant_payroll || ''}
                onChange={(e) =>
                  setWeekly((w) => ({
                    ...w,
                    production_plant_payroll: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </label>
            <label className="block text-xs font-bold text-slate-500 md:col-span-2">
              Notas del cierre (opcional)
              <VTextarea
                className="mt-1"
                rows={2}
                value={weekly.notes || ''}
                onChange={(e) => setWeekly((w) => ({ ...w, notes: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex justify-end mt-6 pt-4 border-t border-slate-100">
            <Button onClick={saveWeekly} disabled={weeklySaving}>
              {weeklySaving ? 'Procesando...' : 'Guardar cierre semanal'}
            </Button>
          </div>
        </Card>
      )}

      {level1 === 'WEEKLY' && canCaptureWeeklyFixed && (
        <Card className="p-6 mt-4 border border-slate-200 bg-white shadow-sm rounded-xl">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Histórico de nóminas semanales</h3>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500">Desde</label>
              <Input
                type="date"
                value={histFrom}
                onChange={(e) => setHistFrom(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500">Hasta</label>
              <Input
                type="date"
                value={histTo}
                onChange={(e) => setHistTo(e.target.value)}
                className="text-sm"
              />
            </div>
            <Button variant="outline" onClick={loadHistory} disabled={!histFrom || !histTo || loadingHistory}>
              {loadingHistory ? 'Procesando...' : 'Consultar'}
            </Button>
          </div>

          <VTable
            columns={historyColumns as unknown as VTableColumn<Record<string, unknown>>[]}
            data={history as unknown as Record<string, unknown>[]}
            isLoading={loadingHistory}
            emptyState={{ title: 'Selecciona un rango y consulta el histórico.' }}
            className="shadow-sm"
            headerStyle="report"
            defaultSortKey="week_reference_date"
            defaultSortDirection="desc"
          />
        </Card>
      )}

      {level1 === 'WEEKLY' && !canCaptureWeeklyFixed && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <VEmptyState title="Solo personal autorizado puede capturar el cierre semanal." />
        </div>
      )}

      {payComm && (
        <PayoutDialog
          title={payComm.rows.length > 1 ? `Pagar todo a ${payComm.rows[0].seller_name || 'asesor'}` : 'Pagar comisión'}
          details={payComm.rows.length === 1 ? [
            ['Vendedor', payComm.rows[0].seller_name || '—'],
            ['Factura', payComm.rows[0].reference_label],
            ['Cobrado sin IVA', payComm.rows[0].base_amount != null ? fmt(payComm.rows[0].base_amount) : '—'],
            [isGlobal(payComm.rows[0]) ? '% de comisión global' : '% de comisión de la OV', payComm.rows[0].rate != null ? `${(payComm.rows[0].rate * 100).toFixed(2)}%` : '—'],
          ] : [
            ['Vendedor', payComm.rows[0].seller_name || '—'],
            ...payComm.rows.map((r): [string, string] => [r.reference_label, fmt(r.amount)]),
            ['Pago', 'Uno por el total (o dividido por medio)'],
          ]}
          amount={Math.round(payComm.rows.reduce((sum, r) => sum + r.amount, 0) * 100) / 100}
          accounts={accounts}
          onConfirm={handlePayCommissions}
          onClose={() => setPayComm(null)}
        />
      )}

      {payInstall && (
        <PayoutDialog
          title={payInstall.rows.length > 1 ? `Pagar todo a ${payInstall.rows[0].user_name || 'instalador'}` : 'Pagar destajo'}
          details={[
            ['Persona', payInstall.rows[0].user_name || '—'],
            ...payInstall.rows.map((r): [string, string] => [payrollInstallationLabel(r), fmt(r.total_amount)]),
            ['Pago', 'Uno por el total (o dividido por medio)'],
          ]}
          amount={payInstall.rows.reduce((sum, r) => sum + r.total_amount, 0)}
          accounts={accounts}
          onConfirm={handlePayInstall}
          onClose={() => setPayInstall(null)}
        />
      )}
    </div>
  );
};
