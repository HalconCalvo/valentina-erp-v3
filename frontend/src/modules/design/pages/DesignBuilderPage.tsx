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

// --- CONSERVAMOS TU PLANTILLA GENÉRICA ---
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

        // --- TU LÓGICA DE PLANTILLA (CONSERVADA) ---
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
            // Si ya tiene datos, hidratamos categorías según plantilla
            const hydratedComponents = versionData.components.map(comp => {
                const mat = allMaterials.find(m => m.id === comp.material_id);
                const templateMatch = GENERIC_TEMPLATE.find(t => t.sku.toUpperCase() === mat?.sku.toUpperCase());
                return {
                    ...comp,
                    temp_category: templateMatch ? templateMatch.section : "Agregados Manualmente",
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

  // --- NUEVA LÓGICA DE GUARDADO (Corregida para Estatus Listo) ---
  const handleSaveAll = async (componentsFromForm: VersionComponent[], newStatus: VersionStatus) => {
    if (!version?.id || !version.master?.id) return;
    try {
      setIsSaving(true);
      
      // 1. Guardamos la Receta pero forzamos estatus BORRADOR temporalmente
      // (Esto evita que el backend bloquee la edición de materiales)
      const cleanComponents = componentsFromForm.filter(item => item.quantity > 0);
      
      await designService.updateVersion(version.id, {
          ...version,
          status: VersionStatus.DRAFT, 
          components: cleanComponents
      });

      // 2. Si el usuario eligió LISTO u OBSOLETO, aplicamos el cambio ahora
      if (newStatus !== VersionStatus.DRAFT) {
          // Pequeña pausa para asegurar sincronía
          await new Promise(r => setTimeout(r, 200));
          
          await designService.updateVersion(version.id, {
            master_id: version.master.id,
            version_name: version.version_name,
            status: newStatus, // <--- Aquí se aplica el candado
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
      
      {/* HEADER LIMPIO (Sin el botón azul) */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex justify-between items-start shadow-sm shrink-0 z-40">
        <div className="flex items-start gap-4 w-full">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mt-1 text-slate-400 hover:text-slate-700">
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex-1">
             <div className="flex items-center gap-3 group flex-wrap">
                {/* Nombre del Producto */}
                <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none truncate max-w-md" title={productName}>
                    {productName || "Sin Nombre"}
                </h1>

                <span className="text-slate-300 text-xl font-light">/</span>

                {/* Nombre del Cliente */}
                <div className="flex items-center gap-1.5 text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    <User size={14} className="text-indigo-500" />
                    <span className="text-sm font-bold tracking-wide uppercase">{clientName}</span>
                </div>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-1">
                {version.master?.category || "General"}
            </p>
          </div>
        </div>

        {/* AQUÍ ELIMINÉ EL DIV QUE CONTENÍA EL BOTÓN AZUL Y EL BADGE DE ESTATUS ANTIGUO */}
        {/* El estatus y el botón de guardar ahora viven DENTRO del formulario VersionRecipeForm */}
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-50/50">
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-0 overflow-hidden">
            <VersionRecipeForm 
                materials={materials} 
                edgebandingFactor={edgebandingFactor} 
                defaultValues={componentsToRender} 
                initialStatus={version.status} // <--- Pasamos el estatus inicial
                onSave={handleSaveAll}         // <--- Pasamos la función corregida
                isLoading={isSaving} 
            />
        </div>
      </div>
    </div>
  );
}