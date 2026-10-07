import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import axiosClient from '@/api/axios-client';
import { auditService, type AuditFieldChange, type AuditFieldChangeFilters } from '@/api/audit-service';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { toast } from '@/components/ui/VToast';
import { FieldChangesTable, TABLE_LABELS } from '@/components/audit/FieldChangesTable';

const PAGE_SIZE = 100;

type Option = { value: string; label: string };

/** Automatic change log: who changed which field of which record, before and after. */
export default function FieldChangesPanel() {
  const [tables, setTables] = useState<string[]>([]);
  const [users, setUsers] = useState<Array<{ id: number; full_name: string }>>([]);
  const [tableName, setTableName] = useState('');
  const [recordId, setRecordId] = useState('');
  const [userId, setUserId] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState<AuditFieldChange[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    auditService.getAuditedTables().then(setTables).catch(() => setTables([]));
    axiosClient.get('/users/').then((res) => setUsers(Array.isArray(res.data) ? res.data : [])).catch(() => setUsers([]));
  }, []);

  const tableOptions = useMemo<Option[]>(
    () => [{ value: '', label: 'Todas las tablas' }, ...tables.map((t) => ({ value: t, label: TABLE_LABELS[t] ?? t }))],
    [tables],
  );
  const userOptions = useMemo<Option[]>(
    () => [{ value: '', label: 'Todos los usuarios' }, ...users.map((u) => ({ value: String(u.id), label: u.full_name || `Usuario #${u.id}` }))],
    [users],
  );

  const filters = useCallback(
    (skip: number): AuditFieldChangeFilters => ({
      table_name: tableName || undefined,
      record_id: recordId.trim() || undefined,
      user_id: userId ? Number(userId) : undefined,
      field_name: fieldName.trim() || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo ? `${dateTo}T23:59:59` : undefined,
      skip,
      limit: PAGE_SIZE,
    }),
    [tableName, recordId, userId, fieldName, dateFrom, dateTo],
  );

  const load = useCallback(
    async (append: boolean) => {
      setLoading(true);
      try {
        const data = await auditService.getFieldChanges(filters(append ? rows.length : 0));
        setRows((prev) => (append ? [...prev, ...data.items] : data.items));
        setTotal(data.total);
      } catch (err: any) {
        toast.error(err?.response?.status === 403 ? 'Sin permisos para ver la bitácora.' : 'No se pudo cargar la bitácora.');
      } finally {
        setLoading(false);
      }
    },
    [filters, rows.length],
  );

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tabla</label>
            <SearchableSelect items={tableOptions} value={tableName} onChange={setTableName} getLabel={(o) => o.label} getValue={(o) => o.value} placeholder="Todas las tablas" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Registro #</label>
            <Input value={recordId} onChange={(e) => setRecordId(e.target.value)} placeholder="Id" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Usuario</label>
            <SearchableSelect items={userOptions} value={userId} onChange={setUserId} getLabel={(o) => o.label} getValue={(o) => o.value} placeholder="Todos los usuarios" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Campo</label>
            <Input value={fieldName} onChange={(e) => setFieldName(e.target.value)} placeholder="ej. current_cost" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Desde</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hasta</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end pt-1 border-t border-slate-100">
          <Button type="button" onClick={() => void load(false)} disabled={loading}>
            <Search size={16} /> {loading ? 'Buscando…' : 'Buscar'}
          </Button>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-sm font-bold text-slate-600">Mostrando {rows.length} de {total} cambios</p>
        </div>
        <FieldChangesTable rows={rows} loading={loading} />
        {rows.length < total && (
          <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-center">
            <Button type="button" variant="outline" onClick={() => void load(true)} disabled={loading}>
              {loading ? 'Cargando…' : 'Cargar más'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
