export interface InstanceDetail {
  id: number;
  custom_name: string;
  production_status: string;
  qr_code?: string;
  order_folio?: string | null;
  client_name?: string | null;
  project_name?: string | null;
  key_material_sku?: string | null;
  key_material_name?: string | null;
  mdf_bundles?: number | null;
  hardware_bundles?: number | null;
  stone_pieces?: number | null;
  declared_bundles?: number | null;
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
