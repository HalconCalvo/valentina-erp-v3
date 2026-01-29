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
    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_name');
        window.location.href = '/login';
    }
};