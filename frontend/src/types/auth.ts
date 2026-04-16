// Define la estructura del Usuario (Lo que devuelve el Backend)
export interface User {
    id: number;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
    commission_rate?: number;
    global_commission_rate?: number;
}

// Define lo que enviamos para CREAR un usuario
export interface UserCreatePayload {
    email: string;
    password: string;
    full_name: string;
    role: string;
    commission_rate?: number;
    global_commission_rate?: number;
}

// Define la respuesta del Login (El Token)
export interface AuthResponse {
    access_token: string;
    token_type: string;
}