import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, User, Loader } from "lucide-react";
import Button from "../../../components/ui/Button"; 
import { VersionRecipeForm } from "../components/VersionRecipeForm"; 
import { designService } from "../../../api/design-service"; 
import axiosClient from "../../../api/axios-client"; 
import { API_ROUTES } from "../../../api/endpoints"; 
import { ProductVersion, VersionComponent, VersionStatus } from "../../../types/design";
import { Material, Client } from "../../../types/foundations"; 

const GENERIC_TEMPLATE = [
    { sku: "MDFBCO152C", default_qty: 0, section: "Gabinetes" },
    { sku: "MDFNEG152C", default_qty: 0, section: "Gabinetes" },
    { sku: "CHPCTA1BCO", default_qty: 0, section: "Gabinetes" },
    { sku: "CHPCTA1COL", default_qty: 0, section: "Gabinetes" },
    { sku: "0601-368", default_qty: 0, section: "Gabinetes" },
    { sku: "0303-086", default_qty: 0, section: "Gabinetes" },
    { sku: "0402-540", default_qty: 0, section: "Gabinetes" },
    { sku: "0502-019", default_qty: 0, section: "Gabinetes" },
    { sku: "0508-084", default_qty: 0, section: "Gabinetes" },
    { sku: "0502-002", default_qty: 0, section: "Gabinetes" },
    { sku: "0501-057", default_qty: 0, section: "Gabinetes" },
    { sku: "0502-004", default_qty: 0, section: "Gabinetes" },
    { sku: "0506-018", default_qty: 0, section: "Gabinetes" },
    { sku: "0507-185", default_qty: 0, section: "Gabinetes" },
    { sku: "0507-169", default_qty: 0, section: "Gabinetes" },
    { sku: "0204-022", default_qty: 0, section: "Gabinetes" },
    { sku: "0508-051", default_qty: 0, section: "Gabinetes" },
    { sku: "1205-055", default_qty: 0, section: "Gabinetes" },
    { sku: "1208-003", default_qty: 0, section: "Gabinetes" },
    { sku: "1208-005", default_qty: 0, section: "Gabinetes" },
    { sku: "1208-007", default_qty: 0, section: "Gabinetes" },
    { sku: "1208-011", default_qty: 0, section: "Gabinetes" },
    { sku: "1208-012", default_qty: 0, section: "Gabinetes" },
    { sku: "PRODUC", default_qty: 0, section: "Gabinetes" },
    { sku: "INSTALACOCINA", default_qty: 0, section: "Gabinetes" },
    { sku: "GRASNGAB", default_qty: 0, section: "Piedra" },
    { sku: "MAQGRANITO", default_qty: 0, section: "Piedra" },
    { sku: "INSTALAGRANITO", default_qty: 0, section: "Piedra" },
    { sku: "Viáticos", default_qty: 0, section: "Otros" },
];

