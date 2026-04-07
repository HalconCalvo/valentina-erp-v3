export interface ProductionBatch {
  id: number;
  folio: string;
  batch_type: string;
  status: string;
  estimated_merma_percent: number;
  created_at: string;
  created_by_user_id?: number;
}