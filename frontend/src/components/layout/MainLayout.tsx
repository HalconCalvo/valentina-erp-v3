import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function MainLayout() {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* 1. Sidebar Fijo a la izquierda (Width 64 = 16rem = 256px) */}
      <Sidebar />

      {/* 2. Columna Derecha (Contenido) */}
      {/* ml-64: Deja el espacio para que el Sidebar no tape nada */}
      <div className="flex-1 flex flex-col ml-64 transition-all duration-300 h-screen">
        
        {/* Header Superior */}
        <Header />

        {/* 3. Área Scrollable */}
        {/* overflow-y-auto: Permite que solo el contenido haga scroll, no toda la página */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-6">
          <div className="max-w-7xl mx-auto">
            {/* Aquí se inyectan las páginas (Ventas, Dashboard, etc.) */}
            <Outlet /> 
          </div>
        </main>

      </div>
    </div>
  );
}