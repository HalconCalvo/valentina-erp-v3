import { ColumnDef } from "@tanstack/react-table"
import { Material } from "../../../types/foundations"
import { ArrowUpDown } from "lucide-react"
import { Button } from "../../../components/ui/Button"

// --- LOGICA DE SEGURIDAD ---
// Leemos el rol directamente del navegador para filtrar columnas estáticas
const userRole = (localStorage.getItem('user_role') || '').toUpperCase();

// Definimos quién NO debe ver dinero (Lista Negra)
const hideFinancials = ['DESIGN', 'DISEÑO', 'DISENO'].includes(userRole);

// Definimos todas las columnas posibles (Exactamente 6 columnas)
const allColumns: ColumnDef<Material>[] = [
  {
    accessorKey: "sku",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="pl-0 hover:bg-transparent"
        >
          SKU
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="font-bold text-slate-700">{row.getValue("sku")}</div>,
  },
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="pl-0 hover:bg-transparent"
        >
          Nombre
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "category",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="pl-0 hover:bg-transparent"
        >
          Categoría
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    // Columna de Proveedor (Nueva, con Sort)
    id: "provider",
    accessorFn: (row: any) => row.provider_name || row.provider?.business_name || 'Sin Asignar',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="pl-0 hover:bg-transparent"
        >
          Proveedor
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => <div className="text-slate-600 font-medium truncate max-w-[150px]">{row.getValue("provider")}</div>,
  },
  {
    // Stock Físico (Sin Sort, alineado a la derecha)
    accessorKey: "physical_stock",
    header: () => <div className="text-right text-slate-500 font-semibold pr-4">Stock</div>,
    cell: ({ row }) => {
        const stock = parseFloat(row.getValue("physical_stock") || "0");
        const colorClass = stock <= 0 ? "text-red-600 font-black" : "text-slate-800 font-bold";
        return <div className={`text-right pr-4 ${colorClass}`}>{stock}</div>
    },
  },
  {
    // Costo (Sin Sort, alineado a la derecha, ocultable por seguridad)
    accessorKey: "current_cost",
    header: () => <div className="text-right text-slate-500 font-semibold">Costo</div>,
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("current_cost") || "0")
      const formatted = new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
      }).format(amount)
 
      return <div className="text-right font-bold text-indigo-700">{formatted}</div>
    },
  },
];

// --- EXPORTACIÓN FILTRADA ---
// Aquí ocurre la magia: Si hideFinancials es TRUE, eliminamos 'current_cost'
export const columns = allColumns.filter(col => {
    const key = (col as any).accessorKey || col.id;
    if (hideFinancials && (key === 'current_cost' || key === 'total_cost')) {
        return false; // No mostrar
    }
    return true; // Mostrar el resto
});