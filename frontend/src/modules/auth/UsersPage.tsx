import React, { useState } from 'react';
import { useUsers } from '../../hooks/useUsers'; 
import { 
  Plus, UserCog, Shield, Mail, Key, X, 
  CheckCircle, Trash2, Pencil, RefreshCw,
  Percent, Briefcase, PenTool, Package, Hammer, User
} from 'lucide-react';

// --- 1. CONFIGURACIÓN DE ROLES (Nombres visuales) ---
const ROLE_OPTIONS = {
    'DIRECTOR': 'DIRECCIÓN',       // Negro
    'ADMIN': 'ADMINISTRACIÓN',     // Índigo
    'SALES': 'VENTAS',             // Verde
    'DESIGN': 'DISEÑO',            // Rosa
    'WAREHOUSE': 'ALMACÉN',        // Naranja
    'PRODUCTION': 'PRODUCCIÓN',    // Azul
};

export default function UsersPage() {
  const { users, loading, createUser, updateUser, deleteUser, fetchUsers } = useUsers();
  
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const initialForm = {
    full_name: '',
    email: '',
    password: '', 
    role: 'SALES', 
    is_active: true,
    commission_rate: 0 
  };

  const [form, setForm] = useState(initialForm);

  // --- HELPER DE COLORES (Exactamente igual al Sidebar) ---
  const getRoleBadgeClasses = (role: string) => {
      switch(role) {
          case 'DIRECTOR': return 'bg-slate-900 text-white border-slate-700'; // Negro
          case 'ADMIN': return 'bg-indigo-100 text-indigo-700 border-indigo-200'; // Índigo
          case 'SALES': return 'bg-emerald-100 text-emerald-700 border-emerald-200'; // Verde
          case 'DESIGN': return 'bg-pink-100 text-pink-700 border-pink-200'; // Rosa
          case 'WAREHOUSE': return 'bg-orange-100 text-orange-800 border-orange-200'; // Naranja
          case 'PRODUCTION': return 'bg-blue-100 text-blue-700 border-blue-200'; // Azul
          default: return 'bg-slate-100 text-slate-700 border-slate-200';
      }
  };

  const getRoleIcon = (role: string) => {
      switch(role) {
          case 'DIRECTOR': return <Shield size={12} />;
          case 'ADMIN': return <Briefcase size={12} />;
          case 'SALES': return <User size={12} />;
          case 'DESIGN': return <PenTool size={12} />;
          case 'WAREHOUSE': return <Package size={12} />;
          case 'PRODUCTION': return <Hammer size={12} />;
          default: return <UserCog size={12} />;
      }
  };

  // --- MANEJADORES ---

  const handleEditClick = (user: any) => {
      setForm({
          full_name: user.full_name,
          email: user.email,
          password: '', 
          role: user.role, 
          is_active: user.is_active,
          commission_rate: user.commission_rate || 0 
      });
      setEditingId(user.id);
      setIsEditing(true);
      setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm("⚠️ ¿Estás seguro de eliminar este usuario permanentemente?")) {
      await deleteUser(id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.full_name || !form.email) {
        alert("Nombre y Email son obligatorios");
        return;
    }

    let result;
    const payload: any = { ...form };
    payload.commission_rate = parseFloat(payload.commission_rate.toString());

    if (isEditing && editingId) {
        if (!payload.password) delete payload.password;
        result = await updateUser(editingId, payload);
    } else {
        if (!form.password) {
            alert("La contraseña es obligatoria para nuevos usuarios");
            return;
        }
        result = await createUser(payload);
    }

    if (result.success) {
        resetForm();
    } else {
        alert(`Error: ${result.error}`);
    }
  };

  const resetForm = () => {
    setForm(initialForm);
    setIsEditing(false);
    setEditingId(null);
    setShowForm(false);
  };

  return (
    <div className="space-y-6 p-6 pb-24 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <UserCog className="text-indigo-600" /> Gestión de Usuarios
          </h1>
          <p className="text-slate-500 text-sm">Control de acceso y roles del personal.</p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={fetchUsers}
                className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Refrescar lista"
            >
                <RefreshCw size={20} />
            </button>
            <button 
                onClick={() => { resetForm(); setShowForm(true); }}
                className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 shadow-md font-medium transition-all"
            >
                <Plus size={18} /> Nuevo Usuario
            </button>
        </div>
      </div>

      {/* FORMULARIO MODAL */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center">
                    <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                        {isEditing ? <Pencil size={18}/> : <Plus size={18}/>}
                        {isEditing ? 'Editar Usuario' : 'Registrar Usuario'}
                    </h3>
                    <button onClick={resetForm} className="text-slate-400 hover:text-red-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Nombre */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Nombre Completo</label>
                        <div className="relative mt-1">
                            <UserCog size={18} className="absolute left-3 top-2.5 text-slate-400"/>
                            <input 
                                className="w-full pl-10 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                                placeholder="Ej. Juan Pérez"
                                value={form.full_name}
                                onChange={e => setForm({...form, full_name: e.target.value})}
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Email */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Correo Electrónico</label>
                        <div className="relative mt-1">
                            <Mail size={18} className="absolute left-3 top-2.5 text-slate-400"/>
                            <input 
                                type="email"
                                className="w-full pl-10 p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                                placeholder="usuario@empresa.com"
                                value={form.email}
                                onChange={e => setForm({...form, email: e.target.value})}
                            />
                        </div>
                    </div>

                    {/* GRUPO DE ROL Y COMISIÓN */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Rol */}
                        <div className={form.role === 'SALES' ? '' : 'col-span-2'}>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Rol</label>
                            <div className="relative mt-1">
                                <Shield size={18} className="absolute left-3 top-2.5 text-slate-400"/>
                                <select 
                                    className="w-full pl-10 p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={form.role}
                                    onChange={e => setForm({...form, role: e.target.value})}
                                >
                                    {Object.entries(ROLE_OPTIONS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* COMISIÓN (Solo visible si es Ventas) */}
                        {form.role === 'SALES' && (
                             <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                                <label className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Comisión (%)</label>
                                <div className="relative mt-1">
                                    <Percent size={18} className="absolute left-3 top-2.5 text-emerald-500"/>
                                    <input 
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        className="w-full pl-10 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all outline-none font-bold text-emerald-700" 
                                        placeholder="0.0"
                                        value={form.commission_rate}
                                        onChange={e => setForm({...form, commission_rate: parseFloat(e.target.value)})}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Contraseña */}
                    <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                        <label className="text-xs font-bold text-orange-800 uppercase tracking-wide flex items-center gap-1">
                            <Key size={14}/> {isEditing ? 'Cambiar Contraseña' : 'Contraseña Inicial'}
                        </label>
                        <input 
                            type="text" 
                            className="w-full mt-2 p-2.5 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-200 outline-none bg-white" 
                            placeholder={isEditing ? "Dejar vacío para mantener" : "Mínimo 4 caracteres"}
                            value={form.password}
                            onChange={e => setForm({...form, password: e.target.value})}
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={resetForm} className="flex-1 py-2.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" className="flex-1 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all">
                            {isEditing ? 'Actualizar' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* LISTADO */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">ID</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Usuario</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Rol</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Estado</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {loading ? (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">Cargando usuarios...</td></tr>
                ) : users.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-slate-400 text-xs font-mono">#{user.id}</td>
                        <td className="px-6 py-4">
                            <div className="flex flex-col">
                                <span className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                                    {user.full_name}
                                    {/* BADGE DE COMISIÓN */}
                                    {user.role === 'SALES' && (
                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 font-bold font-mono flex items-center gap-0.5">
                                           <Percent size={8}/> {user.commission_rate}%
                                        </span>
                                    )}
                                </span>
                                <span className="text-xs text-slate-500">{user.email}</span>
                            </div>
                        </td>
                        
                        {/* COLUMNA DE ROL CON COLOR CORRECTO */}
                        <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-bold uppercase tracking-wide ${getRoleBadgeClasses(user.role)}`}>
                                {getRoleIcon(user.role)}
                                {ROLE_OPTIONS[user.role as keyof typeof ROLE_OPTIONS] || user.role}
                            </span>
                        </td>
                        
                        <td className="px-6 py-4 text-center">
                            {user.is_active ? 
                                <span className="inline-flex items-center gap-1 text-green-600 text-[10px] font-bold bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                                    <CheckCircle size={10}/> ACTIVO
                                </span> 
                                : 
                                <span className="text-slate-400 text-[10px] font-medium bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">INACTIVO</span>
                            }
                        </td>
                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                            <button 
                                onClick={() => handleEditClick(user)} 
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Editar"
                            >
                                <Pencil size={16}/>
                            </button>
                            <button 
                                onClick={() => user.id && handleDelete(user.id)} 
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Eliminar"
                            >
                                <Trash2 size={16}/>
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
}