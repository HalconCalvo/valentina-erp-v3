import React from 'react';
import { Search, Bell, Factory, Wifi } from 'lucide-react';

export default function Header() {
    return (
        <header className="h-14 bg-white border-b border-slate-200 sticky top-0 z-30 px-6 flex items-center justify-between transition-all">
            
            {/* 1. IZQUIERDA: Buscador Global */}
            <div className="flex-1 max-w-lg">
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={16} />
                    <input 
                        type="text" 
                        placeholder="Buscar orden, cliente o material..." 
                        className="w-full pl-9 pr-4 py-1.5 bg-slate-100 border-none rounded-full text-xs font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all outline-none placeholder:text-slate-400"
                    />
                </div>
            </div>

            {/* 2. DERECHA: Planta y Notificaciones */}
            <div className="flex items-center gap-4">
                {/* Indicador de Planta */}
                <div className="hidden lg:flex items-center gap-2 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                    <Factory size={14} className="text-emerald-600" />
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
                        Planta Mérida
                    </span>
                    <span className="w-px h-3 bg-emerald-200 mx-1"></span>
                    <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                        <Wifi size={10}/> Operativo
                    </span>
                </div>

                <div className="h-6 w-px bg-slate-200 hidden lg:block"></div>

                <button className="relative p-1.5 text-slate-400 hover:text-indigo-600 transition-colors">
                    <Bell size={18} />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                </button>
            </div>
        </header>
    );
}