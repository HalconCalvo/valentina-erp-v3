import { ColumnDef } from "@tanstack/react-table"
import { Material } from "../../../types/foundations"
import { ArrowUpDown } from "lucide-react"
import { Button } from "../../../components/ui/Button"

// --- LOGICA DE SEGURIDAD ---
// Leemos el rol directamente del navegador para filtrar columnas estáticas
const userRole = (localStorage.getItem('user_role') || '').toUpperCase();

// Definimos quién NO debe ver dinero (Lista Negra)
const hideFinancials = ['DESIGN', 'DISEÑO', 'DISENO'].includes(userRole);

// Definimos todas las columnas posibles
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
    cell: ({ row }) => <div className="font-medium">{row.getValue("sku")}</div>,
  },
  {
    accessorKey: "name",
    header: "Nombre del Material",
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
    accessorKey: "purchase_unit",
    header: "Unidad",
  },
  {
    accessorKey: "physical_stock",
    header: ({ column }) => {
      return (
        <div className="text-right">
            <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="pr-0 hover:bg-transparent"
            >
            Stock Físico
            <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
        </div>
      )
    },
    cell: ({ row }) => {
        const stock = parseFloat(row.getValue("physical_stock") || "0");
        const colorClass = stock <= 0 ? "text-red-600 font-bold" : "text-gray-900";
        return <div className={`text-right ${colorClass}`}>{stock}</div>
    },
  },
  {
    accessorKey: "current_cost",
    header: () => <div className="text-right">Costo Ref.</div>,
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("current_cost") || "0")
      const formatted = new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
      }).format(amount)
 
      return <div className="text-right font-medium">{formatted}</div>
    },
  },
  // Si existiera una columna "importe" o "total" aquí, la lógica de abajo también la eliminaría.
];

// --- EXPORTACIÓN FILTRADA ---
// Aquí ocurre la magia: Si hideFinancials es TRUE, eliminamos 'current_cost'
export const columns = allColumns.filter(col => {
    if (hideFinancials && (col.accessorKey === 'current_cost' || col.accessorKey === 'total_cost')) {
        return false; // No mostrar
    }
    return true; // Mostrar el resto
});