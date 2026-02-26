import { useEffect, useMemo, useState, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { Plus, Layers, Square, Package, Activity, Lock, Unlock, Save, EyeOff } from "lucide-react"; 
import { VersionComponent, VersionStatus } from "../../../types/design";
import { Material } from "../../../types/foundations";

interface Props {
  materials: Material[];
  edgebandingFactor: number; 
  defaultValues: VersionComponent[];
  onSave: (data: VersionComponent[], status: VersionStatus) => void; 
  isLoading: boolean;
  initialStatus: VersionStatus; 
}

// ============================================================================
// LÓGICA: BUSCADOR INVISIBLE (Ahora con Auto-Foco y Resaltado Blanco)
// ============================================================================
const InlineSearchableSelect = ({ materials, value, onChange, disabled }: { materials: Material[], value: number, onChange: (id: number) => void, disabled: boolean }) => {
    const selectedMaterial = materials.find(m => m.id === Number(value));
    const [searchTerm, setSearchTerm] = useState(selectedMaterial ? selectedMaterial.name : "");
    const [isOpen, setIsOpen] = useState(false);
    
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null); // REFERENCIA PARA ATRAPAR EL CURSOR

    // 1. AUTO-FOCUS AL NACER: Si el renglón es nuevo (value === 0), pon el cursor aquí
    useEffect(() => {
        if (value === 0 && !disabled && inputRef.current) {
            // Un pequeño timeout asegura que el render se completó antes de enfocar
            setTimeout(() => {
                inputRef.current?.focus();
                setIsOpen(true);
            }, 50);
        }
    }, [value, disabled]);

    // 2. Sincroniza el texto si el material cambia externamente
    useEffect(() => {
        const mat = materials.find(m => m.id === Number(value));
        setSearchTerm(mat ? mat.name : "");
    }, [value, materials]);

    // 3. Cierra el menú si haces clic fuera de él y reinicia el texto
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                const mat = materials.find(m => m.id === Number(value));
                setSearchTerm(mat ? mat.name : "");
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [value, materials]);

    const filteredMaterials = useMemo(() => {
        if (!searchTerm) return materials;
        const lowerTerm = searchTerm.toLowerCase();
        return materials.filter(m => 
            (m.name && m.name.toLowerCase().includes(lowerTerm)) || 
            (m.sku && m.sku.toLowerCase().includes(lowerTerm))
        );
    }, [materials, searchTerm]);

    return (
        <div ref={wrapperRef} className="relative w-full">
            <input 
                ref={inputRef}
                type="text"
                disabled={disabled}
                placeholder="Escribe el material a buscar..."
                // LÓGICA DE COLOR: Si está vacío (value===0), se pinta de blanco y con borde. Si ya tiene valor, es transparente.
                className={`w-full text-xs outline-none truncate disabled:cursor-not-allowed text-slate-800 placeholder-slate-400 transition-all ${
                    value === 0 && !disabled
                    ? 'bg-white border border-indigo-300 rounded px-2 py-1.5 shadow-sm focus:ring-2 focus:ring-indigo-100'
                    : 'bg-transparent border-none p-0 focus:bg-white focus:ring-1 focus:ring-indigo-200 focus:rounded focus:px-2 focus:py-1'
                }`}
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsOpen(true);
                }}
                onFocus={() => !disabled && setIsOpen(true)}
                autoComplete="off"
            />

            {isOpen && !disabled && (
                <div className="absolute z-50 w-[350px] mt-1 bg-white border border-slate-200 rounded-lg shadow-xl left-0 max-h-48 overflow-y-auto">
                    {filteredMaterials.map(m => (
                        <div 
                            key={m.id} 
                            className="px-3 py-2 text-xs hover:bg-slate-100 cursor-pointer flex items-center justify-between border-b border-slate-50 last:border-0"
                            onMouseDown={(e) => {
                                e.preventDefault(); 
                                onChange(m.id!);
                                setSearchTerm(m.name);
                                setIsOpen(false);
                            }}
                        >
                            <span className="truncate pr-2 font-medium text-slate-700">{m.name}</span>
                            <span className="font-mono text-[10px] text-slate-400 shrink-0">{m.sku}</span>
                        </div>
                    ))}
                    {filteredMaterials.length === 0 && (
                        <div className="px-3 py-4 text-xs text-slate-400 text-center">
                            No se encontraron materiales
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
// ============================================================================

export const VersionRecipeForm = ({ 
    materials, 
    edgebandingFactor, 
    defaultValues, 
    onSave, 
    isLoading,
    initialStatus 
}: Props) => {
    
  const { control, register, handleSubmit, setValue, getValues, watch } = useForm({
    defaultValues: { components: [] as VersionComponent[] },
    mode: "onChange"
  });

  const { fields, append, insert } = useFieldArray({ control, name: "components" });
  const watchedComponents = watch("components");
  
  const [internalStatus, setInternalStatus] = useState<VersionStatus>(VersionStatus.DRAFT);
  const [monitor, setMonitor] = useState({ boardsTotal: 0, producTotal: 0 });

  // --- LOGICA DE SEGURIDAD ESTRICTA (LISTA BLANCA) ---
  const userRole = (localStorage.getItem('user_role') || '').toUpperCase();
  const showFinancials = ['ADMIN', 'ADMINISTRADOR', 'DIRECTOR', 'DIRECCION', 'DIRECTION'].includes(userRole);

  const FACTOR = (edgebandingFactor && edgebandingFactor > 0) ? edgebandingFactor : 25.00;

  useEffect(() => {
    if (defaultValues && defaultValues.length > 0) {
        const current = getValues("components");
        if (current.length === 0) setValue("components", defaultValues);
    }
    if (initialStatus) setInternalStatus(initialStatus);
  }, [defaultValues, initialStatus, setValue, getValues]);

  const isReadOnly = internalStatus === VersionStatus.READY || internalStatus === VersionStatus.OBSOLETE;
  const getUsageCost = (mat: Material) => mat ? mat.current_cost : 0;

  const handleQuantityChange = (index: number, newValueStr: string) => {
      if (isReadOnly) return;
      const newValue = parseFloat(newValueStr) || 0;
      setValue(`components.${index}.quantity`, newValue, { shouldValidate: true });

      const currentFormValues = getValues("components");
      const currentComp = currentFormValues[index];
      const mat = materials.find(m => m.id === Number(currentComp.material_id));
      if (!mat) return;

      const matCat = mat.category?.toUpperCase() || "";
      const matName = mat.name?.toUpperCase() || "";
      const isBoard = (matCat.includes("TABLERO") || matName.includes("MDF")) && !matName.includes("CUBRECANTO");

      if (isBoard) {
          const associatedSku = (mat as any).associated_element_sku?.trim().toUpperCase();
          if (associatedSku && associatedSku.length > 1) {
              const existingIndex = currentFormValues.findIndex(c => {
                  const m = materials.find(x => x.id === Number(c.material_id));
                  return m && m.sku.trim().toUpperCase() === associatedSku;
              });
              let totalBoards = 0;
              currentFormValues.forEach((c, idx) => {
                  const q = idx === index ? newValue : (parseFloat(String(c.quantity)) || 0);
                  const m = materials.find(x => x.id === Number(c.material_id));
                  if (m && (m as any).associated_element_sku?.trim().toUpperCase() === associatedSku) totalBoards += q;
              });
              const requiredEdge = Number((totalBoards * FACTOR).toFixed(2));
              if (existingIndex !== -1) {
                  setValue(`components.${existingIndex}.quantity`, requiredEdge);
              } else {
                  const edgeMat = materials.find(m => m.sku.trim().toUpperCase() === associatedSku);
                  if (edgeMat) insert(index + 1, { material_id: edgeMat.id!, quantity: requiredEdge, temp_category: currentComp.temp_category } as any);
              }
          }
          let totalRaw = 0;
          let totalCeiled = 0;
          getValues("components").forEach((c, idx) => {
              const q = idx === index ? newValue : (parseFloat(String(c.quantity)) || 0);
              const m = materials.find(x => x.id === Number(c.material_id));
              if (m) {
                  const cCat = m.category?.toUpperCase() || "";
                  const cName = m.name?.toUpperCase() || "";
                  if ((cCat.includes("TABLERO") || cName.includes("MDF")) && !cName.includes("CUBRECANTO")) {
                      totalRaw += q;
                      totalCeiled += Math.ceil(q);
                  }
              }
          });
          const producIndex = currentFormValues.findIndex(c => materials.find(x => x.id === Number(c.material_id))?.sku === "PRODUC");
          if (producIndex !== -1) setValue(`components.${producIndex}.quantity`, totalCeiled);
          setMonitor({ boardsTotal: totalRaw, producTotal: totalCeiled });
      }
  };

  const groupedFields = useMemo(() => {
    const groups: Record<string, any[]> = { "Gabinetes": [], "Piedra": [], "Otros": [] };
    fields.forEach((field: any, index) => {
        const val = watchedComponents?.[index];
        const sec = val?.temp_category || field.temp_category || "Otros"; 
        if (!groups[sec]) groups[sec] = [];
        groups[sec].push({ ...field, originalIndex: index });
    });
    return groups;
  }, [fields, watchedComponents]); 

  let totalCost = 0;
  if (watchedComponents) {
      watchedComponents.forEach((comp) => {
          const mat = materials.find(m => m.id === Number(comp.material_id));
          if (mat) {
              const q = parseFloat(String(comp.quantity || 0));
              const cost = getUsageCost(mat);
              totalCost += Math.ceil((cost * q) * 100) / 100;
          }
      });
  }

  const formatMoney = (amount: number) => {
    return amount.toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
  };

  return (
    <form onSubmit={handleSubmit((data) => onSave(data.components, internalStatus))} className="pb-2">
      
      {/* HEADER: Monitor y Semáforo */}
      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-3 shadow-sm sticky top-0 z-20 flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
         <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 font-bold uppercase text-xs text-amber-900">
                 <Activity size={16} /> Monitor
             </div>
             <div className="flex gap-4 border-l border-amber-200 pl-4 text-xs">
                <div>Tableros: <b>{monitor.boardsTotal.toFixed(2)}</b></div>
                <div>Hojas: <b className="text-emerald-700">{monitor.producTotal}</b></div>
             </div>
         </div>

         <div className="flex items-center gap-2 bg-white/50 p-1.5 rounded border border-amber-100">
            {internalStatus === VersionStatus.READY ? <Unlock size={14} className="text-emerald-600"/> : <Lock size={14} className="text-amber-600"/>}
            <label className="text-[10px] font-bold text-slate-500 uppercase">Estatus:</label>
            <select 
                className={`text-xs font-bold border-none outline-none cursor-pointer rounded px-2 py-1 ${
                    internalStatus === VersionStatus.READY ? 'text-emerald-700 bg-emerald-100' : 'text-amber-700 bg-amber-100'
                }`}
                value={internalStatus}
                onChange={(e) => setInternalStatus(e.target.value as VersionStatus)}
            >
                <option value={VersionStatus.DRAFT}>🔴 BORRADOR (Editable)</option>
                <option value={VersionStatus.READY}>🟢 LISTO (Bloqueado)</option>
                <option value={VersionStatus.OBSOLETE}>⚫ OBSOLETO</option>
            </select>
         </div>
      </div>

      {isReadOnly && (
          <div className="mb-4 bg-slate-100 border border-slate-300 text-slate-600 px-4 py-2 rounded text-xs flex items-center gap-2">
              <Lock size={14} /> <span>Receta en modo <b>Solo Lectura</b>. Cambia a Borrador para editar.</span>
          </div>
      )}
      
      {/* Aviso informativo de seguridad */}
      {!showFinancials && (
         <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded text-xs flex items-center gap-2">
            <EyeOff size={14} /> <span>Modo Operativo: Información financiera oculta por seguridad.</span>
         </div>
      )}

      {/* CUERPO DEL FORMULARIO */}
      {Object.entries(groupedFields).map(([sectionName, sectionFields]) => (
        <div key={sectionName} className={`mb-6 border rounded-lg overflow-visible shadow-sm ${isReadOnly ? 'opacity-70' : 'border-slate-200'}`}>
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-widest">
                    {sectionName === "Gabinetes" ? <Layers size={14}/> : <Package size={14}/>} {sectionName}
                </div>
            </div>
            <div className="divide-y divide-slate-100 bg-white">
                {/* HEADERS DE TABLA */}
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50/50 text-[10px] uppercase font-bold text-slate-400">
                    <div className="col-span-2">SKU</div>
                    <div className={showFinancials ? "col-span-6" : "col-span-8"}>Descripción / Artículo</div>
                    <div className="col-span-1 text-center">Cant.</div>
                    <div className="col-span-1 text-center">Unidad</div>
                    {showFinancials && (
                        <>
                            <div className="col-span-1 text-right">Costo</div>
                            <div className="col-span-1 text-right">Importe</div>
                        </>
                    )}
                </div>

                {/* FILAS DE DATOS */}
                {sectionFields.map((field) => {
                    const idx = field.originalIndex;
                    const val = watchedComponents?.[idx];
                    const mat = materials.find(m => m.id === Number(val?.material_id));
                    const cost = getUsageCost(mat as Material);
                    const qty = parseFloat(String(val?.quantity || 0));
                    const total = Math.ceil((cost * qty) * 100) / 100;
                    
                    return (
                        <div key={field.id} className="grid grid-cols-12 gap-2 px-3 py-1 items-center hover:bg-slate-50 relative">
                            <div className="col-span-2 text-xs font-mono text-slate-500 truncate">{mat?.sku || "---"}</div>
                            
                            <div className={showFinancials ? "col-span-6" : "col-span-8"}>
                                <InlineSearchableSelect 
                                    materials={materials}
                                    value={val?.material_id || 0}
                                    onChange={(newId: number) => setValue(`components.${idx}.material_id`, newId, { shouldValidate: true })}
                                    disabled={isReadOnly}
                                />
                            </div>

                            <div className="col-span-1">
                                <input type="number" step="0.01" disabled={isReadOnly} {...register(`components.${idx}.quantity`)} onChange={(e) => handleQuantityChange(idx, e.target.value)} className="w-full text-center text-xs border rounded h-6 disabled:bg-slate-100"/>
                            </div>
                            <div className="col-span-1 text-center text-[10px] text-slate-400">{mat?.usage_unit || "-"}</div>
                            
                            {showFinancials && (
                                <>
                                    <div className="col-span-1 text-right text-[10px] text-slate-500 font-mono">
                                        {mat ? formatMoney(cost) : "-"}
                                    </div>
                                    <div className="col-span-1 text-right text-xs font-bold font-mono">
                                        {total > 0 ? formatMoney(total) : "-"}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="bg-slate-50 p-2 text-center">
                <button type="button" onClick={() => !isReadOnly && append({ material_id: 0, quantity: 0, temp_category: sectionName } as any)} disabled={isReadOnly} className="text-xs text-indigo-600 font-medium px-4 py-1 border border-dashed border-indigo-300 rounded hover:bg-indigo-50 disabled:opacity-50">
                    <Plus size={12} className="inline mr-1"/> Agregar
                </button>
            </div>
        </div>
      ))}

      {/* FOOTER VERDE */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 shadow-lg z-30 md:pl-64 flex justify-between items-center px-4">
          <div className="text-right flex items-center gap-4 ml-auto">
             
             {showFinancials && (
                 <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Costo Total</div>
                    <div className="text-2xl font-black text-emerald-600">{formatMoney(totalCost)}</div>
                 </div>
             )}

             <button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-6 rounded-lg font-bold shadow-md flex items-center gap-2 disabled:bg-slate-400">
                {isLoading ? 'Guardando...' : 'Guardar Receta'} <Save size={18} />
             </button>
          </div>
      </div>
      <div className="h-20"></div>
    </form>
  );
};