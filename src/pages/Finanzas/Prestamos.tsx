import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * Préstamos y abonos no persisten en Supabase desde esta app.
 * Ver `PERSISTENCIA_REPORTE.md`.
 */
const Prestamos: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in max-w-lg">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/finanzas')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Préstamos</h1>
      </div>
      <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-5 py-4 text-sm text-sky-950">
        <p className="font-semibold mb-2">Esta sección está desactivada en la interfaz</p>
        <p className="text-sky-900/90">
          Los préstamos y abonos eran solo locales. No se muestran formularios hasta tener tablas en Supabase y servicios
          de alta/baja/lectura.
        </p>
        <p className="mt-3 text-xs text-sky-800/90">
          Plan sugerido: tablas <code className="rounded bg-white/80 px-1">prestamos</code> y{' '}
          <code className="rounded bg-white/80 px-1">prestamo_abonos</code> (o equivalente) con <code className="rounded bg-white/80 px-1">empresa_id</code>.
        </p>
      </div>
    </div>
  );
};

export default Prestamos;
