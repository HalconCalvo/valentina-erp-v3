import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// LAYOUT PRINCIPAL
import MainLayout from './components/layout/MainLayout';

// 1. HOME
import Home from './Home'; 

// 2. AUTH
import LoginPage from './modules/auth/LoginPage'; 
import UsersPage from './modules/auth/UsersPage'; 

// 3. FUNDAMENTOS
import MaterialsPage from './modules/foundations/pages/MaterialsPage';
import ProvidersPage from './modules/foundations/pages/ProvidersPage';
import ClientsPage from './modules/foundations/pages/ClientsPage';
import TaxRatesPage from './modules/foundations/pages/TaxRatesPage';
import ConfigPage from './modules/foundations/pages/ConfigPage';

// 4. DISEÑO
import DesignCatalogPage from './modules/design/pages/DesignCatalogPage';
import DesignBuilderPage from './modules/design/pages/DesignBuilderPage'; 

// 5. VENTAS
import SalesDashboardPage from './modules/sales/pages/SalesDashboardPage';
import CreateQuotePage from './modules/sales/pages/CreateQuotePage';

// 6. INVENTARIO (¡AQUÍ IMPORTAMOS LA PANTALLA NUEVA!)
import InventoryReceptionPage from './modules/foundations/pages/InventoryReceptionPage';
import ReceptionHistoryPage from './modules/foundations/pages/ReceptionHistoryPage';

// 7. GERENCIA
import ManagementDashboard from './modules/management/pages/ManagementDashboard';

// 8. TESORERÍA
import { TreasuryPage } from './modules/treasury/pages/TreasuryPage';

// --- GUARDIA DE SEGURIDAD ---
const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* 1. RUTA PÚBLICA (Login) */}
        <Route path="/login" element={<LoginPage />} />

        {/* 2. RUTAS PRIVADAS (Envueltas en MainLayout) */}
        <Route element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
            {/* Dashboard */}
            <Route path="/" element={<Home />} />

            {/* Fundamentos */}
            <Route path="/materials" element={<MaterialsPage />} />
            <Route path="/providers" element={<ProvidersPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/tax-rates" element={<TaxRatesPage />} />
            <Route path="/config" element={<ConfigPage />} />

            {/* Usuarios */}
            <Route path="/users" element={<UsersPage />} />
            
            {/* Diseño */}
            <Route path="/design" element={<DesignCatalogPage />} />
            <Route path="/design/versions/:id" element={<DesignBuilderPage />} />

            {/* Ventas */}
            <Route path="/sales" element={<SalesDashboardPage />} />
            <Route path="/sales/new" element={<CreateQuotePage />} />
            <Route path="/sales/edit/:id" element={<CreateQuotePage />} />

            {/* --- INVENTARIO (RUTAS CORREGIDAS) --- */}
            <Route path="/inventory" element={<ReceptionHistoryPage />} />
            <Route path="/inventory/history" element={<Navigate to="/inventory" replace />} />
            <Route path="/inventory/reception" element={<InventoryReceptionPage />} />

            {/* Tesorería */}
            <Route path="/treasury" element={<TreasuryPage />} />

            {/* Gerencia */}
            <Route path="/management" element={<ManagementDashboard />} />
        </Route>
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;