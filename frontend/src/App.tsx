import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';

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
import PrintCenterPage from './modules/design/pages/PrintCenterPage'; 

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

// 10. PLANEACIÓN ESTRATÉGICA: MATRIZ DE 4 CARRILES
import PlanningPage from './modules/planning/pages/PlanningPage';

// 11. LOGÍSTICA E INSTALACIÓN (iPad / cuadrilla)
import InstallerWorkdayPage from './modules/logistics/pages/InstallerWorkdayPage';

// --- GUARDIA DE SEGURIDAD ---
const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

/** Rutas bajo Router: usa pathname como key para remontar páginas al cambiar de módulo. */
function AppRoutes() {
  const location = useLocation();
  const key = location.pathname;

  return (
    <Routes>
      {/* 1. RUTA PÚBLICA (Login) */}
      <Route path="/login" element={<LoginPage />} />

      {/* 2. RUTAS PRIVADAS (Envueltas en MainLayout) */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        {/* Dashboard */}
        <Route path="/" element={<Home key={key} />} />

        {/* Fundamentos */}
        <Route path="/materials" element={<MaterialsPage key={key} />} />
        <Route path="/providers" element={<ProvidersPage key={key} />} />
        <Route path="/clients" element={<ClientsPage key={key} />} />
        <Route path="/tax-rates" element={<TaxRatesPage key={key} />} />
        <Route path="/config" element={<ConfigPage key={key} />} />

        {/* Usuarios */}
        <Route path="/users" element={<UsersPage key={key} />} />

        {/* Diseño */}
        <Route path="/design" element={<DesignCatalogPage key={key} />} />
        <Route path="/design/versions/:id" element={<DesignBuilderPage key={key} />} />
        <Route path="/design/simulator" element={<SimulatorPage key={key} />} />
        <Route path="/design/print-center" element={<PrintCenterPage key={key} />} />

        {/* Ventas */}
        <Route path="/sales" element={<SalesDashboardPage key={key} />} />
        <Route path="/sales/new" element={<CreateQuotePage key={key} />} />
        <Route path="/sales/edit/:id" element={<CreateQuotePage key={key} />} />

        {/* --- INVENTARIO / COMPRAS --- */}
        <Route path="/inventory" element={<InventoryDashboardPage key={key} />} />
        <Route path="/inventory/history" element={<Navigate to="/inventory" replace />} />
        <Route path="/inventory/reception" element={<InventoryReceptionPage key={key} />} />

        {/* Tesorería y Finanzas */}
        <Route path="/treasury" element={<TreasuryPage key={key} />} />
        <Route path="/finance" element={<Navigate to="/finance/aging" replace />} />
        <Route path="/finance/aging" element={<AgingReportPage key={key} />} />
        <Route path="/finance/pending-invoices" element={<PendingToInvoicePage key={key} />} />

        {/* ---> DIRECCIÓN Y GERENCIA <--- */}
        <Route path="/director" element={<DirectorDashboard key={key} />} />
        <Route path="/management" element={<ManagementDashboard key={key} />} />

        {/* --- PRODUCCIÓN V3.5 --- */}
        <Route path="/production" element={<FactoryFloorPage key={key} />} />

        {/* --- PLANEACIÓN ESTRATÉGICA: TABLERO MAESTRO --- */}
        <Route path="/planning" element={<PlanningPage key={key} />} />

        {/* --- LOGÍSTICA E INSTALACIÓN --- */}
        <Route path="/logistics" element={<InstallerWorkdayPage key={key} />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;