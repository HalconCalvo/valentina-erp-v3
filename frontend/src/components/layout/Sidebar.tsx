import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Package, ShoppingCart, Factory, 
  Truck, Settings, LogOut, ChevronRight, Users, Briefcase, 
  UserCog, Percent, ClipboardList, TrendingUp, Shield, User,
  Ruler, Hammer, PenTool, Landmark, CalendarDays
} from 'lucide-react';

import { useFoundations } from '../../modules/foundations/hooks/useFoundations';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

type UserRole = 'DIRECTOR' | 'GERENCIA' | 'ADMIN' | 'SALES' | 'DESIGN' | 'WAREHOUSE' | 'PRODUCTION' | 'LOGISTICS';

// --- CONFIGURACIÓN DEL MENÚ ---
const menuItems = [
  { icon: LayoutDashboard, label: 'Principal', path: '/', allowedRoles: ['DIRECTOR', 'GERENCIA', 'ADMIN', 'SALES', 'DESIGN', 'WAREHOUSE', 'PRODUCTION', 'LOGISTICS'] },
  
  // ---> LA NUEVA PUERTA EXCLUSIVA DEL DIRECTOR <---
  { icon: Shield, label: 'Dirección', path: '/director', allowedRoles: ['DIRECTOR'] },
  
  // ---> INTACTO COMO ESTABA <---
  { icon: TrendingUp, label: 'Gerencia', path: '/management', allowedRoles: ['DIRECTOR', 'GERENCIA'] },
  
  { icon: ShoppingCart, label: 'Ventas', path: '/sales', allowedRoles: ['DIRECTOR', 'GERENCIA', 'SALES'] },
  { icon: Users, label: 'Monitor Clientes', path: '/clients', allowedRoles: ['DIRECTOR', 'GERENCIA', 'SALES', 'ADMIN'] },
  
  // 🔒 CANDADO APLICADO: Ventas ya NO puede entrar a Diseño e Ingeniería.
  { icon: Ruler, label: 'Diseño e Ingeniería', path: '/design', allowedRoles: ['DIRECTOR', 'GERENCIA', 'DESIGN', 'PRODUCTION'] },
  
  { icon: Factory, label: 'Producción', path: '/production', allowedRoles: ['DIRECTOR', 'GERENCIA', 'DESIGN', 'PRODUCTION'] },
  { icon: CalendarDays, label: 'Planeación Maestra', path: '/planning', allowedRoles: ['DIRECTOR', 'GERENCIA', 'DESIGN', 'PRODUCTION', 'SALES'] },
  { icon: Truck, label: 'Logística e Instalación', path: '/logistics', allowedRoles: ['DIRECTOR', 'GERENCIA', 'ADMIN', 'WAREHOUSE', 'SALES', 'LOGISTICS', 'PRODUCTION'] },
  { icon: ClipboardList, label: 'Compras y Almacén', path: '/inventory', allowedRoles: ['DIRECTOR', 'GERENCIA', 'ADMIN', 'WAREHOUSE', 'PRODUCTION'] },
  { icon: Package, label: 'Catálogo Materiales', path: '/materials', allowedRoles: ['DIRECTOR', 'GERENCIA', 'ADMIN', 'DESIGN', 'WAREHOUSE', 'PRODUCTION'] }, 
  { icon: Briefcase, label: 'Proveedores', path: '/providers', allowedRoles: ['DIRECTOR', 'GERENCIA', 'ADMIN', 'WAREHOUSE'] },
  { icon: Landmark, label: 'Administración', path: '/treasury', allowedRoles: ['DIRECTOR', 'GERENCIA', 'ADMIN'] },
  { icon: UserCog, label: 'Usuarios y Comisiones', path: '/users', allowedRoles: ['DIRECTOR'] },
  { icon: Percent, label: 'Registro Impuestos', path: '/tax-rates', allowedRoles: ['DIRECTOR', 'ADMIN'] }, 
  { icon: Settings, label: 'Parámetros Globales', path: '/config', allowedRoles: ['DIRECTOR'] }, 
];

