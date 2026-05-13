import React, { Suspense, lazy, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Preloader from './components/Preloader/Preloader';
import MainLayout from './components/Layout/MainLayout';
import { ToastContainer } from './components/Common/Toast';
import { RegistrosProvider, useRegistrosContext } from './context/RegistrosContext';
import { AuthProvider, useAuth } from './context/AuthContext';

// Auth
const Login = lazy(() => import('./pages/Auth/Login'));

// Pages
const Inicio = lazy(() => import('./pages/Dashboard/Inicio'));
const FinanzasHub = lazy(() => import('./pages/Finanzas/FinanzasHub'));
const Ingresos = lazy(() => import('./pages/Finanzas/Ingresos'));
const Gastos = lazy(() => import('./pages/Finanzas/Gastos'));
const Inversiones = lazy(() => import('./pages/Finanzas/Inversiones'));
const InversionesUtilidad = lazy(() => import('./pages/Finanzas/InversionesUtilidad'));
const InversionesGenerales = lazy(() => import('./pages/Finanzas/InversionesGenerales'));
const GastosCaja = lazy(() => import('./pages/Finanzas/GastosCaja'));
const CajaNegocio = lazy(() => import('./pages/Finanzas/CajaNegocio'));
const Descuentos = lazy(() => import('./pages/Finanzas/Descuentos'));
const Prestamos = lazy(() => import('./pages/Finanzas/Prestamos'));
const Financiamiento = lazy(() => import('./pages/Finanzas/Financiamiento'));
const FinanciamientoPrestamos = lazy(() => import('./pages/Finanzas/FinanciamientoPrestamos'));
const FinanciamientoAportes = lazy(() => import('./pages/Finanzas/FinanciamientoAportes'));
const ReportesHub = lazy(() => import('./pages/Reportes/ReportesHub'));
const Resumen = lazy(() => import('./pages/Finanzas/Resumen'));
const RevisionClasificacion = lazy(() => import('./pages/Finanzas/RevisionClasificacion'));
const VehiculosHub = lazy(() => import('./pages/Vehiculos/VehiculosHub'));
const Inventario = lazy(() => import('./pages/Vehiculos/Inventario'));
const VehiculoDetalle = lazy(() => import('./pages/Vehiculos/VehiculoDetalle'));
const OperacionesHub = lazy(() => import('./pages/Operaciones/OperacionesHub'));
const Mantenimiento = lazy(() => import('./pages/Operaciones/Mantenimiento'));
const Documentacion = lazy(() => import('./pages/Operaciones/Documentacion'));
const ControlGlobal = lazy(() => import('./pages/Operaciones/ControlGlobal'));
const RegistroTiempo = lazy(() => import('./pages/Operaciones/RegistroTiempo'));
const Conductores = lazy(() => import('./pages/Operaciones/Conductores'));
const Pendientes = lazy(() => import('./pages/Operaciones/Pendientes'));
const Metas = lazy(() => import('./pages/Metas/Metas'));
const Configuracion = lazy(() => import('./pages/Configuracion/Configuracion'));
const HistorialSistema = lazy(() => import('./pages/Admin/HistorialSistema'));

const RouteSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-4 p-4 sm:p-6">
    <div className="h-6 w-52 rounded bg-gray-200" />
    <div className="h-24 w-full rounded-xl bg-gray-100" />
    <div className="h-24 w-full rounded-xl bg-gray-100" />
    <div className="h-24 w-full rounded-xl bg-gray-100" />
  </div>
);

/** Spinner mientras se verifica la sesión de Supabase. */
const AuthLoadingScreen: React.FC = () => (
  <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-slate-950">
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full blur-[130px]"
        style={{ background: 'rgba(99,102,241,0.15)' }} />
      <div className="absolute -bottom-40 -right-20 w-[420px] h-[420px] rounded-full blur-[110px]"
        style={{ background: 'rgba(139,92,246,0.10)' }} />
    </div>
    <div className="relative z-10 flex flex-col items-center gap-4">
      <div className="w-10 h-10 rounded-full border-[3px] border-indigo-800 border-t-indigo-400 animate-spin" />
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Verificando sesión…
      </p>
    </div>
  </div>
);

/** Protege rutas: redirige a /login si no hay sesión. */
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
};

/** Solo accesible para admin. */
const AdminOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const { toasts, removeToast } = useRegistrosContext();

  return (
    <>
      <BrowserRouter>
        <Suspense fallback={<RouteSkeleton />}>
          <Routes>
            {/* Ruta pública */}
            <Route path="/login" element={<Login />} />

            {/* Rutas protegidas */}
            <Route
              path="/*"
              element={
                <PrivateRoute>
                  <MainLayout>
                    <Suspense fallback={<RouteSkeleton />}>
                      <Routes>
                        {/* Dashboard */}
                        <Route path="/" element={<Inicio />} />

                        {/* Finanzas */}
                        <Route path="/finanzas" element={<FinanzasHub />} />
                        <Route path="/finanzas/ingresos" element={<Ingresos />} />
                        <Route path="/finanzas/gastos" element={<Gastos />} />
                        <Route path="/finanzas/inversiones" element={<Inversiones />} />
                        <Route path="/finanzas/inversiones/utilidad" element={<InversionesUtilidad />} />
                        <Route path="/finanzas/inversiones/generales" element={<InversionesGenerales />} />
                        <Route path="/finanzas/gastos-caja" element={<GastosCaja />} />
                        <Route path="/finanzas/caja-negocio" element={<CajaNegocio />} />
                        <Route path="/finanzas/descuentos" element={<Descuentos />} />
                        <Route path="/finanzas/financiamiento" element={<Financiamiento />} />
                        <Route path="/finanzas/financiamiento/prestamos" element={<FinanciamientoPrestamos />} />
                        <Route path="/finanzas/financiamiento/aportes" element={<FinanciamientoAportes />} />
                        <Route path="/finanzas/prestamos" element={<Prestamos />} />
                        <Route path="/finanzas/reportes" element={<ReportesHub />} />
                        <Route path="/finanzas/resumen" element={<Resumen />} />
                        <Route path="/finanzas/revision-clasificacion" element={<RevisionClasificacion />} />

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
                        <Route path="/operaciones/pendientes" element={<Pendientes />} />

                        {/* Reportes */}
                        <Route path="/reportes" element={<ReportesHub />} />

                        {/* Metas */}
                        <Route path="/metas" element={<Metas />} />
                        <Route path="/logros" element={<Navigate to="/metas" replace />} />

                        {/* Config */}
                        <Route path="/configuracion" element={<Configuracion />} />
                        <Route
                          path="/admin/historial-sistema"
                          element={
                            <AdminOnly>
                              <HistorialSistema />
                            </AdminOnly>
                          }
                        />

                        {/* Catch all */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </Suspense>
                  </MainLayout>
                </PrivateRoute>
              }
            />
          </Routes>
        </Suspense>
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
    <AuthProvider>
      <RegistrosProvider>
        <AppContent />
      </RegistrosProvider>
    </AuthProvider>
  );
};

export default App;
