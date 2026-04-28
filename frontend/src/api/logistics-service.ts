import apiClient from './axios-client';

export interface WorkdayAssignment {
  assignment_id: number;
  assignment_status: string;
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
  leader: { id: number; name: string };
  total_assignments: number;
  items: WorkdayAssignment[];
}

// Feed completo de asignaciones pendientes del líder
export const getMyWorkday = async (): Promise<WorkdayResponse> => {
  const { data } = await apiClient.get('/logistics/my-workday');
  return data;
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

// Subida de fotos de evidencia
export const uploadEvidencePhotos = async (
  instanceId: number,
  photos: File[]
): Promise<any> => {
  const formData = new FormData();
  photos.forEach((photo) => formData.append('photos', photo));
  const { data } = await apiClient.post(
    `/logistics/instances/${instanceId}/evidence`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
};

// Marcar carril como físicamente instalado (antes de la firma)
export async function markAssignmentInstalled(
    assignmentId: number
): Promise<{ ok: boolean; message: string }> {
    const response = await apiClient.put(
        `/logistics/assignments/${assignmentId}/mark-installed`
    );
    return response.data;
}

// Firma digital del cliente
export const submitClientSignature = async (
  assignmentId: number,
  signatureDataUrl: string
): Promise<any> => {
  const { data } = await apiClient.patch(
    `/logistics/equipos/${assignmentId}/firma`,
    { signature_url: signatureDataUrl }
  );
  return data;
};
