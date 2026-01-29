// Define la estructura del Usuario (Lo que devuelve el Backend)
export interface User {
    id: number;
    email: string;
    full_name: string;
    role: string; // admin, ventas, design, production, installer
    is_active: boolean;
}

// Define lo que enviamos para CREAR un usuario
export interface UserCreatePayload {
    email: string;
    password: string;
    full_name: string;
    role: string;
}

// Define la respuesta del Login (El Token)
export interface AuthResponse {
    access_token: string;
    token_type: string;
}