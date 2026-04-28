export type MovementType = 'EGRESO' | 'REPOSICION';

export type PettyCashCategory =
  | 'PLANTA'
  | 'COMUNICACIONES'
  | 'COMBUSTIBLES'
  | 'TRANSPORTE'
  | 'INSUMOS'
  | 'MAQUINARIA'
  | 'EXTERNOS'
  | 'MAQUILA'
  | 'OTRO';

export interface PettyCashFund {
  id: number;
  fund_amount: number;
  minimum_balance: number;
  current_balance: number;
  updated_at: string;
  updated_by_id: number | null;
}

export interface PettyCashMovement {
  id: number;
  movement_type: MovementType;
  amount: number;
  concept: string;
  category: PettyCashCategory | null;
  receipt_url: string | null;
  movement_date: string;
  created_by_id: number;
  created_by_name: string | null;
  notes: string | null;
}

export interface PettyCashMovementCreate {
  movement_type: MovementType;
  amount: number;
  concept: string;
  category?: PettyCashCategory;
  notes?: string;
  movement_date?: string;
}

export interface PettyCashMovementUpdate {
  amount?: number;
  concept?: string;
  category?: PettyCashCategory;
  notes?: string;
  movement_date?: string;
}
