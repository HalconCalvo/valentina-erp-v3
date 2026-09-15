import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { VToastContainer } from '@/components/ui/VToast';
import { useHeartbeat } from '@/hooks/useHeartbeat';

// Routes that need full-height fixed layout (no page scroll)
const FIXED_LAYOUT_ROUTES = ['/production/kanban'];

export default function MainLayout() {
  useHeartbeat();
  const location = useLocation();
  const isFixedLayout = FIXED_LAYOUT_ROUTES.some(r => location.pathname.startsWith(r));

  return (
    <VToastContainer>
      <div className="flex h-screen bg-slate-50 font-sans">
      {/* 1. Sidebar Fijo a la izquierda (Width 64 = 16rem = 256px) */}
      <Sidebar />

      {/* 2. Columna Derecha (Contenido) */}
      {/* ml-64: Deja el espacio para que el Sidebar no tape nada */}
      <div className="flex-1 flex flex-col ml-64 transition-all duration-300 h-screen">
        
        {/* Header Superior */}
        <Header />

        {/* 3. Área Scrollable */}
        {/* overflow-y-auto: Permite que solo el contenido haga scroll, no toda la página */}
        {/* overflow-hidden en rutas con layout fijo (kanban) para que las columnas scroll internamente */}
        <main className={`flex-1 overflow-x-auto bg-slate-50 p-6 ${isFixedLayout ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className="w-full h-full">
            {/* Aquí se inyectan las páginas (Ventas, Dashboard, etc.) */}
            <Outlet /> 
          </div>
        </main>

      </div>
      </div>
    </VToastContainer>
  );
}