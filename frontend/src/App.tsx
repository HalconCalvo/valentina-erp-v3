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
import SimulatorPage from './modules/design/pages/SimulatorPage'; 

// 5. VENTAS
import SalesDashboardPage from './modules/sales/pages/SalesDashboardPage';
import CreateQuotePage from './modules/sales/pages/CreateQuotePage';

// 6. INVENTARIO 
import InventoryReceptionPage from './modules/foundations/pages/InventoryReceptionPage';
import ReceptionHistoryPage from './modules/foundations/pages/ReceptionHistoryPage';
// ---> NUEVO TABLERO MAESTRO DE COMPRAS Y ALMACÉN <---
import InventoryDashboardPage from './modules/foundations/pages/InventoryDashboardPage';

// 7. DIRECCIÓN Y GERENCIA (La División Estratégica vs Operativa)
import DirectorDashboard from './modules/director/pages/DirectorDashboard'; 
import ManagementDashboard from './modules/management/pages/ManagementDashboard';

// 8. Tesorería
import { TreasuryPage } from './modules/treasury/pages/TreasuryPage';

// ---> 8.5 FINANZAS (NUESTRO REPORTE UNIVERSAL) <---
import AgingReportPage from './modules/finance/pages/AgingReportPage';
import PendingToInvoicePage from './modules/finance/pages/PendingToInvoicePage'; 

// 9. PRODUCCIÓN (¡NUEVO V3.5!)
import FactoryFloorPage from './modules/production/pages/FactoryFloorPage';

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
            <Route path="/design/simulator" element={<SimulatorPage />} /> 

            {/* Ventas */}
            <Route path="/sales" element={<SalesDashboardPage />} />
            <Route path="/sales/new" element={<CreateQuotePage />} />
            <Route path="/sales/edit/:id" element={<CreateQuotePage />} />

            {/* --- INVENTARIO / COMPRAS --- */}
            <Route path="/inventory" element={<InventoryDashboardPage />} /> {/* <--- EL NUEVO TABLERO */}
            <Route path="/inventory/history" element={<Navigate to="/inventory" replace />} />
            <Route path="/inventory/reception" element={<InventoryReceptionPage />} />
            
            {/* Tesorería y Finanzas */}
            <Route path="/treasury" element={<TreasuryPage />} />
            <Route path="/finance/aging" element={<AgingReportPage />} /> 
            <Route path="/finance/pending-invoices" element={<PendingToInvoicePage />} /> 

            {/* ---> DIRECCIÓN Y GERENCIA <--- */}
            <Route path="/director" element={<DirectorDashboard />} /> 
            <Route path="/management" element={<ManagementDashboard />} />

            {/* --- PRODUCCIÓN V3.5 --- */}
            <Route path="/production" element={<FactoryFloorPage />} />
        </Route>
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;