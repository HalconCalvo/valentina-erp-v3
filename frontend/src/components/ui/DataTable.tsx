import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel, // <--- Lo necesitamos importar de nuevo para el "truco"
  useReactTable,
} from "@tanstack/react-table"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  toolbar?: React.ElementType<any>
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey = "name",
  toolbar: Toolbar,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})

  const table = useReactTable({
    data,
    columns,
    // Modelos
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(), // Activamos el motor de paginación...
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    
    // --- ESTADO INICIAL FORZADO ---
    initialState: {
        pagination: {
            pageSize: 10000, // <--- TRUCO: Forzamos una página gigante para que quepan todos
            pageIndex: 0
        }
    },
    
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  })

  return (
    <div className="space-y-4">
      {/* TOOLBAR */}
      {Toolbar && <Toolbar table={table} />}

      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
        {/* Altura dinámica: 
            h-[65vh] en laptop
            h-[75vh] en monitores grandes 
            overflow-auto activa la barra de desplazamiento vertical 
        */}
        <div className="relative w-full overflow-auto h-[65vh] lg:h-[75vh]">
          <table className="w-full caption-bottom text-sm text-left relative">
            
            {/* HEADERS FIJOS (Sticky) */}
            <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 shadow-sm">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <th key={header.id} className="h-12 px-6 align-middle font-bold text-slate-500 uppercase text-xs [&:has([role=checkbox])]:pr-0 bg-slate-50">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            
            <tbody className="divide-y divide-slate-100">
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="transition-colors hover:bg-slate-50/80"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="p-6 align-middle [&:has([role=checkbox])]:pr-0">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="h-24 text-center text-slate-400">
                    No se encontraron resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FOOTER INFORMATIVO */}
      <div className="flex items-center justify-between px-2">
        <div className="text-xs text-slate-400 font-medium">
            Mostrando {table.getRowModel().rows.length} registros (Scroll infinito)
        </div>
      </div>
    </div>
  )
}