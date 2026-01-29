import React, { useMemo } from "react"
import { Table } from "@tanstack/react-table"
import { X, Search } from "lucide-react"

interface MaterialsTableToolbarProps<TData> {
  table: Table<TData>
}

export function MaterialsTableToolbar<TData>({
  table,
}: MaterialsTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0

  // 1. LEEMOS EL VALOR ACTUAL DEL FILTRO PARA SINCRONIZAR EL SELECT
  // Si es undefined (se limpió), forzamos que sea "ALL"
  const currentCategory = (table.getColumn("category")?.getFilterValue() as string) ?? "ALL"

  // Extraemos todas las categorías únicas dinámicamente
  const uniqueCategories = useMemo(() => {
    const rows = table.getPreFilteredRowModel().rows;
    const categories = new Set<string>();
    rows.forEach(row => {
      const cat = row.getValue("category") as string;
      if (cat) categories.add(cat);
    });
    return Array.from(categories).sort();
  }, [table.getPreFilteredRowModel().rows]);

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm mb-4">
      <div className="flex flex-1 flex-wrap items-center gap-3 w-full">
        
        {/* BUSCADOR */}
        <div className="relative w-full md:w-auto">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
            placeholder="Buscar por Nombre..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) =>
                table.getColumn("name")?.setFilterValue(event.target.value)
            }
            className="h-9 w-full md:w-[250px] pl-9 pr-4 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
        </div>

        {/* FILTRO DE CATEGORÍA (CONTROLADO) */}
        {table.getColumn("category") && (
            <div className="relative">
                <select
                    // AQUÍ ESTÁ EL CAMBIO: value controlado en lugar de defaultValue
                    value={currentCategory} 
                    className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    onChange={(event) => {
                        const value = event.target.value
                        if (value === "ALL") {
                            table.getColumn("category")?.setFilterValue(undefined)
                        } else {
                            table.getColumn("category")?.setFilterValue(value)
                        }
                    }}
                >
                    <option value="ALL">Todas las Categorías</option>
                    {uniqueCategories.map((cat) => (
                        <option key={cat} value={cat}>
                            {cat}
                        </option>
                    ))}
                </select>
            </div>
        )}

        {/* SWITCH STOCK */}
        {table.getColumn("physical_stock") && (
             <label className="flex items-center space-x-2 rounded-md border border-slate-200 px-3 py-1.5 hover:bg-slate-50 cursor-pointer bg-slate-50/50">
                <input 
                    type="checkbox"
                    // También controlamos el checkbox para que se desmarque al limpiar
                    checked={(table.getColumn("physical_stock")?.getFilterValue() as any)?.[0] === 0.01}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    onChange={(event) => {
                        const isChecked = event.target.checked
                        if (isChecked) {
                            table.getColumn("physical_stock")?.setFilterValue((old: any) => [0.01, 1000000]) 
                        } else {
                            table.getColumn("physical_stock")?.setFilterValue(undefined)
                        }
                    }}
                />
                <span className="text-sm font-medium text-slate-700">Con Existencias</span>
             </label>
        )}

        {/* BOTÓN LIMPIAR */}
        {isFiltered && (
          <button
            onClick={() => table.resetColumnFilters()}
            className="h-9 px-3 text-sm font-medium text-slate-500 hover:text-slate-900 flex items-center gap-2 hover:bg-slate-100 rounded-md transition-colors"
          >
            Limpiar
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}