// --- REORDENAMIENTO ---
const rolePriorities: Record<string, string[]> = {
  // Ahora el Director ve su panel estratégico antes que la gerencia
  'DIRECTOR': ['/', '/director', '/planning', '/management', '/treasury'],
  'GERENCIA': ['/', '/management', '/planning', '/treasury', '/production', '/sales'],
  'ADMIN': ['/', '/treasury', '/inventory', '/providers', '/materials'],
  // Ventas ya no necesita priorizar /design
  'SALES': ['/', '/sales', '/planning', '/clients', '/logistics'],
  'DESIGN': ['/', '/design', '/planning', '/materials', '/production'],
  'WAREHOUSE': ['/', '/inventory', '/providers', '/materials', '/logistics'],
  'PRODUCTION': ['/', '/production', '/planning', '/inventory', '/design'],
  'LOGISTICS': ['/', '/logistics', '/production']
};

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
    
    // ---> LA LLAVE MAESTRA UNIVERSAL <---
    // Si estamos dentro de cualquier reporte financiero (/finance/...)
    if (currentPath.startsWith('/finance')) {
        // Si es el Vendedor, iluminamos el botón de Ventas y lo dejamos pasar
        if (userRole === 'SALES' && path === '/sales') return true;
        
        // Si es Admin, Gerente o Director, iluminamos Administración
        if (['ADMIN', 'DIRECTOR', 'GERENCIA'].includes(userRole) && path === '/treasury') return true;
    }
    
    return currentPath.startsWith(path);
  };
  
  const getLogoUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const baseUrl = API_URL.replace('/api/v1', '');
    return `${baseUrl}/${path}`;
  };

  const getRoleBadgeInfo = (role: UserRole) => {
      switch(role) {
          case 'DIRECTOR': return { label: 'DIRECCIÓN', className: 'bg-slate-900 text-white border-slate-700' }; 
          case 'GERENCIA': return { label: 'GERENCIA', className: 'bg-purple-100 text-purple-700 border-purple-200' }; 
          case 'ADMIN': return { label: 'ADMINISTRACIÓN', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' }; 
          case 'SALES': return { label: 'VENTAS', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' }; 
          case 'DESIGN': return { label: 'DISEÑO', className: 'bg-pink-100 text-pink-700 border-pink-200' }; 
          case 'WAREHOUSE': return { label: 'COMPRAS Y ALMACÉN', className: 'bg-orange-100 text-orange-800 border-orange-200' }; 
          case 'PRODUCTION': return { label: 'PRODUCCIÓN', className: 'bg-blue-100 text-blue-700 border-blue-200' }; 
          case 'LOGISTICS': return { label: 'LOGÍSTICA', className: 'bg-cyan-100 text-cyan-700 border-cyan-200' }; 
          default: return { label: role, className: 'bg-slate-100 text-slate-500 border-slate-200' };
      }
  };

  const roleBadge = getRoleBadgeInfo(userRole);
  const filteredMenu = menuItems.filter(item => item.allowedRoles.includes(userRole as string));

  const sortedMenu = [...filteredMenu].sort((a, b) => {
    const priorities = rolePriorities[userRole as string] || [];
    const indexA = priorities.indexOf(a.path);
    const indexB = priorities.indexOf(b.path);

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return menuItems.indexOf(a) - menuItems.indexOf(b);
  });

  const getRoleNameDetailed = (role: UserRole) => {
      switch(role) {
          case 'DIRECTOR': return 'Dirección Estratégica';
          case 'GERENCIA': return 'Gerencia Operativa';
          case 'ADMIN': return 'Administración Contable';
          case 'SALES': return 'Asesor Comercial';
          case 'DESIGN': return 'Ingeniería y Diseño';
          case 'WAREHOUSE': return 'Almacén y Compras';
          case 'PRODUCTION': return 'Jefe Producción';
          case 'LOGISTICS': return 'Logística e Instalación';
          default: return 'Usuario Sistema';
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
      <div className="h-28 flex items-center justify-center p-6 border-b border-slate-100 bg-slate-50/30">
        <div className="flex items-center justify-center w-full h-full">
          {loading ? (
             <div className="w-full h-12 bg-slate-100 animate-pulse rounded-lg flex-shrink-0" />
          ) : config?.logo_path ? (
            <img 
              src={getLogoUrl(config.logo_path)}
              alt="Logo" 
              className="max-w-full max-h-full object-contain filter drop-shadow-sm" 
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-12 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm shadow-indigo-200 flex-shrink-0">
               <span className="text-white font-bold text-sm">
                 {config?.company_name ? config.company_name.charAt(0).toUpperCase() : 'S'}
               </span>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between px-2 mb-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Módulos</p>
            <span className={`text-[9px] px-2 py-0.5 rounded border font-bold uppercase ${roleBadge.className}`}>
                {roleBadge.label}
            </span>
        </div>
        
        {sortedMenu.map((item) => {
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

      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <div className="mb-3 text-center px-2">
            <span className="text-sm font-bold text-slate-800 truncate block" title={config?.company_name}>
              {loading ? 'Cargando...' : (config?.company_name || 'SGP V3')}
            </span>
        </div>

        <div className="flex items-center gap-3 mb-3 p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer group border border-transparent hover:border-slate-100">
          <div className={`w-9 h-9 rounded-full border flex items-center justify-center font-bold text-xs shadow-sm
            ${userRole === 'DIRECTOR' ? 'bg-slate-800 border-slate-900 text-white' : ''}
            ${userRole === 'GERENCIA' ? 'bg-purple-100 border-purple-200 text-purple-700' : ''}
            ${userRole === 'ADMIN' ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : ''}
            ${userRole === 'SALES' ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : ''}
            ${userRole === 'DESIGN' ? 'bg-pink-100 border-pink-200 text-pink-700' : ''}
            ${userRole === 'WAREHOUSE' ? 'bg-orange-100 border-orange-200 text-orange-700' : ''}
            ${userRole === 'PRODUCTION' ? 'bg-blue-100 border-blue-200 text-blue-700' : ''}
            ${userRole === 'LOGISTICS' ? 'bg-cyan-100 border-cyan-200 text-cyan-700' : ''}
          `}>
            {userRole === 'DIRECTOR' && <Shield size={16}/>}
            {userRole === 'GERENCIA' && <TrendingUp size={16}/>}
            {userRole === 'ADMIN' && <Briefcase size={16}/>}
            {userRole === 'SALES' && <User size={16}/>}
            {userRole === 'DESIGN' && <PenTool size={16}/>}
            {userRole === 'WAREHOUSE' && <Package size={16}/>}
            {userRole === 'PRODUCTION' && <Hammer size={16}/>}
            {userRole === 'LOGISTICS' && <Truck size={16}/>}
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

        <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-md border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all text-xs font-medium mb-4 bg-white"
        >
          <LogOut size={14} /> Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}