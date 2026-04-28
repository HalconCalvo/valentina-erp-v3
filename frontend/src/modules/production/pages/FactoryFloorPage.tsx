import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { productionService } from '../../../api/production-service';
import { Factory, Boxes, CheckCircle2, FileText } from 'lucide-react';

const PRODUCTION_FULL_ACCESS = ['DIRECTOR', 'PRODUCTION'];
const PRODUCTION_READ_ONLY = ['ADMIN', 'DESIGN', 'GERENCIA'];
const PRODUCTION_NO_ACCESS = ['SALES', 'WAREHOUSE', 'LOGISTICS'];

export default function FactoryFloorPage() {
  const navigate = useNavigate();
  const userRole = (localStorage.getItem('user_role') || '').toUpperCase();
  const productionReadOnly = PRODUCTION_READ_ONLY.includes(userRole);
  const productionNoAccess = PRODUCTION_NO_ACCESS.includes(userRole);
  const [draftCount, setDraftCount] = useState(0);
  const [inProductionCount, setInProductionCount] = useState(0);
  const [readyCount, setReadyCount] = useState(0);

  useEffect(() => {
    productionService.getBatches().then(batches => {
      setDraftCount(
        batches.filter(b =>
          ['DRAFT', 'ON_HOLD'].includes(b.status)
        ).length
      );
      setInProductionCount(
        batches.filter(b => b.status === 'IN_PRODUCTION')
          .reduce((n, b) => n + (b.instances?.length ?? 0), 0)
      );
      setReadyCount(
        batches.filter(b => b.status === 'READY_TO_INSTALL')
          .reduce((n, b) => n + (b.instances?.length ?? 0), 0)
      );
    }).catch(() => {});
  }, []);

  if (productionNoAccess) {
    return (
      <div className="flex flex-col items-center justify-center 
                      h-full text-slate-400 gap-3 p-8">
        <span className="text-5xl">🔒</span>
        <p className="text-lg font-bold text-slate-600">
          Acceso Restringido
        </p>
        <p className="text-sm">
          No tienes permisos para ver el módulo de Producción.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 pb-24 
                    animate-in fade-in duration-300">
      <div className="flex justify-between items-center pb-4 
                      border-b border-slate-200">
        <div>
          <div className="flex items-center">
            <h1 className="text-3xl font-black text-slate-800">
              Producción
            </h1>
            {productionReadOnly && (
              <span className="text-xs font-bold px-2 py-1 rounded-lg
                               bg-slate-100 text-slate-500 border 
                               border-slate-200 ml-2">
                👁 Solo Lectura
              </span>
            )}
          </div>
          <p className="text-slate-500 mt-1">
            Control de fábrica, lotes e instalación.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">

        {/* Tarjeta 1: Piso de Producción */}
        <div className="w-full relative h-40">
          <Card
            onClick={() => navigate('/production/kanban')}
            className="p-5 cursor-pointer hover:shadow-xl transition-all
                       border-l-4 border-l-slate-700 transform
                       hover:-translate-y-1 h-full flex flex-col
                       justify-between bg-white overflow-hidden group"
          >
            <div className="absolute top-0 left-0 bottom-0 w-16
                            flex items-center justify-center bg-slate-100
                            text-slate-700 border-r border-slate-200
                            font-black transition-colors
                            group-hover:bg-slate-200 text-2xl">
              {draftCount}
            </div>
            <div className="ml-16 h-full flex flex-col 
                            justify-between pl-2">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-black text-slate-500
                              uppercase tracking-widest">
                  Módulo 1
                </p>
                <Factory size={16} className="text-slate-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-700
                               leading-tight">
                  Piso de<br/>Producción
                </h3>
              </div>
              <div className="flex items-center justify-between
                              pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold
                              uppercase truncate">
                  Lotes en espera
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tarjeta 2: Instancias en Proceso */}
        <div className="w-full relative h-40">
          <Card
            onClick={() => navigate('/production/in-process')}
            className="p-5 cursor-pointer hover:shadow-xl transition-all
                       border-l-4 border-l-blue-500 transform
                       hover:-translate-y-1 h-full flex flex-col
                       justify-between bg-white overflow-hidden group"
          >
            <div className="absolute top-0 left-0 bottom-0 w-16
                            flex items-center justify-center bg-blue-50
                            text-blue-700 border-r border-blue-100
                            font-black transition-colors
                            group-hover:bg-blue-100 text-2xl">
              {inProductionCount}
            </div>
            <div className="ml-16 h-full flex flex-col 
                            justify-between pl-2">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-black text-slate-500
                              uppercase tracking-widest">
                  Módulo 2
                </p>
                <Boxes size={16} className="text-blue-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-700
                               leading-tight">
                  Instancias<br/>en Proceso
                </h3>
              </div>
              <div className="flex items-center justify-between
                              pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold
                              uppercase truncate">
                  En fabricación ahora
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tarjeta 3: Listas para Instalarse */}
        <div className="w-full relative h-40">
          <Card
            onClick={() => navigate('/production/ready')}
            className="p-5 cursor-pointer hover:shadow-xl transition-all
                       border-l-4 border-l-emerald-500 transform
                       hover:-translate-y-1 h-full flex flex-col
                       justify-between bg-white overflow-hidden group"
          >
            <div className="absolute top-0 left-0 bottom-0 w-16
                            flex items-center justify-center bg-emerald-50
                            text-emerald-700 border-r border-emerald-100
                            font-black transition-colors
                            group-hover:bg-emerald-100 text-2xl">
              {readyCount}
            </div>
            <div className="ml-16 h-full flex flex-col 
                            justify-between pl-2">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-black text-slate-500
                              uppercase tracking-widest">
                  Módulo 3
                </p>
                <CheckCircle2 size={16} className="text-emerald-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-700
                               leading-tight">
                  Listas para<br/>Instalarse
                </h3>
              </div>
              <div className="flex items-center justify-between
                              pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold
                              uppercase truncate">
                  Andén de despacho
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tarjeta 4: Planos de Productos */}
        <div className="w-full relative h-40">
          <Card
            onClick={() => navigate('/production/blueprints')}
            className="p-5 cursor-pointer hover:shadow-xl transition-all
                       border-l-4 border-l-indigo-500 transform
                       hover:-translate-y-1 h-full flex flex-col
                       justify-between bg-white overflow-hidden group"
          >
            <div className="absolute top-0 left-0 bottom-0 w-16
                            flex items-center justify-center bg-indigo-50
                            text-indigo-400 border-r border-indigo-100
                            font-black transition-colors
                            group-hover:bg-indigo-100 text-lg">
              📐
            </div>
            <div className="ml-16 h-full flex flex-col 
                            justify-between pl-2">
              <div className="flex justify-between items-start">
                <p className="text-[11px] font-black text-slate-500
                              uppercase tracking-widest">
                  Módulo 4
                </p>
                <FileText size={16} className="text-indigo-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-700
                               leading-tight">
                  Planos de<br/>Productos
                </h3>
              </div>
              <div className="flex items-center justify-between
                              pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold
                              uppercase truncate">
                  Catálogo técnico
                </p>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
