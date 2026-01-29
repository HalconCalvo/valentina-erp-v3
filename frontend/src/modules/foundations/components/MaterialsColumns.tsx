import { ColumnDef } from "@tanstack/react-table"
import { Material } from "../../../types/foundations" // Importando TU tipo real
import { ArrowUpDown } from "lucide-react" // Icono para el sort
import { Button } from "../../../components/ui/Button" // Tu botón existente

export const columns: ColumnDef<Material>[] = [
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
        const stock = parseFloat(row.getValue("physical_stock"));
        // Lógica visual: Rojo si es 0 o menos
        const colorClass = stock <= 0 ? "text-red-600 font-bold" : "text-gray-900";
        return <div className={`text-right ${colorClass}`}>{stock}</div>
    },
  },
  {
    accessorKey: "current_cost",
    header: () => <div className="text-right">Costo Ref.</div>,
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("current_cost"))
      const formatted = new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
      }).format(amount)
 
      return <div className="text-right font-medium">{formatted}</div>
    },
  },
]