import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Preloader from './components/Preloader/Preloader';
import MainLayout from './components/Layout/MainLayout';
import { ToastContainer } from './components/Common/Toast';
import { RegistrosProvider, useRegistrosContext } from './context/RegistrosContext';
import { DrawerProvider } from './context/DrawerContext';

// Pages
import Inicio from './pages/Dashboard/Inicio';
import FinanzasHub from './pages/Finanzas/FinanzasHub';
import Ingresos from './pages/Finanzas/Ingresos';
import Gastos from './pages/Finanzas/Gastos';
import Descuentos from './pages/Finanzas/Descuentos';
import Prestamos from './pages/Finanzas/Prestamos';
import ReportesHub from './pages/Reportes/ReportesHub';
import Resumen from './pages/Finanzas/Resumen';
import VehiculosHub from './pages/Vehiculos/VehiculosHub';
import Inventario from './pages/Vehiculos/Inventario';
import VehiculoDetalle from './pages/Vehiculos/VehiculoDetalle';
import OperacionesHub from './pages/Operaciones/OperacionesHub';
import Mantenimiento from './pages/Operaciones/Mantenimiento';
import Documentacion from './pages/Operaciones/Documentacion';
import ControlGlobal from './pages/Operaciones/ControlGlobal';
import RegistroTiempo from './pages/Operaciones/RegistroTiempo';
import Conductores from './pages/Operaciones/Conductores';
import Logros from './pages/Logros/Logros';
import Configuracion from './pages/Configuracion/Configuracion';

const AppContent: React.FC = () => {
  const { toasts, removeToast } = useRegistrosContext();

  return (
    <>
      <BrowserRouter>
        <MainLayout>
          <Routes>
            {/* Dashboard HUB */}
            <Route path="/" element={<Inicio />} />

            {/* Finanzas */}
            <Route path="/finanzas" element={<FinanzasHub />} />
            <Route path="/finanzas/ingresos" element={<Ingresos />} />
            <Route path="/finanzas/gastos" element={<Gastos />} />
            <Route path="/finanzas/descuentos" element={<Descuentos />} />
            <Route path="/finanzas/prestamos" element={<Prestamos />} />
            <Route path="/finanzas/reportes" element={<ReportesHub />} />
            <Route path="/finanzas/resumen" element={<Resumen />} />

            {/* Vehículos */}
            <Route path="/vehiculos" element={<VehiculosHub />} />
            <Route path="/vehiculos/inventario" element={<Inventario />} />
            <Route path="/vehiculos/rentabilidad" element={<ReportesHub />} />
            <Route path="/vehiculos/:id" element={<VehiculoDetalle />} />

            {/* Operaciones */}
            <Route path="/operaciones" element={<OperacionesHub />} />
            <Route path="/operaciones/mantenimiento" element={<Mantenimiento />} />
            <Route path="/operaciones/docs" element={<Documentacion />} />
            <Route path="/operaciones/control-global" element={<ControlGlobal />} />
            <Route path="/operaciones/tiempo" element={<RegistroTiempo />} />
            <Route path="/operaciones/conductores" element={<Conductores />} />

            {/* Reportes */}
            <Route path="/reportes" element={<ReportesHub />} />

            {/* Logros */}
            <Route path="/logros" element={<Logros />} />

            {/* Configuración */}
            <Route path="/configuracion" element={<Configuracion />} />

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MainLayout>
      </BrowserRouter>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
};

const App: React.FC = () => {
  const [showPreloader, setShowPreloader] = useState(true);

  if (showPreloader) {
    return <Preloader onComplete={() => setShowPreloader(false)} />;
  }

  return (
    <RegistrosProvider>
      <DrawerProvider>
        <AppContent />
      </DrawerProvider>
    </RegistrosProvider>
  );
};

export default App;
