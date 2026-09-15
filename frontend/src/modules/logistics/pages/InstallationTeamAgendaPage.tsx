import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pencil, UserPlus } from 'lucide-react';
import {
  getTeamAgenda,
  moveAssignmentToTeam,
  updateDayTeam,
  type TeamAgendaTeam,
  type TeamAgendaInstance,
  type UnassignedAgendaInstance,
} from '../../../api/logistics-service';
import { planningService } from '../../../api/planning-service';
import axiosClient from '../../../api/axios-client';
import Modal from '@/components/ui/Modal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { toast } from '@/components/ui/VToast';

const AGENDA_ROLES = ['PRODUCTION', 'DESIGN', 'MANAGER', 'DIRECTOR'];

interface Installer {
  id: number;
  full_name: string;
  role: string;
}

const MONTHS_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];
const WEEKDAYS_ES = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
];

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shiftDay(iso: string, delta: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + delta);
  return toIsoDate(d);
}

function formatHeaderDate(iso: string): string {
  const d = parseIso(iso);
  const wd = WEEKDAYS_ES[d.getDay()];
  const mon = MONTHS_ES[d.getMonth()];
  return `${wd} ${d.getDate()} de ${mon}, ${d.getFullYear()}`;
}

function teamHelpersLabel(team: TeamAgendaTeam): string {
  const helpers = [team.helper_1_name, team.helper_2_name].filter(Boolean);
  if (helpers.length === 0) return team.leader_name;
  return `${team.leader_name} + ${helpers.join(' + ')}`;
}

function instanceAddressLine(row: {
  address?: string | null;
  client_name?: string | null;
}): string {
  const parts = [row.client_name, row.address].filter(Boolean);
  return parts.join(' · ') || '—';
}

