import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { ClipboardList, Users, Truck } from 'lucide-react';

const AGENDA_ROLES = ['PRODUCTION', 'DESIGN', 'MANAGER', 'DIRECTOR'];

export default function LogisticsDashboardPage() {
  const navigate = useNavigate();
  const userRole = (localStorage.getItem('user_role') || '').toUpperCase();
  const canTeamAgenda = AGENDA_ROLES.includes(userRole);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 pb-24 animate-in fade-in duration-300">
      <div className="flex justify-between items-center pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <Truck size={28} className="text-sky-600" />
            Logística e Instalación
          </h1>
          <p className="text-slate-500 mt-1">
            Coordinación de jornadas y cuadrillas en campo.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 max-w-3xl">
        <div className="w-full relative h-44">
          <Card
            onClick={() => navigate('/logistics/by-instance')}
            className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-sky-600 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group"
          >
            <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-sky-50 text-sky-700 border-r border-sky-100 transition-colors group-hover:bg-sky-100">
              <ClipboardList size={28} />
            </div>
            <div className="ml-16 h-full flex flex-col justify-between pl-2">
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                Vista operativa
              </p>
              <div>
                <h3 className="text-lg font-bold text-slate-800 leading-tight">
                  Instalaciones por Instancia
                </h3>
                <p className="text-sm text-slate-500 mt-1">Vista detallada por instancia</p>
              </div>
            </div>
          </Card>
        </div>

        {canTeamAgenda && (
          <div className="w-full relative h-44">
            <Card
              onClick={() => navigate('/logistics/by-team')}
              className="p-5 cursor-pointer hover:shadow-xl transition-all border-l-4 border-l-emerald-500 transform hover:-translate-y-1 h-full flex flex-col justify-between bg-white overflow-hidden group"
            >
              <div className="absolute top-0 left-0 bottom-0 w-16 flex items-center justify-center bg-emerald-50 text-emerald-700 border-r border-emerald-100 transition-colors group-hover:bg-emerald-100">
                <Users size={28} />
              </div>
              <div className="ml-16 h-full flex flex-col justify-between pl-2">
                <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                  Planeación diaria
                </p>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 leading-tight">
                    Instalaciones por Equipos
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">Agenda diaria por cuadrilla</p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
