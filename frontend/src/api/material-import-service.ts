import axiosClient from './axios-client';

export type MaterialFieldChange = { field: string; label: string; old: string | null; new: string | null };
export type MaterialChangeRow = { row: number; sku: string; name: string; changes: MaterialFieldChange[] };
export type MaterialImportIssue = { row: number; sku: string | null; message: string };
export type MaterialImportPreview = { rows: MaterialChangeRow[]; errors: MaterialImportIssue[]; unchanged: number };

const upload = (file: File, reason?: string) => {
  const formData = new FormData();
  formData.append('file', file);
  if (reason !== undefined) formData.append('reason', reason);
  return formData;
};

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

/** Sanitation tool 4: bulk update of the material catalog (template → validate → apply with a reason). */
export const materialImportService = {
  downloadTemplate: async (): Promise<Blob> =>
    (await axiosClient.get('/material-import/template', { responseType: 'blob' })).data,

  validate: async (file: File): Promise<MaterialImportPreview> =>
    (await axiosClient.post('/material-import/validate', upload(file), multipart)).data,

  apply: async (file: File, reason: string): Promise<{ updated: number }> =>
    (await axiosClient.post('/material-import/apply', upload(file, reason), multipart)).data,
};
