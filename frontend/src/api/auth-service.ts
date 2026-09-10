import axiosClient from './axios-client';

export interface LoginResponse {
    access_token: string;
    token_type: string;
    user: {
        id: number;
        email: string;
        full_name: string;
        role: string;
    }
}

export const authService = {
    /**
     * Inicia sesión enviando usuario (email) y contraseña.
     * FastAPI espera los campos 'username' y 'password' en Form-Data por estándar OAuth2.
     */
    heartbeat: async (): Promise<void> => {
        await axiosClient.post('/users/heartbeat');
    },

    logoutRemote: async (): Promise<void> => {
        try {
            await axiosClient.post('/users/logout');
        } catch {
            /* best effort */
        }
    },

    login: async (email: string, password: string): Promise<LoginResponse> => {
        // 1. Usamos FormData (No JSON)
        const formData = new FormData();
        
        // 2. IMPORTANTE: El backend espera 'username', aunque le enviemos el email.
        formData.append('username', email); 
        formData.append('password', password);

        // 3. Enviamos la petición. Axios detectará que es FormData y pondrá el header correcto automáticamente.
        const response = await axiosClient.post('/login/access-token', formData);
        return response.data;
    },

    /**
     * Cierra sesión limpiando el almacenamiento local
     */
    logout: async () => {
        await authService.logoutRemote();
        localStorage.removeItem('token');
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_name');
        localStorage.removeItem('user_id');
        window.location.href = '/login';
    },
};