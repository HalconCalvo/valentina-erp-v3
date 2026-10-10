import { formatDateTime } from '@/utils/format';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import type { AuditFieldChange } from '@/api/audit-service';

/** Who can read the automatic change log (backend enforces the same rule). */
export const CHANGE_LOG_ROLES = ['DIRECTOR', 'MANAGER'];

export const canReadChangeLog = (): boolean =>
  CHANGE_LOG_ROLES.includes((localStorage.getItem('user_role') || '').toUpperCase().trim());

export const TABLE_LABELS: Record<string, string> = {
  sales_orders: 'Órdenes de venta',
  sales_order_items: 'Partidas de OV',
  sales_order_item_instances: 'Instancias',
  quotations: 'Cotizaciones',
  quotation_items: 'Partidas de cotización',
  customer_payments: 'Cuentas por cobrar',
  customer_payment_installments: 'Abonos',
  materials: 'Materiales',
  providers: 'Proveedores',
  clients_v2: 'Clientes',
  users: 'Usuarios',
  design_product_versions: 'Versiones de receta',
  design_version_components: 'Componentes de receta',
  design_product_masters: 'Productos',
  production_batches: 'Lotes de producción',
  inventory_reservations: 'Reservas de material',
  inventory_audits: 'Inventario físico',
  inventory_audit_items: 'Líneas de conteo',
  purchase_orders: 'Órdenes de compra',
  purchase_order_items: 'Partidas de OC',
  purchase_requisitions: 'Requisiciones',
  purchase_invoices: 'Facturas de compra',
  purchase_invoice_items: 'Partidas de factura de compra',
  accounts_payable: 'Cuentas por pagar',
  supplier_payments: 'Pagos a proveedores',
  global_config: 'Configuración',
};

const OPERATION_LABELS: Record<string, string> = { INSERT: 'Creado', UPDATE: 'Modificado', DELETE: 'Eliminado' };

const OPERATION_STYLES: Record<string, string> = {
  INSERT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  UPDATE: 'bg-blue-50 text-blue-700 border-blue-200',
  DELETE: 'bg-red-50 text-red-700 border-red-200',
};

/** The backend stores naive UTC; shown as DD/MM/AAAA HH:MM in business time (America/Merida). */
export const formatChangeDate = (iso: string): string => formatDateTime(iso);

const valueCell = (value?: string | null) =>
  value == null ? <span className="text-slate-300">—</span> : <span className="break-all text-xs text-slate-700">{value}</span>;

const buildColumns = (showRecord: boolean): VTableColumn<AuditFieldChange>[] => [
  { key: 'changed_at', label: 'Fecha', render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatChangeDate(r.changed_at)}</span> },
  {
    key: 'user_name',
    label: 'Usuario',
    render: (r) => (
      <div className="text-xs">
        <div className="font-semibold text-slate-800">{r.user_name || '—'}</div>
        {r.user_role && <div className="text-slate-400 uppercase">{r.user_role}</div>}
      </div>
    ),
  },
  {
    key: 'operation',
    label: 'Operación',
    render: (r) => (
      <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${OPERATION_STYLES[r.operation] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
        {OPERATION_LABELS[r.operation] ?? r.operation}
      </span>
    ),
  },
  ...(showRecord
    ? [{
        key: 'table_name',
        label: 'Registro',
        render: (r: AuditFieldChange) => (
          <span className="text-xs text-slate-600">{TABLE_LABELS[r.table_name] ?? r.table_name} #{r.record_id ?? '—'}</span>
        ),
      }]
    : []),
  { key: 'field_name', label: 'Campo', render: (r) => <span className="font-mono text-xs text-slate-700">{r.field_name ?? '—'}</span> },
  { key: 'old_value', label: 'Antes', render: (r) => valueCell(r.old_value) },
  { key: 'new_value', label: 'Después', render: (r) => valueCell(r.new_value) },
  { key: 'reason', label: 'Motivo', render: (r) => valueCell(r.reason) },
];

interface FieldChangesTableProps {
  rows: AuditFieldChange[];
  loading?: boolean;
  showRecord?: boolean;
}

export function FieldChangesTable({ rows, loading = false, showRecord = true }: FieldChangesTableProps) {
  return (
    <div className="overflow-x-auto">
      <VTable
        columns={buildColumns(showRecord)}
        data={rows}
        isLoading={loading && rows.length === 0}
        emptyState={{ title: 'Sin cambios registrados', description: 'La bitácora registra los cambios desde que se activó.' }}
      />
    </div>
  );
}
