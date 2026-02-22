import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom'; 
import { useMaterials } from '../hooks/useMaterials';
import { useProviders } from '../hooks/useProviders'; // <--- NUEVO HOOK AÑADIDO
import { Material } from '@/types/foundations';
import { 
  Plus, Link2, Upload, DollarSign, ArrowRight, 
  ChevronDown, Pencil, Trash2, X, Lock, ArrowUpDown, EyeOff, Building2
} from 'lucide-react';
import client from '@/api/axios-client'; 

import ExportButton from '../../../components/ui/ExportButton';

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "../../../components/ui/DataTable"
import { MaterialsTableToolbar } from "../components/MaterialsTableToolbar"

export default function MaterialsPage() {
  // 1. TODOS LOS HOOKS PRIMERO
  const { materials, loading, createMaterial, updateMaterial, deleteMaterial } = useMaterials();
  const { providers, fetchProviders } = useProviders(); // <--- CARGAMOS PROVEEDORES
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados de Seguridad
  const [userRole, setUserRole] = useState(''); 
  
  // Estados de UI/Formulario
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  
  const initialFormState: Partial<Material> = {
    sku: '', name: '', category: '', 
    production_route: 'MATERIAL', 
    purchase_unit: '', usage_unit: '',
    conversion_factor: 1, current_cost: 0,
    associated_element_sku: '',
    provider_id: 0 // <--- INICIALIZAMOS PROVEEDOR
  };

  const [form, setForm] = useState<Partial<Material>>(initialFormState);

  // 2. EFECTOS
  useEffect(() => {
    const role = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    setUserRole(role);
    fetchProviders(); // <--- MANDAMOS A TRAER LOS PROVEEDORES AL CARGAR LA PÁGINA
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3. LOGICA DE ACCESO (MATRIZ DE SEGURIDAD)
  const isSales = userRole === 'SALES' || userRole === 'VENTAS';
  const isDesign = ['DESIGN', 'DISEÑO', 'DISENO'].includes(userRole);
  const isProduction = ['PRODUCTION', 'PRODUCCION', 'PRODUCCIÓN'].includes(userRole);
  const isReadOnly = isDesign || isProduction; 
  const showFinancials = ['ADMIN', 'ADMINISTRADOR', 'DIRECTOR', 'DIRECCION', 'DIRECTION', 'PRODUCTION', 'PRODUCCION'].includes(userRole);

  // 4. MEMOS (Columnas)
  const columns = useMemo<ColumnDef<Material>[]>(() => {
    const cols: ColumnDef<Material>[] = [
      {
        accessorKey: "sku",
        size: 120, 
        header: ({ column }) => {
          return (
            <button
              className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              SKU
              <ArrowUpDown className="h-3 w-3" />
            </button>
          )
        },
        cell: ({ row }) => (
          <span className="font-mono text-xs text-indigo-600 font-bold">
            {row.original.sku}
          </span>
        ),
      },
      {
        accessorKey: "name", 
        header: ({ column }) => {
          return (
            <button
              className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Nombre
              <ArrowUpDown className="h-3 w-3" />
            </button>
          )
        },
        enableHiding: true, 
      },
      {
        accessorKey: "category",
        header: ({ column }) => {
            return (
              <button
                className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              >
                Categoría
                <ArrowUpDown className="h-3 w-3" />
              </button>
            )
        },
        cell: ({ row }) => (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-slate-100 text-slate-800 border-slate-200">
                {row.getValue("category")}
            </span>
        ),
        filterFn: (row, id, value) => {
            return value === "ALL" ? true : row.getValue(id) === value;
        },
      },
      {
        id: "provider",
        accessorFn: (row) => (row as any).provider?.business_name || (row as any).provider_name || 'Sin Asignar',
        header: ({ column }) => {
            return (
              <button
                className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              >
                Proveedor
                <ArrowUpDown className="h-3 w-3" />
              </button>
            )
        },
        cell: ({ row }) => (
            <div className="flex items-center gap-1.5 text-slate-600">
                <Building2 size={14} className="text-slate-400 opacity-50"/>
                <span className="text-sm font-medium truncate max-w-[150px]">
                    {row.getValue("provider")}
                </span>
            </div>
        )
      },
      {
        accessorKey: "physical_stock",
        header: () => <div className="text-right">Stock</div>,
        cell: ({ row }) => {
            const stock = row.original.physical_stock || 0;
            return (
                <div className="text-right text-sm">
                    <span className={`font-bold ${stock <= 0 ? 'text-red-500' : 'text-slate-800'}`}>
                        {stock}
                    </span> <span className="text-slate-400 text-xs ml-1">{row.original.usage_unit}</span>
                </div>
            )
        },
        filterFn: (row, id, filterValue) => {
             const val = row.getValue(id) as number;
             if (Array.isArray(filterValue)) {
                 const [min, max] = filterValue;
                 return val >= min && val <= max;
             }
             return true;
        }
      }
    ];

    if (showFinancials) {
        cols.push({
            accessorKey: "current_cost",
            header: () => <div className="text-right">Costo</div>,
            cell: ({ row }) => {
                const amount = parseFloat(row.getValue("current_cost") || "0");
                const formatted = new Intl.NumberFormat("es-MX", {
                    style: "currency",
                    currency: "MXN",
                    minimumFractionDigits: 2
                }).format(amount);

                return (
                    <div className="text-right font-medium text-slate-900">
                        {formatted}
                    </div>
                )
            }
        });
    }

    if (!isReadOnly) {
        cols.push({
            id: "actions",
            cell: ({ row }) => {
                const mat = row.original;
                return (
                    <div className="flex justify-end gap-2">
                        <button onClick={() => handleEdit(mat)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                            <Pencil size={16} />
                        </button>
                        <button onClick={() => mat.id && handleDelete(mat.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                            <Trash2 size={16} />
                        </button>
                    </div>
                )
            }
        });
    }

    return cols;
  }, [isReadOnly, showFinancials]); 

  // -------------------------------------------------------------
  // 5. CANDADO DE SEGURIDAD
  // -------------------------------------------------------------
  if (isSales) {
      return <Navigate to="/" replace />;
  }

  // --- LÓGICA DE NEGOCIO RESTANTE ---
  
  const existingCategories = Array.from(new Set(materials.map(m => m.category))).sort();

  const mapMaterialsForExcel = (m: Material) => ({
      "SKU": m.sku,
      "Material": m.name,
      "Categoría": m.category,
      "Stock Físico": m.physical_stock || 0,
      "Unidad Uso": m.usage_unit,
      "Proveedor": (m as any).provider?.business_name || (m as any).provider_name || 'Sin Asignar', 
      ...(showFinancials && {
        "Costo Unitario": m.current_cost,
        "Valor Inventario": (m.physical_stock || 0) * m.current_cost
      })
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if(isReadOnly) return; 
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
        alert("Por favor selecciona un archivo .csv válido.");
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    if (!confirm(`¿Deseas importar "${file.name}"?`)) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
    }

    try {
        const response = await client.post('/foundations/materials/import-csv', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });

        const { created, updated, errors } = response.data;
        let message = `✅ Importación completada.\n- Creados: ${created}\n- Actualizados: ${updated}`;
        if (errors && errors.length > 0) message += `\n\n⚠️ Hubo errores. Revisa consola.`;
        
        alert(message);
        window.location.reload(); 

    } catch (error: any) {
        console.error(error);
        alert("❌ Error al importar: " + (error.response?.data?.detail || error.message));
    } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEdit = (material: Material) => {
    if(isReadOnly) return;
    setForm(material);
    setEditingId(material.id || null);
    setIsEditing(true);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: number) => {
    if(isReadOnly) return;
    if (!confirm("¿Estás seguro de eliminar este material?")) return;
    await deleteMaterial(id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(isReadOnly) return;
    
    if (!form.sku || !form.name || !form.category) {
        return alert("Por favor completa los campos obligatorios.");
    }

    const payload = {
        ...form,
        current_cost: showFinancials ? form.current_cost : (form.current_cost || 0),
        associated_element_sku: form.associated_element_sku?.trim() === '' ? null : form.associated_element_sku,
        // Limpiamos el ID 0 para enviarlo nulo si dicen "Sin asignar"
        provider_id: form.provider_id === 0 ? null : form.provider_id
    };

    let res;
    if (isEditing && editingId) {
        res = await updateMaterial(editingId, payload as Material);
    } else {
        res = await createMaterial(payload as Material);
    }

    if (res.success) {
        resetForm();
        window.location.reload(); // <--- Forzamos recarga para ver el nuevo Proveedor que mande el backend
    } else {
        alert(`❌ Error: ${res.error}`);
    }
  };

  const resetForm = () => {
      setForm(initialFormState);
      setIsEditing(false);
      setEditingId(null);
      setShowForm(false);
  };

  const filteredCategories = existingCategories.filter(c => 
    c.toLowerCase().includes((form.category || '').toLowerCase())
  );

  return (
    <div className="space-y-6 p-6">
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Catálogo de Materiales
            {isReadOnly && <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Lock size={10}/> SOLO LECTURA</span>}
            {!showFinancials && <span className="text-[10px] bg-red-50 text-red-500 border border-red-100 px-2 py-0.5 rounded-full flex items-center gap-1"><EyeOff size={10}/> COSTOS OCULTOS</span>}
          </h1>
          <p className="text-sm text-slate-500">Gestión de insumos y agrupación dinámica.</p>
        </div>
        
        <div className="flex items-center gap-2">
            <ExportButton 
                data={materials} 
                fileName="Inventario_Materiales" 
                mapping={mapMaterialsForExcel}
            />

            {!isReadOnly && (
                <>
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        <Upload size={16} /> Importar CSV
                    </button>
                    <button 
                        onClick={() => {
                            if (showForm) resetForm();
                            else setShowForm(true);
                        }}
                        className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium shadow-sm transition-all ${showForm ? 'bg-slate-500 hover:bg-slate-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                    >
                        {showForm ? <X size={16}/> : <Plus size={16} />} 
                        {showForm ? 'Cancelar' : 'Nuevo Material'}
                    </button>
                </>
            )}
        </div>
      </div>

      {/* FORMULARIO */}
      {showForm && !isReadOnly && (
        <div className="bg-slate-50 p-5 rounded-lg border border-indigo-200 mb-6 shadow-sm animate-in fade-in slide-in-from-top-4">
            <h3 className="font-bold text-sm mb-4 text-indigo-800 flex items-center gap-2">
                {isEditing ? <Pencil size={16}/> : <Plus size={16}/>}
                {isEditing ? 'Editando Material' : 'Alta de Material Unitario'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">SKU (Único)</label>
                        <input className="input-std font-mono" placeholder="Ej. TAB-BL-15" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} autoFocus={!isEditing}/>
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Nombre / Descripción</label>
                        <input className="input-std" placeholder="Ej. MDF Blanco 15mm" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                    </div>
                    <div className="md:col-span-1 relative">
                        <label className="text-xs font-bold text-slate-500 uppercase">Categoría</label>
                        <div className="relative">
                            <input className="input-std" placeholder="Selecciona..." value={form.category} 
                                onChange={e => { setForm({...form, category: e.target.value}); setShowCategorySuggestions(true); }}
                                onFocus={() => setShowCategorySuggestions(true)}
                                onBlur={() => setTimeout(() => setShowCategorySuggestions(false), 200)}
                            />
                            <div className="absolute right-2 top-2.5 text-slate-400 pointer-events-none"><ChevronDown size={14} /></div>
                        </div>
                        {showCategorySuggestions && filteredCategories.length > 0 && (
                            <ul className="absolute z-10 w-full bg-white border border-slate-200 rounded-md shadow-lg mt-1 max-h-48 overflow-auto text-sm">
                                {filteredCategories.map((cat) => (
                                    <li key={cat} className="px-3 py-2 hover:bg-indigo-50 cursor-pointer text-slate-700" onClick={() => setForm({...form, category: cat})}>{cat}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                    
                    {/* FILA DE CONTROLES INFERIORES */}
                    <div className="md:col-span-4 bg-white p-3 rounded border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        
                        {/* SELECTOR DE PROVEEDOR (NUEVO) */}
                        <div>
                            <label className="text-[10px] font-bold text-indigo-500 uppercase flex items-center gap-1 mb-1">
                                <Building2 size={12}/> Proveedor Principal
                            </label>
                            <select 
                                className="input-std bg-slate-50" 
                                value={form.provider_id || 0} 
                                onChange={e => setForm({...form, provider_id: Number(e.target.value) || undefined})}
                            >
                                <option value={0}>-- Sin Asignar --</option>
                                {providers.map(p => (
                                    <option key={p.id} value={p.id}>{p.business_name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Unidad Compra</label>
                            <input className="input-std bg-slate-50" placeholder="Ej. Hoja" value={form.purchase_unit} onChange={e => setForm({...form, purchase_unit: e.target.value, usage_unit: e.target.value})} />
                        </div>
                        <div className="relative">
                            <label className="text-[10px] font-bold text-indigo-500 uppercase w-full text-center block mb-1">Factor Conv.</label>
                            <div className="flex items-center gap-2">
                                <ArrowRight size={14} className="text-slate-400"/>
                                <input type="number" step="0.01" className="input-std font-bold text-center text-indigo-700 border-indigo-200" value={form.conversion_factor} onChange={e => setForm({...form, conversion_factor: parseFloat(e.target.value)})} />
                                <ArrowRight size={14} className="text-slate-400"/>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Unidad Uso</label>
                            <input className="input-std bg-slate-50" placeholder="Ej. m2" value={form.usage_unit} onChange={e => setForm({...form, usage_unit: e.target.value})} />
                        </div>
                    </div>

                    <div className="md:col-span-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Ruta Producción</label>
                        <select className="input-std h-[42px]" value={form.production_route} onChange={e => setForm({...form, production_route: e.target.value as any})}>
                            <option value="MATERIAL">MATERIAL (Inventariable)</option>
                            <option value="PROCESO">PROCESO (Interno)</option>
                            <option value="CONSUMIBLE">CONSUMIBLE (Gasto)</option>
                            <option value="SERVICIO">SERVICIO (Externo)</option>
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><Link2 size={12}/> Link SKU</label>
                        <input className="input-std border-dashed" value={form.associated_element_sku || ''} onChange={e => setForm({...form, associated_element_sku: e.target.value})} />
                    </div>

                    {showFinancials && (
                        <div className="md:col-span-1">
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><DollarSign size={12}/> Costo Compra</label>
                            <input type="number" step="0.01" className="input-std font-bold text-slate-700" value={form.current_cost} onChange={e => setForm({...form, current_cost: parseFloat(e.target.value)})} />
                        </div>
                    )}
                    
                    <div className="md:col-span-4 mt-2 flex gap-3">
                        <button type="button" onClick={resetForm} className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded px-4 py-3 text-sm font-bold">Cancelar</button>
                        <button type="submit" className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white rounded px-4 py-3 text-sm font-bold shadow-sm flex items-center justify-center gap-2">
                            {isEditing ? 'Guardar Cambios' : 'Crear Material'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
      )}

      {/* --- TABLA --- */}
      <DataTable 
        columns={columns} 
        data={materials} 
        searchKey="name"
        toolbar={MaterialsTableToolbar} 
      />

      <style>{`.input-std { width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; color: #1e293b; transition: all 0.2s; } .input-std:focus { outline: none; border-color: #6366f1; ring: 2px solid #e0e7ff; }`}</style>
    </div>
  );
}