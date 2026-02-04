import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Package, ShoppingCart, Factory, 
  Truck, Settings, LogOut, ChevronRight, Users, Briefcase, 
  UserCog, Percent, ClipboardList, TrendingUp, Shield, User,
  Ruler, Hammer, PenTool 
} from 'lucide-react';

import { useFoundations } from '../../modules/foundations/hooks/useFoundations';

const API_URL = "https://valentina-erp-v3.uc.r.appspot.com";

// 1. DEFINICIÓN DE ROLES
type UserRole = 'DIRECTOR' | 'ADMIN' | 'SALES' | 'DESIGN' | 'WAREHOUSE' | 'PRODUCTION';

// 2. CONFIGURACIÓN DEL MENÚ (Orden 1-13)
const menuItems = [
  // 1- Dashboard
  { icon: LayoutDashboard, label: 'Dashboard', path: '/', allowedRoles: ['DIRECTOR', 'ADMIN', 'SALES', 'DESIGN', 'WAREHOUSE', 'PRODUCTION'] },
  
  // 2- Proveedores
  { icon: Users, label: 'Proveedores', path: '/providers', allowedRoles: ['DIRECTOR', 'ADMIN', 'WAREHOUSE'] },
  
  // 3- Materiales
  { icon: Package, label: 'Materiales', path: '/materials', allowedRoles: ['DIRECTOR', 'ADMIN', 'DESIGN', 'WAREHOUSE', 'PRODUCTION'] }, 
  
  // 4- Almacén (Recepción)
  { icon: ClipboardList, label: 'Almacén', path: '/inventory/reception', allowedRoles: ['DIRECTOR', 'ADMIN', 'WAREHOUSE', 'PRODUCTION'] },
  
  // 5- Clientes
  { icon: Briefcase, label: 'Clientes', path: '/clients', allowedRoles: ['DIRECTOR', 'ADMIN', 'SALES'] },
  
  // 6- Ventas
  { icon: ShoppingCart, label: 'Ventas', path: '/sales', allowedRoles: ['DIRECTOR', 'ADMIN', 'SALES'] },
  
  // 7- Diseño
  { icon: Ruler, label: 'Diseño', path: '/design', allowedRoles: ['DIRECTOR', 'ADMIN', 'SALES', 'DESIGN', 'PRODUCTION'] },
  
  // 8- Producción
  { icon: Factory, label: 'Producción', path: '/production', allowedRoles: ['DIRECTOR', 'ADMIN', 'DESIGN', 'PRODUCTION'] },
  
  // 9- Logística
  { icon: Truck, label: 'Logística', path: '/logistics', allowedRoles: ['DIRECTOR', 'ADMIN', 'WAREHOUSE', 'SALES'] },
  
  // 10- Gerencia
  { icon: TrendingUp, label: 'Gerencia', path: '/management', allowedRoles: ['DIRECTOR', 'ADMIN'] },

  // 11- Usuarios
  { icon: UserCog, label: 'Usuarios', path: '/users', allowedRoles: ['DIRECTOR'] },

  // 12- Impuestos
  { icon: Percent, label: 'Impuestos', path: '/tax-rates', allowedRoles: ['DIRECTOR', 'ADMIN'] },

  // 13- Configuración
  { icon: Settings, label: 'Configuración', path: '/config', allowedRoles: ['DIRECTOR'] }, 
];

