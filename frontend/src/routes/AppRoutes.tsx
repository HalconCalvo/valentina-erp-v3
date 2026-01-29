import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Layout
import MainLayout from '../components/layout/MainLayout';

// Pages - Foundations
import ConfigPage from '../modules/foundations/pages/ConfigPage';
import MaterialsPage from '../modules/foundations/pages/MaterialsPage';
import TaxRatesPage from '../modules/foundations/pages/TaxRatesPage';
import ClientsPage from '../modules/foundations/pages/ClientsPage';
import ProvidersPage from '../modules/foundations/pages/ProvidersPage';

// Pages - Inventory
import InventoryReceptionPage from '../modules/foundations/pages/InventoryReceptionPage';

// Pages - Design (INGENIERÍA)
import DesignCatalogPage from '../modules/design/pages/DesignCatalogPage';
import DesignBuilderPage from '../modules/design/pages/DesignBuilderPage'; 

// Pages - Sales (VENTAS)
import SalesDashboardPage from '../modules/sales/pages/SalesDashboardPage';
import CreateQuotePage from '../modules/sales/pages/CreateQuotePage';

// Pages - Management (GERENCIA)
import ManagementDashboard from '../modules/management/pages/ManagementDashboard';

// Pages - Auth
import UsersPage from '../modules/auth/UsersPage';

export const AppRoutes = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Layout Principal */}
        <Route element={<MainLayout />}>
            
            {/* Redirección inicial */}
            <Route path="/" element={<Navigate to="/materials" replace />} />
            
            {/* --- GERENCIA (Torre de Control) --- */}
            <Route path="/management" element={<ManagementDashboard />} />

            {/* --- CIMIENTOS (Catálogos) --- */}
            <Route path="/materials" element={<MaterialsPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/tax-rates" element={<TaxRatesPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/providers" element={<ProvidersPage />} />
            
            {/* --- INVENTARIO Y OPERACIONES --- */}
            <Route path="/inventory/reception" element={<InventoryReceptionPage />} />
            
            {/* --- SEGURIDAD --- */}
            <Route path="/users" element={<UsersPage />} />

            {/* --- INGENIERÍA (Design) --- */}
            <Route path="/design" element={<DesignCatalogPage />} />
            <Route path="/design/versions/:id" element={<DesignBuilderPage />} />

            {/* --- VENTAS (Sales) --- */}
            <Route path="/sales" element={<SalesDashboardPage />} />
            <Route path="/sales/new" element={<CreateQuotePage />} />
            
            {/* 👇👇 ESTA ES LA LÍNEA QUE FALTABA PARA QUE FUNCIONE EL LÁPIZ 👇👇 */}
            <Route path="/sales/edit/:id" element={<CreateQuotePage />} />

            {/* --- OPERATIVOS (Placeholders) --- */}
            <Route path="/production" element={<div className="p-10 text-slate-400 font-bold">Módulo de Fábrica en Construcción...</div>} />
            <Route path="/logistics" element={<div className="p-10 text-slate-400 font-bold">Módulo de Logística en Construcción...</div>} />
          
        </Route>
      </Routes>
    </BrowserRouter>
  );
};