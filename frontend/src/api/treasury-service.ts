import client from './axios-client';
import {
  BankAccount,
  BankAccountCreate,
  BankTransactionCreate,
  TransferCreate,
  WeeklyFixedCostPayload,
  WeeklyFixedCostRecord,
} from '../types/treasury';

export interface PayrollPaymentRecord {
  id: number;
  installation_assignment_id: number;
  user_id: number;
  user_name: string | null;
  payment_type: string;
  days_worked: number;
  daily_rate: number;
  total_amount: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  instance_name: string | null;
  admin_notes?: string | null;
  days_waiting?: number;
  bank_account_id?: number | null;
}

export interface InstallerPayrollOverview {
  retained_total: number;
  payable_total: number;
  paid_total: number;
  deferred_total: number;
  retained: PayrollPaymentRecord[];
  payable: PayrollPaymentRecord[];
  paid: PayrollPaymentRecord[];
  deferred: PayrollPaymentRecord[];
}

export const treasuryService = {
  // 1. Obtener todas las cuentas
  getAccounts: async (): Promise<BankAccount[]> => {
    const response = await client.get('/treasury/accounts');
    return response.data;
  },

  // 2. Crear una cuenta nueva
  createAccount: async (data: BankAccountCreate): Promise<BankAccount> => {
    const response = await client.post('/treasury/accounts', data);
    return response.data;
  },

  // 3. Registrar un ingreso o egreso manual
  createTransaction: async (data: BankTransactionCreate) => {
    const response = await client.post('/treasury/transactions', data);
    return response.data;
  },

  // 4. Transferir entre cuentas
  transferFunds: async (data: TransferCreate) => {
    const response = await client.post('/treasury/transfer', data);
    return response.data;
  }, // <--- ¡Esta es la coma que nos faltaba!

  // 5. Obtener historial de una cuenta
  getAccountTransactions: async (accountId: number) => {
    const response = await client.get(`/treasury/accounts/${accountId}/transactions`);
    return response.data;
  },

  // 6. Nómina de instaladores (destajos)
  getPayroll: async (payrollStatus?: string): Promise<PayrollPaymentRecord[]> => {
    const params: Record<string, string> = {};
    if (payrollStatus) params.payroll_status = payrollStatus;
    const response = await client.get('/logistics/payroll/', { params });
    return response.data;
  },

  // 7. Marcar un destajo como PAGADO (o revertir a READY_TO_PAY)
  markPayrollPaid: async (
    payrollId: number,
    paid: boolean,
    bankAccountId?: number
  ): Promise<void> => {
    await client.patch(`/logistics/payroll/${payrollId}/mark-paid`, {
      paid,
      bank_account_id: bankAccountId,
    });
  },

  deferInstallerPayroll: async (payrollId: number, reason: string): Promise<void> => {
    await client.patch(`/logistics/payroll/${payrollId}/defer`, { reason });
  },

  getInstallerPayrollOverview: async (): Promise<InstallerPayrollOverview> => {
    const response = await client.get('/logistics/payroll/overview');
    return response.data;
  },

  saveWeeklyFixedCosts: async (payload: WeeklyFixedCostPayload): Promise<WeeklyFixedCostRecord> => {
    const response = await client.post('/treasury/weekly-fixed-costs', payload);
    return response.data;
  },

  getLatestWeeklyFixedCosts: async (): Promise<WeeklyFixedCostRecord | null> => {
    const response = await client.get('/treasury/weekly-fixed-costs/latest');
    return response.data ?? null;
  },
};