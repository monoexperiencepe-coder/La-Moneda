import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * Los rebajes/descuentos no tienen aún persistencia en Supabase desde esta app.
 * No se muestra formulario para evitar datos solo en memoria. Ver `PERSISTENCIA_REPORTE.md`.
 */
const Descuentos: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in max-w-lg">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/finanzas')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Descuentos / rebajes</h1>
      </div>
      <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-5 py-4 text-sm text-amber-950">
        <p className="font-semibold mb-2">Esta sección está desactivada en la interfaz</p>
        <p className="text-amber-900/90">
          Antes los rebajes se guardaban solo en la sesión del navegador. Para no generar datos falsos, ya no puedes
          registrarlos aquí hasta que exista una tabla en Supabase y el flujo completo (CRUD).
        </p>
        <p className="mt-3 text-xs text-amber-800/90">
          Plan sugerido: tabla <code className="rounded bg-white/80 px-1">descuentos</code> (o rebajes) con{' '}
          <code className="rounded bg-white/80 px-1">empresa_id</code>, vehículo, categoría, montos y fechas — ver reporte
          en la raíz del repo.
        </p>
      </div>
    </div>
  );
};

export default Descuentos;
