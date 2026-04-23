export interface KeyMaterial {
  sku: string;
  name: string;
  quantity: number;
  usage_unit: string;
}

export interface InstanceDetail {
  id: number;
  custom_name: string;
  production_status: string;
  qr_code?: string;
  order_folio?: string | null;
  client_name?: string | null;
  project_name?: string | null;
  key_materials?: KeyMaterial[];
  mdf_bundles?: number | null;
  hardware_bundles?: number | null;
  stone_pieces?: number | null;
  declared_bundles?: number | null;
  semaphore?: string | null;
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
