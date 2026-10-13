import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import NewVersionBanner from './NewVersionBanner';
import EnvironmentBanner from './EnvironmentBanner';
import { VToastContainer } from '@/components/ui/VToast';
import { useHeartbeat } from '@/hooks/useHeartbeat';

// Routes that need full-height fixed layout (no page scroll)
const FIXED_LAYOUT_ROUTES = ['/production/kanban', '/design/simulator'];

export default function MainLayout() {
  useHeartbeat();
  const location = useLocation();
  const isFixedLayout = FIXED_LAYOUT_ROUTES.some(r => location.pathname.startsWith(r));
  // Phones and small tablets (Campo): the menu is hidden and opens over the page
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <VToastContainer>
      <div className="flex h-screen bg-slate-50 font-sans">
      {/* 1. Sidebar Fijo a la izquierda (Width 64 = 16rem = 256px) */}
      <Sidebar mobileOpen={menuOpen} onCloseMobile={() => setMenuOpen(false)} />

      {/* 2. Columna Derecha (Contenido) */}
      {/* ml-64: Deja el espacio para que el Sidebar no tape nada */}
      <div className="flex-1 flex flex-col ml-0 md:ml-64 min-w-0 transition-all duration-300 h-screen">
        
        {/* Franja roja del ambiente "Valentina Pruebas" */}
        <EnvironmentBanner />

        {/* Aviso de versión nueva (deploy mientras la pestaña estaba abierta) */}
        <NewVersionBanner />

        {/* Header Superior */}
        <Header onOpenMenu={() => setMenuOpen(true)} />

        {/* 3. Área Scrollable */}
        {/* overflow-y-auto: Permite que solo el contenido haga scroll, no toda la página */}
        {/* overflow-hidden en rutas con layout fijo (kanban) para que las columnas scroll internamente */}
        <main className={`flex-1 overflow-x-auto bg-slate-50 p-3 md:p-6 ${isFixedLayout ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className={isFixedLayout ? 'h-[calc(100vh-3.5rem)] overflow-hidden' : 'w-full h-full'}>
            {/* Aquí se inyectan las páginas (Ventas, Dashboard, etc.) */}
            <Outlet /> 
          </div>
        </main>

      </div>
      </div>
    </VToastContainer>
  );
}