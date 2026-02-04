import { useState, useEffect, useCallback } from 'react';
// Corregimos el nombre del archivo si tenias un typo (axios-client vs axios-clinet)
import client from '../api/axios-client';

export interface User {
    id: number;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
    commission_rate?: number;
}

export function useUsers() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // GET: Obtener lista
    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            // FIX: Ruta correcta es '/users/' (Sin /auth)
            const res = await client.get<User[]>('/users/');
            setUsers(res.data);
            setError(null);
        } catch (err: any) {
            console.error(err);
            // Evitamos mostrar error si es solo que está vacío al inicio
            setError('Error al cargar usuarios.');
        } finally {
            setLoading(false);
        }
    }, []);

    // POST: Crear
    const createUser = async (payload: any) => {
        try {
            // FIX: Ruta correcta es '/users/'
            await client.post('/users/', payload);
            await fetchUsers(); 
            return { success: true };
        } catch (err: any) {
            console.error("Error creating user:", err.response?.data);
            const msg = err.response?.data?.detail || 'Error al crear usuario';
            return { success: false, error: msg };
        }
    };

    // PUT: Actualizar
    const updateUser = async (id: number, user: any) => {
        try {
            // FIX: Ruta correcta
            await client.put(`/users/${id}`, user);
            await fetchUsers();
            return { success: true };
        } catch (err: any) {
            console.error("Error updating user:", err);
            const msg = err.response?.data?.detail || 'Error al actualizar';
            return { success: false, error: msg };
        }
    };

    // DELETE: Eliminar
    const deleteUser = async (id: number) => {
        try {
            // FIX: Ruta correcta
            await client.delete(`/users/${id}`);
            await fetchUsers();
            return { success: true };
        } catch (err: any) {
            console.error("Error deleting user:", err);
            const msg = err.response?.data?.detail || 'Error al eliminar';
            return { success: false, error: msg };
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    return {
        users,
        loading,
        error,
        fetchUsers,
        createUser,
        updateUser,
        deleteUser
    };
}