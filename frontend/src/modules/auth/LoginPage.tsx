import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader, AlertCircle, LayoutGrid } from 'lucide-react';
import client from '../../api/axios-client';

interface AuthResponse {
    access_token: string;
    token_type: string;
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
        // SOLUCIÓN EXHAUSTIVA:
        // Enviamos TODOS los campos que OAuth2 podría pedir, incluso los vacíos.
        const params = new URLSearchParams();
        params.append('username', email);
        params.append('password', password);
        params.append('grant_type', 'password');
        params.append('scope', '');
        params.append('client_id', '');
        params.append('client_secret', '');

        // Forzamos la cabecera explícitamente
        const config = {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };

        console.log("Enviando credenciales...", params.toString());

        const { data } = await client.post<AuthResponse>('/login/access-token', params, config);

        console.log("Login Exitoso:", data);

        localStorage.setItem('token', data.access_token);
        localStorage.setItem('user_role', data.role || 'ADMIN');
        localStorage.setItem('user_id', String(data.user_id || '1'));
        localStorage.setItem('user_name', data.full_name || email.split('@')[0]);
        
        window.location.href = '/';

    } catch (err: any) {
        console.error("Error Login:", err);
        
        // Decodificador de errores para mostrar en pantalla
        let msg = "Error de conexión.";
        if (err.response) {
            if (err.response.status === 422) {
                // Si es 422, intentamos leer qué campo falta
                const detail = err.response.data.detail;
                if (Array.isArray(detail)) {
                    msg = "Faltan datos: " + detail.map((e:any) => e.loc[1] + " " + e.msg).join(', ');
                } else {
                    msg = "Error de validación (422): " + JSON.stringify(detail);
                }
            } else if (err.response.data.detail) {
                msg = err.response.data.detail;
            }
        }
        setError(msg);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-white font-sans text-slate-900">
      
      {/* IZQUIERDA */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 relative items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/90 to-slate-900/90 z-10" />
        <img src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=2070&auto=format&fit=crop" alt="Fábrica" className="absolute inset-0 w-full h-full object-cover grayscale opacity-50"/>
        <div className="relative z-20 text-white p-12 max-w-xl text-center lg:text-left">
            <div className="mb-6 inline-flex p-3 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
                <LayoutGrid size={32} className="text-indigo-400"/>
            </div>
            <div className="flex flex-col items-start gap-1 mb-6">
                 <div className="flex items-baseline gap-2">
                    <span className="font-serif italic text-6xl text-white font-medium tracking-wide">Valentina</span>
                 </div>
                 <p className="text-sm text-slate-400 font-mono mt-1 tracking-tight uppercase pl-1">Sistema de Producción v3.0</p>
            </div>
        </div>
      </div>

      {/* DERECHA */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md space-y-8 bg-white p-10 rounded-2xl shadow-xl border border-slate-100">
            <div className="text-center">
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Iniciar Sesión</h2>
                <p className="mt-2 text-slate-500 text-sm">Ingresa tus credenciales operativas</p>
            </div>

            {/* ERROR EN PANTALLA */}
            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm flex flex-col items-start gap-1 border border-red-100">
                    <div className="flex items-center gap-2 font-bold">
                        <AlertCircle size={18}/> Error
                    </div>
                    <span className="break-words w-full">{error}</span>
                </div>
            )}

            <form className="space-y-6" onSubmit={handleLogin}>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Correo</label>
                        <input 
                            type="text" required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            placeholder="usuario@sgp.com"
                            value={email} onChange={e => setEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Contraseña</label>
                        <input 
                            type="password" required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            placeholder="••••••••"
                            value={password} onChange={e => setPassword(e.target.value)}
                        />
                    </div>
                </div>
                <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2">
                    {loading ? <Loader className="animate-spin" size={20}/> : <>Ingresar <ArrowRight size={20}/></>}
                </button>
            </form>
        </div>
      </div>
    </div>
  );
}