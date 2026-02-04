import axios from 'axios';

// --- CONFIGURACIÓN AUTOMÁTICA ---
// Vite decidirá si usa la URL de .env.development o .env.production
// ¡Ya no toques esta línea nunca más!
export const API_URL = import.meta.env.VITE_API_URL;

const client = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor para inyectar el Token
client.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Interceptor para manejo de errores
client.interceptors.response.use(
    response => response,
    error => {
        // Si el token expiró, podríamos redirigir al login
        if (error.response && error.response.status === 401) {
             console.warn("Sesión expirada o no autorizada");
             // Opcional: window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default client;