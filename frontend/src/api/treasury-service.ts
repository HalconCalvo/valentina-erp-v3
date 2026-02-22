import client from './axios-client';
import {
  BankAccount,
  BankAccountCreate,
  BankTransactionCreate,
  TransferCreate,
} from '../types/treasury';

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
  }
};