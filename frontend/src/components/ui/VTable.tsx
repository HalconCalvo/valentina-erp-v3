import React, { useLayoutEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { cn } from '@/lib/utils';

export interface VTableColumn<T = Record<string, unknown>> {
  key: string;
  label: string;
  /** Custom header content (e.g. a sort button); the column's title stays `label`. */
  header?: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  /** Aligns title and cells of the column together (amounts: 'right'). */
  align?: 'left' | 'right' | 'center';
  /** Cell of the totals row (tfoot); the row shows only when some column has one. */
  footer?: React.ReactNode;
}

export interface VTableAction<T = Record<string, unknown>> {
  label: string;
  title?: string;
  icon?: React.ReactNode;
  onClick: (row: T) => void;
  variant?: 'default' | 'danger';
  hidden?: boolean;
}

interface VTableEmptyState {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}

interface VTableProps<T = Record<string, unknown>> {
  columns: VTableColumn<T>[];
  data: T[];
  isLoading?: boolean;
  emptyState?: VTableEmptyState;
  actions?: (row: T) => VTableAction<T>[];
  onRowClick?: (row: T) => void;
  className?: string;
  defaultSortKey?: string | null;
  defaultSortDirection?: SortDirection;
  onSortedDataChange?: (data: T[]) => void;
  /** H6: the header stays visible while the rows scroll inside the table (default 70vh tall). false: no own scroll. */
  stickyHeader?: boolean;
  maxHeight?: string;
  /** 'report' (guide v2 §5, Cobranza): title text-sm normal case p-3; 'default': text-xs uppercase. */
  headerStyle?: 'default' | 'report';
  /** Group rows in one table (titles, group rows and totals share the columns, so they never misalign). */
  groupBy?: (row: T) => string;
  renderGroupHeader?: (groupKey: string, rows: T[]) => React.ReactNode;
}

type SortDirection = 'asc' | 'desc';

const SKELETON_ROWS = 5;

const ALIGN_CLASS = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
const HEADER_CLASS = {
  default: 'bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500',
  report: 'bg-slate-50 p-3 text-sm font-bold text-slate-600 whitespace-nowrap',
} as const;
const GROUP_TOP = { default: 'top-10', report: 'top-11' } as const;

export const groupRows = <T,>(rows: T[], groupBy: (row: T) => string): [string, T[]][] => {
  const groups = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = groupBy(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return Array.from(groups.entries());
};

const compareValues = (a: unknown, b: unknown): number => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  return String(a).localeCompare(String(b), 'es-MX', {
    numeric: true,
    sensitivity: 'base',
  });
};

const getRowKey = (row: Record<string, unknown>, index: number): string => {
  const id = row.id;
  if (typeof id === 'string' || typeof id === 'number') {
    return String(id);
  }
  return String(index);
};

export const VTable = <T extends Record<string, unknown>>({
  columns,
  data,
  isLoading = false,
  emptyState,
  actions,
  onRowClick,
  className,
  defaultSortKey = null,
  defaultSortDirection = 'asc',
  onSortedDataChange,
  stickyHeader = true,
  maxHeight = '70vh',
  headerStyle = 'default',
  groupBy,
  renderGroupHeader,
}: VTableProps<T>) => {
  const headerClass = HEADER_CLASS[headerStyle];
  const alignOf = (column: VTableColumn<T>) => ALIGN_CLASS[column.align ?? 'left'];
  const hasFooter = columns.some((column) => column.footer !== undefined);
  const columnCount = columns.length + (actions ? 1 : 0);
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);

  const sortedData = useMemo(() => {
    if (!sortKey) return data;

    return [...data].sort((rowA, rowB) => {
      const result = compareValues(rowA[sortKey], rowB[sortKey]);
      return sortDirection === 'asc' ? result : -result;
    });
  }, [data, sortDirection, sortKey]);

  useLayoutEffect(() => {
    onSortedDataChange?.(sortedData);
  }, [sortedData, onSortedDataChange]);

  const handleSort = (column: VTableColumn<T>) => {
    if (!column.sortable) return;

    if (sortKey === column.key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(column.key);
    setSortDirection('asc');
  };

  const renderSortIcon = (column: VTableColumn<T>) => {
    if (!column.sortable) return null;

    const isActive = sortKey === column.key;

    return (
      <span className="ml-1 inline-flex flex-col text-slate-400">
        <ChevronUp
          size={12}
          className={cn(
            '-mb-1',
            isActive && sortDirection === 'asc' && 'text-slate-700',
          )}
        />
        <ChevronDown
          size={12}
          className={cn(
            isActive && sortDirection === 'desc' && 'text-slate-700',
          )}
        />
      </span>
    );
  };

  const renderSkeleton = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={column.width ? { width: column.width } : undefined}
                className={cn(headerClass, alignOf(column))}
              >
                {column.header ?? column.label}
              </th>
            ))}
            {actions && (
              <th className={cn(headerClass, 'text-left')}>
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3">
                  <div className="h-4 w-full max-w-[180px] animate-pulse rounded bg-slate-200" />
                </td>
              ))}
              {actions && (
                <td className="px-4 py-3">
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (isLoading) {
    return (
      <div
        className={cn(
          'overflow-hidden rounded-xl border border-slate-200 bg-white',
          className,
        )}
      >
        {renderSkeleton()}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className={cn(
          'overflow-hidden rounded-xl border border-slate-200 bg-white',
          className,
        )}
      >
        {emptyState ? (
          <VEmptyState
            icon={emptyState.icon}
            title={emptyState.title}
            description={emptyState.description}
          />
        ) : (
          <VEmptyState title="Sin registros" description="No hay datos para mostrar." />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 bg-white',
        className,
      )}
    >
      <div className={stickyHeader ? 'overflow-auto' : 'overflow-x-auto'} style={stickyHeader ? { maxHeight } : undefined}>
        <table className="w-full text-sm">
          <thead className={cn('bg-slate-50', stickyHeader && 'sticky top-0 z-10 shadow-[0_1px_0_0_rgb(226_232_240)]')}>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    headerClass,
                    alignOf(column),
                    column.sortable && 'cursor-pointer select-none hover:text-slate-700',
                  )}
                  onClick={() => handleSort(column)}
                >
                  {column.header ?? (
                    <span className="inline-flex items-center">
                      {column.label}
                      {renderSortIcon(column)}
                    </span>
                  )}
                </th>
              ))}
              {actions && (
                <th className={cn(headerClass, 'text-left')}>
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(groupBy ? groupRows(sortedData, groupBy) : [['', sortedData] as [string, T[]]]).map(([groupKey, rows]) => (
              <React.Fragment key={groupKey || 'all'}>
                {groupBy && (
                  <tr>
                    <td
                      colSpan={columnCount}
                      className={cn(
                        'bg-indigo-50 border-y border-indigo-100 px-3 py-3',
                        stickyHeader && `sticky z-[5] ${GROUP_TOP[headerStyle]}`,
                      )}
                    >
                      {renderGroupHeader ? renderGroupHeader(groupKey, rows) : groupKey}
                    </td>
                  </tr>
                )}
            {rows.map((row) => {
              const rowIndex = sortedData.indexOf(row);
              const rowActions = actions?.(row).filter((action) => !action.hidden) ?? [];

              return (
                <tr
                  key={getRowKey(row, rowIndex)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'transition-colors hover:bg-slate-50',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      style={column.width ? { width: column.width } : undefined}
                      className={cn('px-4 py-3 align-middle text-slate-700', column.align && alignOf(column))}
                    >
                      {column.render
                        ? column.render(row)
                        : (row[column.key] as React.ReactNode) ?? '—'}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3 align-middle">
                      <div className="flex flex-wrap items-center gap-2">
                        {rowActions.map((action, actionIndex) => {
                          const tooltip = action.title || action.label || undefined;
                          return (
                          <button
                            key={`${tooltip ?? 'action'}-${actionIndex}`}
                            type="button"
                            title={tooltip}
                            aria-label={tooltip}
                            onClick={(event) => {
                              event.stopPropagation();
                              action.onClick(row);
                            }}
                            className={cn(
                              'group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors hover:bg-slate-100',
                              action.variant === 'danger'
                                ? 'text-red-600 hover:bg-red-50'
                                : 'text-slate-600',
                            )}
                          >
                            {action.icon && (
                              <span className="[&_svg]:size-3.5">{action.icon}</span>
                            )}
                            {action.label ? action.label : null}
                          </button>
                          );
                        })}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
              </React.Fragment>
            ))}
          </tbody>
          {hasFooter && (
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-black">
                {columns.map((column) => (
                  <td key={column.key} className={cn('p-3 tabular-nums', alignOf(column))}>
                    {column.footer ?? null}
                  </td>
                ))}
                {actions && <td className="p-3" />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};
