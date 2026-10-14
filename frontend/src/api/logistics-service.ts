import apiClient from './axios-client';

export interface WorkdayAssignment {
  assignment_id: number;
  assignment_status: string;
  lane: string | null;
  assignment_date: string | null;
  instance_id: number;
  instance_name: string;
  instance_status: string;
  order_folio: string;
  project_name: string;
  client_name: string;
  client_address: string;
  evidence_photos_count: number;
  has_signature: boolean;
  all_lanes_installed?: boolean;
  team: {
    leader: { id: number; name: string };
    helper_1: { id: number; name: string } | null;
    helper_2: { id: number; name: string } | null;
  };
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkdayResponse {
  workday: string;
  next_workday?: string;
  leader: { id: number; name: string };
  total_assignments: number;
  items: WorkdayAssignment[];
}

// Feed completo de asignaciones pendientes del líder
export const getMyWorkday = async (): Promise<WorkdayResponse> => {
  const { data } = await apiClient.get('/logistics/my-workday');
  return data;
};

export interface TeamAgendaInstance {
  assignment_id: number;
  instance_id: number;
  instance_name: string;
  order_folio: string | null;
  client_name: string | null;
  address: string | null;
  lane: string;
}

export interface TeamAgendaTeam {
  leader_id: number;
  leader_name: string;
  helper_1_id: number | null;
  helper_1_name: string | null;
  helper_2_id: number | null;
  helper_2_name: string | null;
  instances: TeamAgendaInstance[];
}

export interface UnassignedAgendaInstance {
  instance_id: number;
  lane: string;
  instance_name: string;
  order_folio: string | null;
  client_name: string | null;
  address: string | null;
}

export interface TeamAgendaResponse {
  workday: string;
  teams: TeamAgendaTeam[];
  unassigned: UnassignedAgendaInstance[];
}

export const getTeamAgenda = async (workday: string): Promise<TeamAgendaResponse> => {
  const { data } = await apiClient.get('/logistics/team-agenda', {
    params: { workday },
  });
  return data;
};

export const updateDayTeam = async (payload: {
  workday: string;
  previous_leader_id: number;
  leader_user_id: number;
  helper_1_user_id?: number | null;
  helper_2_user_id?: number | null;
}): Promise<{ updated_assignments: number }> => {
  const { data } = await apiClient.patch('/logistics/team-agenda/day-team', payload);
  return data;
};

export const moveAssignmentToTeam = async (
  assignmentId: number,
  payload: {
    leader_user_id: number;
    helper_1_user_id?: number | null;
    helper_2_user_id?: number | null;
  }
): Promise<void> => {
  await apiClient.patch(`/logistics/assignments/${assignmentId}/team`, payload);
};

// Escaneo QR — confirma carga al camión
export const scanBundleQR = async (
  assignmentId: number,
  bundleQrUuid: string
): Promise<any> => {
  const { data } = await apiClient.post(
    `/logistics/equipos/${assignmentId}/scan-qr`,
    { bundle_qr_uuid: bundleQrUuid }
  );
  return data;
};

export const previewBundleScan = async (
  assignmentId: number,
  bundleQrUuid: string
): Promise<any> => {
  const { data } = await apiClient.post(
    `/logistics/assignments/${assignmentId}/preview-scan`,
    { bundle_qr_uuid: bundleQrUuid }
  );
  return data;
};