export default function DesignBuilderPage() { 
  const { id } = useParams<{ id: string }>(); 
  const navigate = useNavigate();

  const [version, setVersion] = useState<ProductVersion | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [edgebandingFactor, setEdgebandingFactor] = useState<number>(0);
  const [componentsToRender, setComponentsToRender] = useState<VersionComponent[]>([]);
  
  const [productName, setProductName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        if (!id) return;

        const [versionData, materialsRes, configRes, clientsRes] = await Promise.all([
            designService.getVersion(Number(id)),
            axiosClient.get(API_ROUTES.FOUNDATIONS.MATERIALS),
            axiosClient.get(API_ROUTES.FOUNDATIONS.GLOBAL_CONFIG),
            axiosClient.get(API_ROUTES.FOUNDATIONS.CLIENTS)
        ]);

        const allMaterials = materialsRes.data as Material[];
        const config = Array.isArray(configRes.data) ? configRes.data[0] : configRes.data;
        
        setVersion(versionData);
        setMaterials(allMaterials);
        setClients(clientsRes.data as Client[]);
        setEdgebandingFactor(config?.default_edgebanding_factor || 0);
        setProductName(versionData.master?.name || "");

        if (!versionData.components || versionData.components.length === 0) {
            // Si está vacía, usamos la plantilla
            const templateComponents = GENERIC_TEMPLATE.map(tplItem => {
                const material = allMaterials.find(m => m.sku.trim().toUpperCase() === tplItem.sku.trim().toUpperCase());
                if (material) {
                    return {
                        material_id: material.id,
                        quantity: tplItem.default_qty,
                        temp_category: tplItem.section, 
                        temp_material_sku: material.sku,
                        temp_material_name: material.name
                    } as any; 
                }
                return null;
            }).filter(item => item !== null) as VersionComponent[];
            setComponentsToRender(templateComponents);
        } else {
            // Si ya tiene datos, hidratamos y CATEGORIZAMOS INTELIGENTEMENTE
            const hydratedComponents = versionData.components.map(comp => {
                const mat = allMaterials.find(m => m.id === comp.material_id);
                const templateMatch = GENERIC_TEMPLATE.find(t => t.sku.toUpperCase() === mat?.sku.toUpperCase());
                
                // --- MOTOR DE REGLAS DE CATEGORIZACIÓN ---
                let sectionName = "Otros"; // Por defecto
                
                if (templateMatch) {
                    sectionName = templateMatch.section; // Si viene en plantilla, respeta su bloque
                } else if (mat) {
                    const matCat = (mat.category || "").toUpperCase();
                    const matName = (mat.name || "").toUpperCase();

                    // Reglas RTA
                    if (matCat.includes("PIEDRA") || matCat.includes("GRANITO") || matCat.includes("CUARZO") || matCat.includes("MÁRMOL") || matCat.includes("MARMOL")) {
                        sectionName = "Piedra";
                    } else if (matCat.includes("TABLERO") || matCat.includes("MDF") || matCat.includes("HERRAJE") || matCat.includes("CUBRECANTO") || matCat.includes("MADERA") || matCat.includes("BISAGRA") || matName.includes("BISAGRA") || matName.includes("CORREDERA")) {
                        sectionName = "Gabinetes";
                    }
                }

                return {
                    ...comp,
                    temp_category: sectionName,
                    temp_material_sku: mat?.sku || "",
                    temp_material_name: mat?.name || ""
                };
            });
            setComponentsToRender(hydratedComponents);
        }

      } catch (err) {
        console.error("Error cargando datos:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [id]);

  const handleSaveAll = async (componentsFromForm: VersionComponent[], newStatus: VersionStatus) => {
    if (!version?.id || !version.master?.id) return;
    try {
      setIsSaving(true);
      
      const cleanComponents = componentsFromForm.filter(item => item.quantity > 0);
      
      await designService.updateVersion(version.id, {
          ...version,
          status: VersionStatus.DRAFT, 
          components: cleanComponents
      });

      if (newStatus !== VersionStatus.DRAFT) {
          await new Promise(r => setTimeout(r, 200));
          await designService.updateVersion(version.id, {
            master_id: version.master.id,
            version_name: version.version_name,
            status: newStatus, 
            components: cleanComponents
          });
      }

      alert("✅ Guardado correctamente.");
      window.location.reload(); 

    } catch (e) {
      console.error("Error al guardar:", e);
      alert("Error al guardar.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader className="animate-spin text-indigo-600"/></div>;
  if (!version) return <div className="p-10 text-red-500">Versión no encontrada</div>;

  const clientObj = clients.find(c => c.id === version.master?.client_id);
  const clientName = (clientObj as any)?.full_name || (clientObj as any)?.name || "Producto Interno";

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      
      {/* HEADER LIMPIO (Con botonera de Versiones) */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex justify-between items-center shadow-sm shrink-0 z-40">
        <div className="flex items-center gap-4 w-full">
          <Button variant="ghost" size="sm" onClick={() => navigate("/design")} className="text-slate-400 hover:text-slate-700 shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex-1 flex flex-col justify-center">
             <div className="flex items-center gap-3 group flex-wrap">
                <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none truncate max-w-md" title={productName}>
                    {productName || "Sin Nombre"}
                </h1>

                <span className="text-slate-300 text-xl font-light">/</span>

                {/* BOTONERA DE VERSIONES ESTRICTA */}
                <div className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 rounded-lg p-0.5 shadow-sm">
                    <span className="text-sm font-black text-indigo-700 px-2 tracking-wide">
                        {version.version_name || "V1.0"}
                    </span>
                    
                    {/* RENOMBRAR */}
                    <button 
                        onClick={async () => {
                            const newName = prompt("Nuevo nombre para esta versión:", version.version_name);
                            if (newName && newName.trim() !== "") {
                                try {
                                    setIsSaving(true);
                                    await designService.renameVersion(version.id!, newName.trim());
                                    setVersion({...version, version_name: newName.trim()});
                                } catch (e) { alert("Error al renombrar la versión."); }
                                finally { setIsSaving(false); }
                            }
                        }}
                        className="p-1.5 text-indigo-500 hover:bg-white hover:shadow-sm rounded transition-all"
                        title="Renombrar esta versión"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                    </button>
                    
                    <div className="w-px h-4 bg-indigo-200 mx-1"></div>

                    {/* CLONAR (CORREGIDO) */}
                    <button 
                        onClick={async () => {
                            if (!version || !version.master?.id) return;
                            const newName = prompt("Nombre para la NUEVA versión:", "V2.0");
                            if (newName && newName.trim() !== "") {
                                try {
                                    setIsSaving(true);
                                    const payload: any = {
                                        master_id: version.master.id,
                                        version_name: newName.trim(),
                                        status: VersionStatus.DRAFT,
                                        components: [] 
                                    };
                                    const response = await designService.createVersion(payload);
                                    const newVersionId = response?.id || response?.data?.id;
                                    
                                    if (newVersionId) {
                                        // Usamos React Router para una transición fluida en lugar de recargar la página
                                        navigate(`/design/versions/${newVersionId}`);
                                    }
                                } catch (e) { alert("Error al crear la nueva versión."); }
                                finally { setIsSaving(false); }
                            }
                        }}
                        className="p-1.5 text-emerald-600 hover:bg-white hover:shadow-sm rounded transition-all flex items-center gap-1 font-bold text-[10px] uppercase"
                        title="Crear nueva versión de este producto"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Nueva
                    </button>

                    <div className="w-px h-4 bg-indigo-200 mx-1"></div>

                    {/* ELIMINAR VERSIÓN AISLADA */}
                    <button 
                        onClick={async () => {
                            if (!version.id) return;
                            // Verificación de seguridad
                            if (window.confirm(`¿Estás seguro de eliminar ÚNICAMENTE la versión "${version.version_name}"?\n\nLa familia del producto y las demás versiones NO se borrarán.`)) {
                                try {
                                    setIsSaving(true);
                                    await designService.deleteVersion(version.id);
                                    alert("✅ Versión eliminada correctamente.");
                                    navigate("/design"); // Regresa al catálogo general
                                } catch (e) { 
                                    console.error(e);
                                    alert("Error al eliminar la versión."); 
                                }
                                finally { setIsSaving(false); }
                            }
                        }}
                        className="p-1.5 text-red-500 hover:bg-white hover:shadow-sm rounded transition-all"
                        title="Eliminar esta versión (No afecta al producto maestro)"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>

                <span className="text-slate-300 text-xl font-light">/</span>

                <div className="flex items-center gap-1.5 text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    <User size={14} className="text-slate-500" />
                    <span className="text-sm font-bold tracking-wide uppercase">{clientName}</span>
                </div>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-1">
                {version.master?.category || "General"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-50/50">
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-0 overflow-hidden">
            <VersionRecipeForm 
                materials={materials} 
                edgebandingFactor={edgebandingFactor} 
                defaultValues={componentsToRender} 
                initialStatus={version.status} 
                onSave={handleSaveAll}         
                isLoading={isSaving} 
            />
        </div>
      </div>
    </div>
  );
}