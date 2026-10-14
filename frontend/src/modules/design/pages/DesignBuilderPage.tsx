import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { VConfirmDialog } from "@/components/ui/VConfirmDialog";
import { toast } from "@/components/ui/VToast";
import { VersionRecipeForm } from "../components/VersionRecipeForm"; 
import { RecordHistoryButton } from "@/components/audit/RecordHistoryButton";
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
    { sku: "0303-095", default_qty: 0, section: "Gabinetes" },
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
  const [showDeleteVersionConfirm, setShowDeleteVersionConfirm] = useState(false);
  // Name dialog for renaming the version or naming its clone (replaces window.prompt)
  const [nameDialog, setNameDialog] = useState<{ mode: 'RENAME' | 'CLONE'; value: string } | null>(null);
  const [commercialDescription, setCommercialDescription] = useState<string>(
    version?.commercial_description || ''
  );

  useEffect(() => {
    setCommercialDescription(version?.commercial_description || '');
  }, [version?.commercial_description]);

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
                    } else if (
                        matCat.includes("TABLERO") || 
                        matCat.includes("MDF") || 
                        matCat.includes("HERRAJE") || 
                        matCat.includes("HERRAJES") || 
                        matCat.includes("CHAPACINTA") || 
                        matCat.includes("CUBRECANTO") || 
                        matCat.includes("MADERA") || 
                        matCat.includes("BISAGRA") || 
                        matCat.includes("ACCESORIO") || 
                        matCat.includes("VIDRIO") || 
                        matCat.includes("ELECTRICIDAD") || 
                        matCat.includes("ESPECIAL") || 
                        matName.includes("BISAGRA") || 
                        matName.includes("CORREDERA") ||
                        matName.includes("TAPACANTO") ||
                        matName.includes("CHAPACINTA")
                    ) {
                        sectionName = "Gabinetes";
                    } else if (matCat.includes("PROCESO")) {
                        const matSku = (mat.sku || "").toUpperCase();
                        if (['INSTALAGRANITO', 'MAQGRANITO', 'EMPAQPIEDRA'].includes(matSku)) {
                            sectionName = "Piedra";
                        } else {
                            sectionName = "Gabinetes";
                        }
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

      } catch {
        toast.error('Error al cargar los datos de la versión.');
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
      
      // One save with the chosen status (a used recipe cannot go back to draft; the backend answers 409)
      await designService.updateVersion(version.id, {
        master_id: version.master.id,
        version_name: version.version_name,
        status: newStatus,
        components: cleanComponents,
        commercial_description: commercialDescription,
      });

      toast.success('Guardado correctamente.');
      window.location.reload(); 

    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error al guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  const executeDeleteVersion = async () => {
    if (!version?.id) return;
    try {
      setIsSaving(true);
      await designService.deleteVersion(version.id);
      toast.success('Versión eliminada correctamente.');
      navigate("/design");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error al eliminar la versión.');
    } finally {
      setIsSaving(false);
    }
  };

  const renameVersion = async (name: string) => {
    if (!version) return;
    try {
      setIsSaving(true);
      await designService.renameVersion(version.id!, name);
      setVersion({ ...version, version_name: name });
      setNameDialog(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error al renombrar la versión.');
    } finally { setIsSaving(false); }
  };

  const cloneVersion = async (name: string) => {
    const masterId = version?.master?.id;
    if (!version || !masterId) return;
    try {
      setIsSaving(true);
      const payload: any = {
        master_id: masterId,
        version_name: name,
        status: VersionStatus.DRAFT,
        components: [],
        // Clone the version being viewed (not the oldest of the product)
        clone_from_version_id: version.id,
      };
      const response = await designService.createVersion(payload);
      const newVersionId = response?.id || response?.data?.id;
      setNameDialog(null);
      if (newVersionId) {
        // Router navigation for a smooth transition instead of a page reload
        navigate(`/design/versions/${newVersionId}`);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Error al crear la nueva versión.');
    } finally { setIsSaving(false); }
  };

  const submitNameDialog = () => {
    const name = nameDialog?.value.trim() || '';
    if (!nameDialog || name === '') return;
    if (nameDialog.mode === 'RENAME') renameVersion(name);
    else cloneVersion(name);
  };

  if (isLoading) return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-12 bg-slate-200 rounded-lg" />
      <div className="max-w-6xl mx-auto h-96 bg-slate-100 rounded-xl" />
    </div>
  );
  if (!version) return <div className="p-10 text-red-500">Versión no encontrada</div>;

  const clientObj = clients.find(c => c.id === version.master?.client_id);
  const clientName = (clientObj as any)?.full_name || (clientObj as any)?.name || "Producto Interno";

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      
      {/* HEADER LIMPIO (Con botonera de Versiones) */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex justify-between items-center shadow-sm shrink-0 z-40">
        <div className="flex items-center gap-4 w-full">
          <Button variant="ghost" size="sm" onClick={() => navigate("/design", { state: { returnTo: 'CATALOG' } })} className="text-slate-400 hover:text-slate-700 shrink-0" title="Regresar">
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
                    {version.id != null && (
                        <span className="font-mono text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded px-1.5 py-0.5" title="Número de receta">
                            #{version.id}
                        </span>
                    )}
                    <RecordHistoryButton tableName="design_product_versions" recordId={version.id} label={`Versión ${version.version_name || version.id}`} />
                    
                    {/* RENOMBRAR */}
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={isSaving}
                        onClick={() => setNameDialog({ mode: 'RENAME', value: version.version_name || '' })}
                        className="text-indigo-500 hover:bg-white hover:shadow-sm"
                        title="Renombrar esta versión"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                    </Button>
                    
                    <div className="w-px h-4 bg-indigo-200 mx-1"></div>

                    {/* CLONAR (CORREGIDO) */}
                    <Button
                        variant="ghost"
                        size="xs"
                        disabled={isSaving}
                        onClick={() => {
                            if (!version || !version.master?.id) return;
                            setNameDialog({ mode: 'CLONE', value: 'V2.0' });
                        }}
                        className="text-emerald-600 hover:bg-white hover:shadow-sm font-bold text-[10px] uppercase"
                        title="Crear nueva versión de este producto"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Nueva
                    </Button>

                    <div className="w-px h-4 bg-indigo-200 mx-1"></div>

                    {/* ELIMINAR VERSIÓN AISLADA */}
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => {
                            if (!version.id) return;
                            setShowDeleteVersionConfirm(true);
                        }}
                        className="text-red-500 hover:bg-white hover:shadow-sm"
                        title="Eliminar esta versión (No afecta al producto maestro)"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </Button>
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
        {version?.alerts && version.alerts.length > 0 && (
          <div className="max-w-6xl mx-auto mb-4 bg-amber-50 border border-amber-300 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <span className="text-amber-600 text-lg">⚠️</span>
              <div>
                <p className="font-semibold text-amber-800">
                  Esta receta requiere actualizar algunos materiales antes de producir.
                </p>
                <ul className="mt-1 text-sm text-amber-700 list-disc list-inside">
                  {version.alerts.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}
        {(version?.is_locked || version?.replaces_version_id || version?.status === VersionStatus.OBSOLETE) && (
          <div className="max-w-6xl mx-auto mb-4 bg-sky-50 border border-sky-300 rounded-lg p-4 text-sm text-sky-900 space-y-1">
            {version?.is_locked && (
              <p className="font-semibold">Receta en uso (OV o cotización en revisión, autorizada o convertida): sus materiales no se pueden cambiar. Usa “Nueva versión” para clonarla.</p>
            )}
            {version?.status === VersionStatus.OBSOLETE && <p>Versión obsoleta: ya existe una receta corregida que la reemplaza.</p>}
            {version?.replaces_version_id && (
              <p>Corrección de la versión #{version.replaces_version_id}{version.correction_note ? `: ${version.correction_note}` : ''}{version.corrected_in_quotation_id ? ` (COT-${String(version.corrected_in_quotation_id).padStart(4, '0')})` : ''}.</p>
            )}
          </div>
        )}
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-0">
            <VersionRecipeForm 
                materials={materials} 
                edgebandingFactor={edgebandingFactor} 
                defaultValues={componentsToRender} 
                initialStatus={version.status} 
                onSave={handleSaveAll}         
                isLoading={isSaving}
                commercialDescription={commercialDescription}
                onDescriptionChange={(val) => setCommercialDescription(val)}
            />
        </div>
      </div>

      <VConfirmDialog
        isOpen={showDeleteVersionConfirm}
        title="Eliminar versión"
        message={`¿Eliminar únicamente la versión "${version.version_name}"?`}
        consequence="La familia del producto y las demás versiones NO se borrarán."
        variant="danger"
        confirmLabel="Sí, eliminar versión"
        onConfirm={async () => {
          await executeDeleteVersion();
          setShowDeleteVersionConfirm(false);
        }}
        onCancel={() => setShowDeleteVersionConfirm(false)}
      />

      <Modal
        isOpen={nameDialog !== null}
        onClose={() => { if (!isSaving) setNameDialog(null); }}
        title={nameDialog?.mode === 'CLONE' ? 'Nueva versión' : 'Renombrar versión'}
        size="sm"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); submitNameDialog(); }}
        >
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
            {nameDialog?.mode === 'CLONE' ? 'Nombre para la NUEVA versión' : 'Nuevo nombre para esta versión'}
          </label>
          <Input
            autoFocus
            value={nameDialog?.value ?? ''}
            onChange={(e) => setNameDialog((d) => (d ? { ...d, value: e.target.value } : d))}
          />
          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" disabled={isSaving} onClick={() => setNameDialog(null)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !(nameDialog?.value.trim())}
              className={nameDialog?.mode === 'CLONE' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}