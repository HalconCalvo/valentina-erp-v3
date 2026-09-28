import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { designService } from '../../../api/design-service';
import type { ProductMaster } from '../../../types/design';
import { useClients } from '../../foundations/hooks/useClients';
import { Input } from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { VEmptyState } from '@/components/ui/VEmptyState';

interface BlueprintCatalogRow {
  master_id: number;
  master_name: string;
  category: string;
  project_name: string;
  version_id: number;
  version_name: string;
  blueprint_path: string;
}

interface ProjectBlueprintGroup {
  projectName: string;
  items: BlueprintCatalogRow[];
}

interface ClientBlueprintGroup {
  clientId: number;
  clientName: string;
  projects: ProjectBlueprintGroup[];
  itemCount: number;
}

const PROJECT_FALLBACK = 'Sin proyecto';

function normalizeProjectName(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  return trimmed || PROJECT_FALLBACK;
}

export default function ProductionBlueprintsPage() {
  const navigate = useNavigate();
  const { clients, fetchClients } = useClients();
  const [masters, setMasters] = useState<ProductMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchClients();
    designService
      .getMasters()
      .then((res) => {
        const list: ProductMaster[] = Array.isArray(res)
          ? res
          : ((res as { data?: ProductMaster[] }).data ?? []);
        setMasters(list);
      })
      .catch(() => setMasters([]))
      .finally(() => setLoading(false));
  }, [fetchClients]);

  const getClientName = (clientId: number) =>
    clients.find((c) => c.id === clientId)?.full_name ?? 'Stock Interno';

  const clientGroups = useMemo((): ClientBlueprintGroup[] => {
    const q = search.trim().toLowerCase();
    const byClient = new Map<number, Map<string, BlueprintCatalogRow[]>>();

    for (const master of masters) {
      const clientId = master.client_id ?? 0;
      const projectName = normalizeProjectName(master.project_name);

      for (const v of master.versions ?? []) {
        if (!v.blueprint_path || v.id == null || master.id == null) continue;

        const row: BlueprintCatalogRow = {
          master_id: master.id,
          master_name: master.name,
          category: master.category || 'General',
          project_name: projectName,
          version_id: v.id,
          version_name: v.version_name,
          blueprint_path: v.blueprint_path,
        };

        if (q) {
          const haystack = [
            row.master_name,
            row.category,
            row.version_name,
            row.project_name,
            getClientName(clientId),
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) continue;
        }

        if (!byClient.has(clientId)) {
          byClient.set(clientId, new Map());
        }
        const byProject = byClient.get(clientId)!;
        const list = byProject.get(projectName) ?? [];
        list.push(row);
        byProject.set(projectName, list);
      }
    }

    const groups: ClientBlueprintGroup[] = [];
    for (const [clientId, byProject] of byClient.entries()) {
      const projects: ProjectBlueprintGroup[] = [];
      let itemCount = 0;

      for (const [projectName, items] of byProject.entries()) {
        items.sort((a, b) =>
          a.master_name.localeCompare(b.master_name, 'es', { sensitivity: 'base' }),
        );
        itemCount += items.length;
        projects.push({ projectName, items });
      }

      projects.sort((a, b) =>
        a.projectName.localeCompare(b.projectName, 'es', { sensitivity: 'base' }),
      );

      groups.push({
        clientId,
        clientName: getClientName(clientId),
        projects,
        itemCount,
      });
    }

    groups.sort((a, b) =>
      a.clientName.localeCompare(b.clientName, 'es', { sensitivity: 'base' }),
    );

    return groups;
  }, [masters, clients, search]);

  const toggleClient = (clientId: number) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const totalBlueprints = useMemo(
    () => clientGroups.reduce((acc, g) => acc + g.itemCount, 0),
    [clientGroups],
  );

  return (
    <div className="p-8 max-w-5xl mx-auto pb-24">
      <div className="flex justify-end mb-6">
        <button
          type="button"
          onClick={() => navigate('/production')}
          className="flex items-center gap-2 bg-white border
                     border-slate-300 text-slate-700 px-4 py-2
                     rounded-lg font-bold hover:bg-slate-50
                     hover:text-indigo-600 transition-all shadow-sm"
        >
          ← Regresar
        </button>
      </div>
      <div className="mb-6 pb-4 border-b border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Layers className="text-indigo-500" size={28} />
          Planos de Productos
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Planos por cliente — solo versiones con archivo cargado.
        </p>
      </div>

      <div className="mb-6">
        <Input
          type="text"
          placeholder="Buscar producto, versión, categoría o cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-xl py-2.5 shadow-sm"
        />
      </div>

      {loading ? (
        <p className="text-slate-400 text-center py-12">Cargando...</p>
      ) : totalBlueprints === 0 ? (
        <VEmptyState
          title="No hay planos disponibles"
          description="Ningún producto tiene plano técnico cargado en el catálogo de ingeniería."
        />
      ) : (
        <div className="space-y-6">
          {clientGroups.map((group) => {
            const isExpanded = expandedClients.has(group.clientId);
            return (
              <div
                key={group.clientId}
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleClient(group.clientId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleClient(group.clientId);
                    }
                  }}
                  className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <h3 className="font-bold text-slate-700 flex items-center gap-2 text-lg">
                    {isExpanded ? (
                      <ChevronDown size={20} className="text-slate-500" />
                    ) : (
                      <ChevronRight size={20} className="text-slate-500" />
                    )}
                    {group.clientName}
                  </h3>
                  <Badge
                    variant="default"
                    className="bg-slate-200 text-slate-700 hover:bg-slate-300"
                  >
                    {group.itemCount}{' '}
                    {group.itemCount === 1 ? 'Plano' : 'Planos'}
                  </Badge>
                </div>

                {isExpanded && (
                  <div>
                    {group.projects.map((project) => (
                      <div
                        key={`${group.clientId}-${project.projectName}`}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <div
                          className="flex items-center justify-between px-6 py-3
                                     bg-slate-50 border-b border-slate-200"
                        >
                          <span
                            className="text-xs font-black text-slate-600 uppercase
                                       tracking-wide"
                          >
                            {project.projectName}
                          </span>
                          <span
                            className="text-[10px] font-bold text-slate-400
                                       bg-slate-200 px-2 py-0.5 rounded-full"
                          >
                            {project.items.length}{' '}
                            {project.items.length === 1 ? 'plano' : 'planos'}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {project.items.map((item) => (
                            <div
                              key={`${item.master_id}-${item.version_id}`}
                              className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 truncate">
                                  {item.master_name}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="text-xs text-slate-500">
                                    {item.category}
                                  </span>
                                  <span
                                    className="text-[10px] font-bold text-indigo-600
                                               bg-indigo-50 border border-indigo-100
                                               px-1.5 py-0.5 rounded"
                                  >
                                    {item.version_name}
                                  </span>
                                </div>
                              </div>
                              <a
                                href={item.blueprint_path}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-4 py-2
                                           rounded-xl text-sm font-bold text-indigo-600
                                           border border-indigo-200 bg-indigo-50
                                           hover:bg-indigo-100 transition shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                📐 Ver / Descargar
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
