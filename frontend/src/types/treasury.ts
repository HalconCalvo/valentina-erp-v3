export enum TransactionType {
  IN = 'IN',
  OUT = 'OUT',
  TRANSFER = 'TRANSFER',
}

export interface BankAccount {
  id: number;
  name: string;
  account_number: string;
  currency: string;
  initial_balance: number;
  current_balance: number;
  is_active: boolean;
}

export interface BankAccountCreate {
  name: string;
  account_number: string;
  currency?: string;
  initial_balance?: number;
}

export interface BankTransactionCreate {
  account_id: number;
  transaction_type: TransactionType;
  amount: number;
  reference?: string;
  description?: string;
  related_entity_type?: string;
  related_entity_id?: number;
}

export interface TransferCreate {
  from_account_id: number;
  to_account_id: number;
  amount: number;
  reference?: string;
  description?: string;
}