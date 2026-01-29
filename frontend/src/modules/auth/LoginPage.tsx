import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader, AlertCircle, LayoutGrid } from 'lucide-react';
import client from '../../api/axios-client';

// Definimos lo que esperamos recibir del Backend
interface AuthResponse {
    access_token: string;
    token_type: string;
    // Estos campos deben venir del backend. 
    // Si tu backend no los manda en el login, los decodificaremos o usaremos fallback.
    role?: string; 
    user_id?: number; 
    full_name?: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
        // --- 1. PREPARAMOS LOS DATOS ---
        // FastAPI usa OAuth2PasswordRequestForm, que espera form-data
        const formData = new URLSearchParams();
        formData.append('username', email); 
        formData.append('password', password);

        // --- 2. PETICIÓN AL BACKEND ---
        const { data } = await client.post<AuthResponse>('/login/access-token', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // --- 3. GUARDADO DE CREDENCIALES (CRÍTICO) ---
        console.log("Login Exitoso, Datos recibidos:", data);

        // A. Token
        localStorage.setItem('token', data.access_token);
        
        // B. Rol (Si no viene, asumimos uno por el email para pruebas, o ADMIN)
        const role = data.role || 'ADMIN'; 
        localStorage.setItem('user_role', role);

        // C. ID DE USUARIO (¡AQUÍ ESTABA EL PROBLEMA!)
        // Si el backend manda user_id, lo usamos. Si no, lo inferimos temporalmente.
        if (data.user_id) {
            localStorage.setItem('user_id', String(data.user_id));
        } else {
            // FALLBACK DE EMERGENCIA: Si el backend olvidó mandar el ID en el endpoint de login
            // Asignamos IDs fijos basados en el rol para que el Dashboard funcione.
            let fallbackId = '1';
            if (role === 'SALES') fallbackId = '4'; // Beto
            if (role === 'WAREHOUSE') fallbackId = '2';
            if (role === 'DESIGN') fallbackId = '3';
            localStorage.setItem('user_id', fallbackId);
        }

        // D. Nombre
        localStorage.setItem('user_name', data.full_name || email.split('@')[0]);

        // --- 4. REDIRECCIÓN ---
        // Usamos reload para asegurar que toda la app lea los nuevos datos del storage
        window.location.href = '/';

    } catch (err: any) {
        console.error("Error Login:", err);
        
        // --- MODO SIMULACIÓN (SI BACKEND FALLA) ---
        // Esto permite probar el front si el back está apagado
        if (email.includes('demo') || email.includes('ventas')) {
             console.warn("Entrando en modo Simulación...");
             localStorage.setItem('token', 'fake-token');
             
             let role = 'ADMIN'; 
             let uid = '1';

             if (email.includes('ventas')) { role = 'SALES'; uid = '4'; } // Beto Simulado
             else if (email.includes('alm')) { role = 'WAREHOUSE'; uid = '2'; }
             
             localStorage.setItem('user_role', role);
             localStorage.setItem('user_id', uid); // <--- IMPORTANTE
             localStorage.setItem('user_name', 'Usuario Simulado');
             window.location.href = '/';
             return;
        }

        const msg = err.response?.data?.detail || "Credenciales incorrectas o error de conexión.";
        setError(msg);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-white font-sans text-slate-900">
      
      {/* IZQUIERDA: VISUAL / BRANDING */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 relative items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/90 to-slate-900/90 z-10" />
        <img 
            src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=2070&auto=format&fit=crop" 
            alt="Fábrica" 
            className="absolute inset-0 w-full h-full object-cover grayscale opacity-50"
        />
        
        <div className="relative z-20 text-white p-12 max-w-xl">
            <div className="mb-6 inline-flex p-3 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
                <LayoutGrid size={32} className="text-indigo-400"/>
            </div>
            <h1 className="text-5xl font-black tracking-tight mb-6 leading-tight">
                Sistema de Gestión de Producción
            </h1>
            <p className="text-lg text-slate-300 leading-relaxed font-light">
                Control integral para manufactura: desde la cotización inicial hasta la entrega final en almacén.
            </p>
        </div>
      </div>

      {/* DERECHA: FORMULARIO */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md space-y-8 bg-white p-10 rounded-2xl shadow-xl border border-slate-100">
            
            <div className="text-center">
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Iniciar Sesión</h2>
                <p className="mt-2 text-slate-500 text-sm">Ingresa tus credenciales operativas</p>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm flex items-start gap-3 border border-red-100 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle size={18} className="shrink-0 mt-0.5"/>
                    <span>{error}</span>
                </div>
            )}

            <form className="space-y-6" onSubmit={handleLogin}>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Correo Electrónico</label>
                        <div className="relative">
                            <div className="absolute left-3 top-3 text-slate-400">
                                <Mail size={18}/>
                            </div>
                            <input 
                                type="text" 
                                required
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium text-slate-700 text-sm"
                                placeholder="usuario@sgp.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Contraseña</label>
                        </div>
                        <div className="relative">
                            <div className="absolute left-3 top-3 text-slate-400">
                                <Lock size={18}/>
                            </div>
                            <input 
                                type="password" 
                                required
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium text-slate-700 text-sm"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {loading ? <Loader className="animate-spin" size={20}/> : <>Ingresar <ArrowRight size={20}/></>}
                </button>
            </form>

            <div className="pt-6 border-t border-slate-100 text-center">
                 <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">Ambiente de Pruebas</p>
                 <div className="flex flex-wrap justify-center gap-2">
                    <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500">admin@...</span>
                    <span className="text-[10px] bg-emerald-50 px-2 py-1 rounded text-emerald-600">ventas@...</span>
                 </div>
            </div>
        </div>
      </div>
    </div>
  );
}