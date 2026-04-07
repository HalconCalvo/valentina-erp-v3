export interface InstanceDetail {
  id: number;
  custom_name: string;
  production_status: string;
  qr_code?: string;
}

export interface ProductionBatch {
  id: number;
  folio: string;
  batch_type: string;
  status: string;
  estimated_merma_percent: number;
  is_payment_cleared: boolean;
  instances: InstanceDetail[];
  created_at?: string;
}
