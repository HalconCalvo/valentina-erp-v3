import React, { useEffect, useState } from 'react';
import { Calendar, Clock } from 'lucide-react';

const Home: React.FC = () => {
  // --- ESTADOS DE USUARIO ---
  const [userRole, setUserRole] = useState('DIRECTOR'); 
  const [userName, setUserName] = useState('Usuario');
  const [currentTime, setCurrentTime] = useState(new Date());

  // --- EFECTOS INICIALES ---
  useEffect(() => {
    const storedRole = (localStorage.getItem('user_role') || 'DIRECTOR').toUpperCase();
    const storedName = localStorage.getItem('full_name') || localStorage.getItem('user_name') || 'Usuario';

    setUserRole(storedRole);
    setUserName(storedName);

    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000 * 60); 
    return () => clearInterval(clockTimer);
  }, []);

  // --- CONFIG HERO POR ROL ---
  const getRoleConfig = () => {
    switch (userRole) {
      case 'DIRECTOR': return { title: 'Dirección General', subtitle: 'Cuadro de Mando Estratégico.', color: 'from-slate-800 to-black' };
      case 'GERENCIA': return { title: 'Gerencia Operativa', subtitle: 'Control de rentabilidad y flujos.', color: 'from-purple-600 to-indigo-800' };
      case 'ADMIN': return { title: 'Administración', subtitle: 'Gestión de Cobranza y Cuentas por Pagar.', color: 'from-indigo-600 to-violet-800' };
      case 'SALES': return { title: 'Panel Comercial', subtitle: 'Tus objetivos y seguimiento.', color: 'from-emerald-500 to-teal-600' };
      case 'DESIGN': return { title: 'Ingeniería', subtitle: 'Desarrollo de productos.', color: 'from-pink-500 to-rose-600' };
      case 'WAREHOUSE': return { title: 'Almacén', subtitle: 'Control de inventarios y entradas.', color: 'from-orange-500 to-amber-600' };
      case 'PRODUCTION': return { title: 'Fábrica', subtitle: 'Gestión de transformación.', color: 'from-blue-600 to-indigo-700' };
      case 'LOGISTICS': return { title: 'Logística', subtitle: 'Gestión de rutas e instalaciones.', color: 'from-cyan-600 to-blue-700' };
      default: return { title: 'Bienvenido', subtitle: 'Valentina v3.8', color: 'from-slate-600 to-slate-800' };
    }
  };

  const config = getRoleConfig();
  const getGreeting = () => { 
      const h = currentTime.getHours(); 
      return h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches'; 
  };

  return (
    <div className="min-h-full p-8 space-y-8 animate-in fade-in duration-500 pb-24 max-w-7xl mx-auto">
      
      {/* HERO SECTION - EL PUERTO SEGURO */}
      <div className={`rounded-2xl shadow-xl p-8 text-white bg-gradient-to-r ${config.color} relative overflow-hidden transition-colors duration-500`}>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <div className="flex items-center gap-2 text-white/80 text-sm font-medium mb-1">
                <Calendar size={14}/> {currentTime.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <h1 className="text-4xl font-black tracking-tight mb-2">
                {getGreeting()}, <span className="opacity-90">{userName}</span>
            </h1>
            <p className="text-white/80 max-w-lg text-lg">{config.subtitle}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm p-3 rounded-lg border border-white/10">
            <div className="flex items-center gap-2">
                <Clock size={18}/>
                <span className="font-mono text-xl font-bold">
                    {currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Home;