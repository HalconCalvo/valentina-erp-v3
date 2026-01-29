import axios from 'axios';

// Definimos la URL base
export const API_URL = 'http://localhost:8000/api/v1'; 

const client = axios.create({
    baseURL: API_URL,
    // ELIMINAMOS 'headers' para no forzar Content-Type.
    // Axios lo detectará automáticamente.
});

// Interceptor para inyectar el Token (Si ya estás logueado)
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
        // Opcional: Si el token expiró (401), podrías limpiar el localStorage aquí
        if (error.response && error.response.status === 401) {
            // localStorage.removeItem('token');
            // window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default client;