export default function Sidebar() {
  const { config, fetchConfig, loading } = useFoundations();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const [userRole, setUserRole] = useState<UserRole>('DIRECTOR');

  useEffect(() => {
    fetchConfig();
    const storedRole = localStorage.getItem('user_role');
    if (storedRole) {
        setUserRole(storedRole.toUpperCase() as UserRole);
    }
  }, [fetchConfig]);

  const isActive = (path: string) => {
    if (path === '/') return currentPath === '/';
    return currentPath.startsWith(path);
  };

  const getLogoUrl = (path: string) => {
    if (!path) return '';
    return path.startsWith('http') ? path : `${API_URL}/${path}`;
  };

  // --- LOGICA DE COLORES Y ETIQUETAS DEL ROL ---
  const getRoleBadgeInfo = (role: UserRole) => {
      switch(role) {
          case 'DIRECTOR': 
              return { label: 'DIRECCIÓN', className: 'bg-slate-900 text-white border-slate-700' }; 
          case 'ADMIN': 
              return { label: 'ADMINISTRACIÓN', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' }; 
          case 'SALES': 
              return { label: 'VENTAS', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' }; 
          case 'DESIGN': 
              return { label: 'DISEÑO', className: 'bg-pink-100 text-pink-700 border-pink-200' }; 
          case 'WAREHOUSE': 
              return { label: 'ALMACÉN', className: 'bg-orange-100 text-orange-800 border-orange-200' }; 
          case 'PRODUCTION': 
              return { label: 'PRODUCCIÓN', className: 'bg-blue-100 text-blue-700 border-blue-200' }; 
          default: 
              return { label: role, className: 'bg-slate-100 text-slate-500 border-slate-200' };
      }
  };

  const roleBadge = getRoleBadgeInfo(userRole);
  const filteredMenu = menuItems.filter(item => item.allowedRoles.includes(userRole as string));

  const getRoleNameDetailed = (role: UserRole) => {
      switch(role) {
          case 'DIRECTOR': return 'Director General';
          case 'ADMIN': return 'Administración';
          case 'SALES': return 'Ventas';
          case 'DESIGN': return 'Ingeniería';
          case 'WAREHOUSE': return 'Almacén';
          case 'PRODUCTION': return 'Jefe Producción';
          default: return 'Usuario';
      }
  };

  const handleLogout = () => {
    if(window.confirm("¿Cerrar sesión?")) {
        localStorage.clear();
        navigate('/login');
    }
  };

  return (
    <aside className="w-64 bg-white h-screen fixed left-0 top-0 flex flex-col border-r border-slate-200 z-50 transition-all">
      
      {/* HEADER LOGO */}
      <div className="h-16 flex items-center px-6 border-b border-slate-100">
        <div className="flex items-center gap-3 w-full">
          {loading ? (
             <div className="w-8 h-8 bg-slate-100 animate-pulse rounded-lg flex-shrink-0" />
          ) : config?.logo_path ? (
            <img 
              src={getLogoUrl(config.logo_path)}
              alt="Logo" 
              className="w-8 h-8 object-contain flex-shrink-0" 
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm shadow-indigo-200 flex-shrink-0">
               <span className="text-white font-bold text-sm">
                 {config?.company_name ? config.company_name.charAt(0).toUpperCase() : 'S'}
               </span>
            </div>
          )}
          <span className="text-lg font-bold text-slate-800 truncate flex-1 block" title={config?.company_name}>
            {loading ? 'Cargando...' : (config?.company_name || 'SGP V3')}
          </span>
        </div>
      </div>

      {/* MENÚ DE NAVEGACIÓN */}
      <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between px-2 mb-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Módulos</p>
            {/* BADGE DINÁMICO DE ROL */}
            <span className={`text-[9px] px-2 py-0.5 rounded border font-bold uppercase ${roleBadge.className}`}>
                {roleBadge.label}
            </span>
        </div>
        
        {filteredMenu.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                ${active 
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }
              `}
            >
              <div className="flex items-center gap-3">
                <item.icon size={18} className={active ? 'stroke-[2px]' : 'stroke-[1.5px]'} />
                <span>{item.label}</span>
              </div>
              <ChevronRight size={14} className={`transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
            </Link>
          );
        })}
      </nav>

      {/* FOOTER USUARIO + FIRMA VALENTINA SOBRIA */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        
        {/* Tarjeta de Usuario */}
        <div className="flex items-center gap-3 mb-3 p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer group border border-transparent hover:border-slate-100">
          <div className={`w-9 h-9 rounded-full border flex items-center justify-center font-bold text-xs shadow-sm
            ${userRole === 'DIRECTOR' ? 'bg-slate-800 border-slate-900 text-white' : ''}
            ${userRole === 'ADMIN' ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : ''}
            ${userRole === 'SALES' ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : ''}
            ${userRole === 'DESIGN' ? 'bg-pink-100 border-pink-200 text-pink-700' : ''}
            ${userRole === 'WAREHOUSE' ? 'bg-orange-100 border-orange-200 text-orange-700' : ''}
            ${userRole === 'PRODUCTION' ? 'bg-blue-100 border-blue-200 text-blue-700' : ''}
          `}>
            {userRole === 'DIRECTOR' && <Shield size={16}/>}
            {userRole === 'ADMIN' && <Briefcase size={16}/>}
            {userRole === 'SALES' && <User size={16}/>}
            {userRole === 'DESIGN' && <PenTool size={16}/>}
            {userRole === 'WAREHOUSE' && <Package size={16}/>}
            {userRole === 'PRODUCTION' && <Hammer size={16}/>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-700 truncate group-hover:text-indigo-600 transition-colors">
                {getRoleNameDetailed(userRole)}
            </p>
            <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> En línea
            </p>
          </div>
        </div>

        {/* Botón Logout */}
        <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-md border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all text-xs font-medium mb-4 bg-white"
        >
          <LogOut size={14} /> Cerrar Sesión
        </button>

        {/* --- FIRMA DEL SISTEMA "VALENTINA" --- */}
        <div className="pt-3 border-t border-slate-200 text-center group cursor-default">
            <div className="flex items-baseline justify-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                {/* Nombre Principal */}
                <span className="font-serif italic text-lg text-slate-600 font-medium tracking-wide">
                    Valentina
                </span>
                {/* Apellido Discreto */}
                <span className="text-[10px] text-slate-400 font-sans tracking-normal font-normal">
                    Software
                </span>
            </div>
            <p className="text-[9px] text-slate-400 font-mono mt-0.5 tracking-tight uppercase">
                Sistema de Producción v3.0
            </p>
        </div>

      </div>
    </aside>
  );
}