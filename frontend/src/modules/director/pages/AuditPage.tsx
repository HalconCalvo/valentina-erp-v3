import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Search } from 'lucide-react';
import axiosClient from '../../../api/axios-client';
import { auditService, type AuditLogRead } from '../../../api/audit-service';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { VTable, type VTableColumn } from '@/components/ui/VTable';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { toast } from '@/components/ui/VToast';

const PAGE_SIZE = 50;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const ACTION_OPTIONS = [
    { value: '', label: 'Todas las acciones' },
    { value: 'CANCEL', label: 'CANCEL — Cancelación' },
    { value: 'PAY', label: 'PAY — Pago' },
    { value: 'COLLECT', label: 'COLLECT — Cobro' },
    { value: 'APPROVE', label: 'APPROVE — Aprobación' },
    { value: 'RELEASE', label: 'RELEASE — Liberación' },
    { value: 'CREATE', label: 'CREATE — Creación' },
    { value: 'UPDATE', label: 'UPDATE — Actualización' },
    { value: 'INVOICE', label: 'INVOICE — Facturación' },
    { value: 'ADJUST', label: 'ADJUST — Ajuste' },
];

const ENTITY_OPTIONS = [
    { value: '', label: 'Todas las entidades' },
    { value: 'sales_order', label: 'sales_order — Orden de venta' },
    { value: 'installment', label: 'installment — Abono' },
    { value: 'commission', label: 'commission — Comisión' },
    { value: 'customer_payment', label: 'customer_payment — CxC' },
    { value: 'retention', label: 'retention — Fondo de garantía' },
    { value: 'purchase_order', label: 'purchase_order — Orden de compra' },
    { value: 'inventory', label: 'inventory — Inventario' },
];

const ACTION_BADGE: Record<string, string> = {
    CANCEL: 'bg-red-100 text-red-700 border-red-200',
    PAY: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    APPROVE: 'bg-blue-100 text-blue-700 border-blue-200',
    COLLECT: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    RELEASE: 'bg-amber-100 text-amber-700 border-amber-200',
    UPDATE: 'bg-slate-100 text-slate-600 border-slate-200',
};

function formatAuditDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = MESES[d.getMonth()] ?? '???';
    const year = String(d.getFullYear()).slice(-2);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function ActionBadge({ action }: { action: string }) {
    const key = action.toUpperCase();
    const cls = ACTION_BADGE[key] ?? 'bg-slate-100 text-slate-600 border-slate-200';
    return (
        <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${cls}`}>
            {key}
        </span>
    );
}

const AuditPage: React.FC = () => {
    const navigate = useNavigate();
    const userRole = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const isDirector = ['DIRECTOR', 'DIRECCION', 'DIRECTION'].includes(userRole);

    const [users, setUsers] = useState<Array<{ id: number; full_name: string }>>([]);
    const [filterUserId, setFilterUserId] = useState('');
    const [filterAction, setFilterAction] = useState('');
    const [filterEntity, setFilterEntity] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');

    const [items, setItems] = useState<AuditLogRead[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        if (!isDirector) return;
        axiosClient.get<Array<{ id: number; full_name: string }>>('/users/')
            .then((res) => setUsers(Array.isArray(res.data) ? res.data : []))
            .catch(() => setUsers([]));
    }, [isDirector]);

    const userSelectOptions = useMemo(
        () => [
            { value: '', label: 'Todos los usuarios' },
            ...users.map((u) => ({ value: String(u.id), label: u.full_name || `Usuario #${u.id}` })),
        ],
        [users],
    );

    const buildFilters = useCallback(
        (nextSkip: number) => ({
            user_id: filterUserId === '' ? undefined : Number(filterUserId),
            action: filterAction || undefined,
            entity_type: filterEntity || undefined,
            date_from: filterDateFrom || undefined,
            date_to: filterDateTo || undefined,
            skip: nextSkip,
            limit: PAGE_SIZE,
        }),
        [filterUserId, filterAction, filterEntity, filterDateFrom, filterDateTo],
    );

    const fetchLogs = useCallback(
        async (append: boolean, currentLength = 0) => {
            const nextSkip = append ? currentLength : 0;
            if (append) setLoadingMore(true);
            else setLoading(true);
            try {
                const data = await auditService.getAuditLogs({
                    ...buildFilters(0),
                    skip: nextSkip,
                    limit: PAGE_SIZE,
                });
                const rows = Array.isArray(data.items) ? data.items : [];
                setTotal(data.total ?? 0);
                setItems((prev) => (append ? [...prev, ...rows] : rows));
            } catch {
                toast.error('No se pudo cargar el historial de auditoría.');
                if (!append) {
                    setItems([]);
                    setTotal(0);
                }
            } finally {
                setLoading(false);
                setLoadingMore(false);
            }
        },
        [buildFilters],
    );

    const handleSearch = () => {
        void fetchLogs(false, 0);
    };

    const handleLoadMore = () => {
        void fetchLogs(true, items.length);
    };

    useEffect(() => {
        if (!isDirector) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const data = await auditService.getAuditLogs({ skip: 0, limit: PAGE_SIZE });
                if (cancelled) return;
                setItems(Array.isArray(data.items) ? data.items : []);
                setTotal(data.total ?? 0);
            } catch {
                if (!cancelled) {
                    toast.error('No se pudo cargar el historial de auditoría.');
                    setItems([]);
                    setTotal(0);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isDirector]);

    const columns = useMemo((): VTableColumn<AuditLogRead>[] => [
        {
            key: 'created_at',
            label: 'Fecha/Hora',
            render: (row) => (
                <span className="text-slate-600 whitespace-nowrap text-xs">{formatAuditDate(row.created_at)}</span>
            ),
        },
        {
            key: 'user_name',
            label: 'Usuario',
            render: (row) => (
                <span className="font-semibold text-slate-800">{row.user_name || '—'}</span>
            ),
        },
        {
            key: 'user_role',
            label: 'Rol',
            render: (row) => (
                <span className="text-xs font-bold text-slate-500 uppercase">{row.user_role || '—'}</span>
            ),
        },
        {
            key: 'action',
            label: 'Acción',
            render: (row) => <ActionBadge action={row.action} />,
        },
        {
            key: 'entity_type',
            label: 'Entidad',
            render: (row) => (
                <div className="text-xs text-slate-600">
                    <span className="font-mono">{row.entity_type}</span>
                    {row.entity_reference && (
                        <span className="block text-slate-500 mt-0.5">{row.entity_reference}</span>
                    )}
                </div>
            ),
        },
        {
            key: 'description',
            label: 'Descripción',
            render: (row) => (
                <span className="text-sm text-slate-700">{row.description || '—'}</span>
            ),
        },
    ], []);

    if (!isDirector) {
        return (
            <div className="p-8 max-w-3xl mx-auto">
                <VEmptyState
                    icon={<Shield className="text-slate-300" />}
                    title="Acceso restringido"
                    description="Esta sección está disponible solo para el Director."
                    action={{ label: 'Volver al inicio', onClick: () => navigate('/') }}
                />
            </div>
        );
    }

    const hasMore = items.length < total;

    return (
        <div className="p-8 w-full pb-24 space-y-6 animate-fadeIn">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight flex items-center gap-3 text-slate-800">
                        <Shield className="text-slate-500" size={32} />
                        Auditoría del Sistema
                    </h1>
                    <p className="text-slate-500 mt-1 font-medium">
                        Historial de acciones críticas: quién, qué y cuándo.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/director')}
                    className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 transition-all shadow-sm"
                >
                    <ArrowLeft size={18} /> Regresar al Tablero
                </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Usuario</label>
                        <SearchableSelect
                            items={userSelectOptions}
                            value={filterUserId}
                            onChange={setFilterUserId}
                            getLabel={(o) => o.label}
                            getValue={(o) => o.value}
                            placeholder="Todos los usuarios"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Acción</label>
                        <SearchableSelect
                            items={ACTION_OPTIONS}
                            value={filterAction}
                            onChange={setFilterAction}
                            getLabel={(o) => o.label}
                            getValue={(o) => o.value}
                            placeholder="Todas las acciones"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Entidad</label>
                        <SearchableSelect
                            items={ENTITY_OPTIONS}
                            value={filterEntity}
                            onChange={setFilterEntity}
                            getLabel={(o) => o.label}
                            getValue={(o) => o.value}
                            placeholder="Todas las entidades"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Desde</label>
                        <Input
                            type="date"
                            value={filterDateFrom}
                            onChange={(e) => setFilterDateFrom(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hasta</label>
                        <Input
                            type="date"
                            value={filterDateTo}
                            onChange={(e) => setFilterDateTo(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex justify-end pt-1 border-t border-slate-100">
                    <Button type="button" onClick={handleSearch} disabled={loading}>
                        <Search size={16} />
                        {loading ? 'Buscando…' : 'Buscar'}
                    </Button>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-600">
                        Mostrando {items.length} de {total} registros
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <VTable
                        columns={columns as unknown as VTableColumn<Record<string, unknown>>[]}
                        data={items as unknown as Record<string, unknown>[]}
                        isLoading={loading && items.length === 0}
                        emptyState={{
                            icon: <Shield size={24} className="text-slate-300" />,
                            title: 'No hay registros de auditoría',
                            description: 'Ajusta los filtros o realiza operaciones en el sistema para generar historial.',
                        }}
                        className="border-0 shadow-none rounded-none min-w-[900px]"
                    />
                </div>
                {hasMore && (
                    <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-center">
                        <Button type="button" variant="outline" onClick={handleLoadMore} disabled={loadingMore}>
                            {loadingMore ? 'Cargando…' : 'Cargar más'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuditPage;
