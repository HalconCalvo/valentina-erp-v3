ESTO ES UN ERROR FORZADO PARA VER SI VITE REACCIONA
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import ProtectedRoute from './ProtectedRoute';
import LoginPage from '../modules/auth/pages/LoginPage';
import ConfigPage from '../modules/foundations/pages/ConfigPage';
import UsersPage from '../modules/auth/UsersPage';
import MaterialsPage from '../modules/foundations/pages/MaterialsPage';
import ProvidersPage from '../modules/foundations/pages/ProvidersPage';
import ClientsPage from '../modules/foundations/pages/ClientsPage';
import InventoryReceptionPage from '../modules/foundations/pages/InventoryReceptionPage';
import ReceptionHistoryPage from '../modules/foundations/pages/ReceptionHistoryPage';
import AccountsPayablePage from '../modules/management/pages/AccountsPayablePage';
import TaxRatesPage from '../modules/foundations/pages/TaxRatesPage';
import CreateQuotePage from '../modules/sales/pages/CreateQuotePage';
import SalesDashboardPage from '../modules/sales/pages/SalesDashboardPage';
import TreasuryPage from '../modules/treasury/pages/TreasuryPage';
import ManagementDashboard from '../modules/management/pages/ManagementDashboard';
import DesignCatalogPage from '../modules/design/pages/DesignCatalogPage';
import DesignBuilderPage from '../modules/design/pages/DesignBuilderPage';
import Home from '../Home';

export default function AppRoutes() {
  // Diagnóstico para ver en consola si esta versión ya cargó
  console.log("📍 Mapa de rutas actualizado cargado correctamente.");

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      
      <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        
        {/* Foundations / Catálogos Maestros */}
        <Route path="/materials" element={<MaterialsPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        
        {/* --- ALMACÉN --- */}
        {/* Ruta principal (Historial) */}
        <Route path="/inventory" element={<ReceptionHistoryPage />} /> 
        {/* Ruta secundaria (Captura) */}
        <Route path="/inventory/reception" element={<InventoryReceptionPage />} />
        
        {/* Finanzas / Tesorería */}
        <Route path="/finance/payable" element={<AccountsPayablePage />} />
        <Route path="/tax-rates" element={<TaxRatesPage />} />
        <Route path="/treasury" element={<TreasuryPage />} />
        <Route path="/management" element={<ManagementDashboard />} />
        
        {/* Ventas */}
        <Route path="/sales" element={<SalesDashboardPage />} />
        <Route path="/sales/new-quote" element={<CreateQuotePage />} />
        <Route path="/sales/edit/:id" element={<CreateQuotePage />} />
        
        {/* Diseño */}
        <Route path="/design" element={<DesignCatalogPage />} />
        <Route path="/design/builder/:id" element={<DesignBuilderPage />} />
        <Route path="/design/builder/new" element={<DesignBuilderPage />} />

        {/* Módulos en Construcción */}
        <Route path="/production" element={<div className="p-8"><h1 className="text-2xl font-bold text-slate-800">Módulo de Producción en construcción</h1></div>} />
        <Route path="/logistics" element={<div className="p-8"><h1 className="text-2xl font-bold text-slate-800">Módulo de Logística en construcción</h1></div>} />

        {/* Configuración y Usuarios */}
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/users" element={<UsersPage />} />
      </Route>

      {/* Si la ruta no existe, regresar al Home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}