export default function InstallationTeamAgendaPage() {
  const navigate = useNavigate();
  const userRole = (localStorage.getItem('user_role') || '').toUpperCase();
  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const [workday, setWorkday] = useState(todayIso);
  const [teams, setTeams] = useState<TeamAgendaTeam[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedAgendaInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [installers, setInstallers] = useState<Installer[]>([]);

  const [editTeam, setEditTeam] = useState<TeamAgendaTeam | null>(null);
  const [editLeaderId, setEditLeaderId] = useState('');
  const [editH1, setEditH1] = useState('');
  const [editH2, setEditH2] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [assignRow, setAssignRow] = useState<UnassignedAgendaInstance | null>(null);
  const [assignLeaderId, setAssignLeaderId] = useState('');
  const [assignH1, setAssignH1] = useState('');
  const [assignH2, setAssignH2] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);

  const [dragAssignmentId, setDragAssignmentId] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);

  const isToday = workday === todayIso;

  const loadAgenda = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTeamAgenda(workday);
      setTeams(data.teams);
      setUnassigned(data.unassigned);
    } catch {
      toast.error('No se pudo cargar la agenda del día.');
      setTeams([]);
      setUnassigned([]);
    } finally {
      setLoading(false);
    }
  }, [workday]);

  useEffect(() => {
    if (!AGENDA_ROLES.includes(userRole)) {
      navigate('/logistics', { replace: true });
      return;
    }
    void loadAgenda();
  }, [userRole, navigate, loadAgenda]);

  useEffect(() => {
    axiosClient
      .get('/users/', { params: { role: 'LOGISTICS' } })
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setInstallers(
          rows.filter((u: Installer) => String(u.role).toUpperCase() === 'LOGISTICS')
        );
      })
      .catch(() => setInstallers([]));
  }, []);

  const openEditTeam = (team: TeamAgendaTeam) => {
    setEditTeam(team);
    setEditLeaderId(String(team.leader_id));
    setEditH1(team.helper_1_id ? String(team.helper_1_id) : '');
    setEditH2(team.helper_2_id ? String(team.helper_2_id) : '');
  };

  const saveEditTeam = async () => {
    if (!editTeam || !editLeaderId) return;
    setEditSaving(true);
    try {
      await updateDayTeam({
        workday,
        previous_leader_id: editTeam.leader_id,
        leader_user_id: Number(editLeaderId),
        helper_1_user_id: editH1 ? Number(editH1) : null,
        helper_2_user_id: editH2 ? Number(editH2) : null,
      });
      toast.success('Equipo actualizado para el día.');
      setEditTeam(null);
      await loadAgenda();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? 'Error al actualizar el equipo.');
    } finally {
      setEditSaving(false);
    }
  };

  const saveAssign = async () => {
    if (!assignRow || !assignLeaderId) return;
    setAssignSaving(true);
    try {
      await planningService.assignTeam(assignRow.instance_id, {
        leader_user_id: Number(assignLeaderId),
        helper_1_user_id: assignH1 ? Number(assignH1) : null,
        helper_2_user_id: assignH2 ? Number(assignH2) : null,
        assignment_date: workday,
        lane: assignRow.lane as 'IM' | 'IP',
      });
      toast.success('Equipo asignado.');
      setAssignRow(null);
      await loadAgenda();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? 'Error al asignar equipo.');
    } finally {
      setAssignSaving(false);
    }
  };

  const handleDropOnTeam = async (team: TeamAgendaTeam) => {
    if (!dragAssignmentId || moving) return;
    setMoving(true);
    try {
      await moveAssignmentToTeam(dragAssignmentId, {
        leader_user_id: team.leader_id,
        helper_1_user_id: team.helper_1_id,
        helper_2_user_id: team.helper_2_id,
      });
      toast.success('Instancia movida de cuadrilla.');
      await loadAgenda();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err?.response?.data?.detail ?? 'No se pudo mover la instancia.');
    } finally {
      setDragAssignmentId(null);
      setMoving(false);
    }
  };

  const renderInstanceCard = (inst: TeamAgendaInstance) => (
    <div
      key={`${inst.assignment_id}-${inst.lane}`}
      draggable
      onDragStart={() => setDragAssignmentId(inst.assignment_id)}
      onDragEnd={() => setDragAssignmentId(null)}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:scale-[0.99] cursor-grab"
    >
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-xs font-black text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
          {inst.order_folio ?? 'Sin OV'}
        </span>
        <span className="text-[10px] font-bold uppercase text-slate-500">{inst.lane}</span>
      </div>
      <p className="font-bold text-slate-800 text-base">{inst.instance_name}</p>
      <p className="text-sm text-slate-500 mt-1">{instanceAddressLine(inst)}</p>
    </div>
  );

  const teamModalFields = (
    leaderId: string,
    setLeaderId: (v: string) => void,
    h1: string,
    setH1: (v: string) => void,
    h2: string,
    setH2: (v: string) => void
  ) => (
    <div className="space-y-4">
      <label className="block">
        <span className="text-xs font-bold text-slate-500 uppercase">Líder</span>
        <SearchableSelect
          items={installers}
          value={leaderId}
          onChange={setLeaderId}
          getLabel={(i) => i.full_name}
          getValue={(i) => String(i.id)}
          placeholder="Buscar líder..."
          className="mt-1"
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-slate-500 uppercase">Ayudante 1</span>
        <SearchableSelect
          items={installers.filter((i) => String(i.id) !== leaderId)}
          value={h1}
          onChange={setH1}
          getLabel={(i) => i.full_name}
          getValue={(i) => String(i.id)}
          placeholder="Opcional"
          className="mt-1"
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-slate-500 uppercase">Ayudante 2</span>
        <SearchableSelect
          items={installers.filter((i) => String(i.id) !== leaderId && String(i.id) !== h1)}
          value={h2}
          onChange={setH2}
          getLabel={(i) => i.full_name}
          getValue={(i) => String(i.id)}
          placeholder="Opcional"
          className="mt-1"
        />
      </label>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto pb-24 space-y-6">
      <button
        type="button"
        onClick={() => navigate('/logistics')}
        className="text-sm font-bold text-slate-600 hover:text-sky-700 py-2 px-3 rounded-lg border border-slate-200 bg-white"
      >
        ← Logística
      </button>

      <header className="space-y-4">
        <h1 className="text-2xl md:text-3xl font-black text-slate-800">
          Agenda de Instalaciones
        </h1>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Día anterior"
            onClick={() => setWorkday((d) => shiftDay(d, -1))}
            className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
          >
            <ChevronLeft size={22} />
          </button>
          <div
            className={`px-4 py-3 rounded-xl text-center min-w-[14rem] font-bold ${
              isToday
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-100 text-slate-800 border border-slate-200'
            }`}
          >
            {formatHeaderDate(workday)}
            {isToday && (
              <span className="block text-[10px] uppercase tracking-widest mt-0.5 opacity-90">
                Hoy
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="Día siguiente"
            onClick={() => setWorkday((d) => shiftDay(d, 1))}
            className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
          >
            <ChevronRight size={22} />
          </button>
          {!isToday && (
            <button
              type="button"
              onClick={() => setWorkday(todayIso)}
              className="px-4 py-3 rounded-xl font-bold text-sm bg-sky-600 text-white hover:bg-sky-700"
            >
              Ir a hoy
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <p className="text-center text-slate-400 py-16 font-medium">Cargando agenda...</p>
      ) : (
        <>
          {teams.length === 0 && unassigned.length === 0 && (
            <p className="text-center text-slate-400 py-12">Sin instalaciones programadas este día.</p>
          )}

          {teams.map((team) => (
            <section
              key={team.leader_id}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 overflow-hidden"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                void handleDropOnTeam(team);
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-4 bg-white border-b border-slate-200">
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-black text-slate-800 truncate">
                    {teamHelpersLabel(team)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {team.instances.length}{' '}
                    {team.instances.length === 1 ? 'instancia' : 'instancias'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEditTeam(team)}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm bg-white border border-slate-300 hover:bg-slate-50 w-full sm:w-auto"
                >
                  <Pencil size={16} />
                  Editar equipo
                </button>
              </div>
              <div className="p-4 flex flex-col gap-3">
                {team.instances.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">
                    Arrastra instancias aquí
                  </p>
                ) : (
                  team.instances.map(renderInstanceCard)
                )}
              </div>
            </section>
          ))}

          <section className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-4">
            <h2 className="text-lg font-black text-amber-900 mb-3">Sin asignar</h2>
            {unassigned.length === 0 ? (
              <p className="text-sm text-amber-800/70">Todas las instancias del día tienen cuadrilla.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {unassigned.map((row) => (
                  <li
                    key={`${row.instance_id}-${row.lane}`}
                    className="rounded-xl border border-amber-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-2 mb-1">
                        <span className="text-xs font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                          {row.order_folio ?? 'Sin OV'}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-slate-500">{row.lane}</span>
                      </div>
                      <p className="font-bold text-slate-800">{row.instance_name}</p>
                      <p className="text-sm text-slate-500">{instanceAddressLine(row)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAssignRow(row);
                        setAssignLeaderId('');
                        setAssignH1('');
                        setAssignH2('');
                      }}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm bg-amber-600 text-white hover:bg-amber-700 w-full sm:w-auto shrink-0"
                    >
                      <UserPlus size={18} />
                      Asignar equipo
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <Modal
        isOpen={!!editTeam}
        onClose={() => !editSaving && setEditTeam(null)}
        title="Editar equipo del día"
        size="md"
      >
        {teamModalFields(editLeaderId, setEditLeaderId, editH1, setEditH1, editH2, setEditH2)}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            disabled={editSaving}
            onClick={() => setEditTeam(null)}
            className="flex-1 py-3 rounded-xl font-bold border border-slate-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={editSaving || !editLeaderId}
            onClick={() => void saveEditTeam()}
            className="flex-1 py-3 rounded-xl font-bold bg-emerald-600 text-white disabled:opacity-50"
          >
            {editSaving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={!!assignRow}
        onClose={() => !assignSaving && setAssignRow(null)}
        title="Asignar equipo"
        size="md"
      >
        {assignRow && (
          <p className="text-sm text-slate-600 mb-4">
            {assignRow.instance_name} · {assignRow.lane} · {workday}
          </p>
        )}
        {teamModalFields(assignLeaderId, setAssignLeaderId, assignH1, setAssignH1, assignH2, setAssignH2)}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            disabled={assignSaving}
            onClick={() => setAssignRow(null)}
            className="flex-1 py-3 rounded-xl font-bold border border-slate-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={assignSaving || !assignLeaderId}
            onClick={() => void saveAssign()}
            className="flex-1 py-3 rounded-xl font-bold bg-sky-600 text-white disabled:opacity-50"
          >
            {assignSaving ? 'Asignando...' : 'Asignar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
