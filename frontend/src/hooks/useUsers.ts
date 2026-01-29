import { useState, useEffect, useCallback } from 'react';
// Ajustamos la importación a relativa para evitar errores de alias
import client from '../api/axios-client';

// Definimos la interfaz aquí mismo para no depender de archivos externos por ahora
export interface User {
    id: number;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
    commission_rate?: number; // <--- NUEVO CAMPO AGREGADO
}

export function useUsers() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // GET: Obtener lista
    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            // Nota: La barra final '/' es importante si FastAPI así lo define
            const res = await client.get<User[]>('/auth/users/');
            setUsers(res.data);
            setError(null);
        } catch (err: any) {
            console.error(err);
            setError('Error al cargar usuarios.');
        } finally {
            setLoading(false);
        }
    }, []);

    // POST: Crear
    const createUser = async (payload: any) => {
        try {
            await client.post('/auth/users/', payload);
            await fetchUsers(); 
            return { success: true };
        } catch (err: any) {
            console.error("Error creating user:", err.response?.data);
            const msg = err.response?.data?.detail || 'Error al crear usuario';
            return { success: false, error: msg };
        }
    };

    // PUT: Actualizar (Edición de rol, nombre o password)
    const updateUser = async (id: number, user: any) => {
        try {
            await client.put(`/auth/users/${id}`, user);
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
            await client.delete(`/auth/users/${id}`);
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
        fetchUsers, // Exportamos esto para el botón de refrescar manual
        createUser,
        updateUser,
        deleteUser
    };
}