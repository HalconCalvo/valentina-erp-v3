import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { VEmptyState } from '@/components/ui/VEmptyState';
import { cn } from '@/lib/utils';

export interface VTableColumn<T = Record<string, unknown>> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
}

export interface VTableAction<T = Record<string, unknown>> {
  label: string;
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
}

type SortDirection = 'asc' | 'desc';

const SKELETON_ROWS = 5;

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
}: VTableProps<T>) => {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const sortedData = useMemo(() => {
    if (!sortKey) return data;

    return [...data].sort((rowA, rowB) => {
      const result = compareValues(rowA[sortKey], rowB[sortKey]);
      return sortDirection === 'asc' ? result : -result;
    });
  }, [data, sortDirection, sortKey]);

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
                className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
              >
                {column.label}
              </th>
            ))}
            {actions && (
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500',
                    column.sortable && 'cursor-pointer select-none hover:text-slate-700',
                  )}
                  onClick={() => handleSort(column)}
                >
                  <span className="inline-flex items-center">
                    {column.label}
                    {renderSortIcon(column)}
                  </span>
                </th>
              ))}
              {actions && (
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedData.map((row, rowIndex) => {
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
                      className="px-4 py-3 align-middle text-slate-700"
                    >
                      {column.render
                        ? column.render(row)
                        : (row[column.key] as React.ReactNode) ?? '—'}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3 align-middle">
                      <div className="flex flex-wrap items-center gap-2">
                        {rowActions.map((action) => (
                          <button
                            key={action.label}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              action.onClick(row);
                            }}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors hover:bg-slate-100',
                              action.variant === 'danger'
                                ? 'text-red-600 hover:bg-red-50'
                                : 'text-slate-600',
                            )}
                          >
                            {action.icon && (
                              <span className="[&_svg]:size-3.5">{action.icon}</span>
                            )}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
