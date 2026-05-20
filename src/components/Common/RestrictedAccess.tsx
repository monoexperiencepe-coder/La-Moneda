import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { isFinancialOperadorRestricted, type PermissionUser } from '../../utils/permissions';

type Props = {
  user: PermissionUser | null;
  title?: string;
  message?: string;
};

const RestrictedAccess: React.FC<Props> = ({
  user,
  title = 'Acceso restringido',
  message,
}) => {
  const navigate = useNavigate();
  const restricted = isFinancialOperadorRestricted(user);
  const defaultMsg = restricted
    ? 'Tu cuenta solo puede trabajar en Gastos globales y Pendiente de revisión. El resto del panel financiero no está disponible.'
    : 'No tienes permiso para ver esta sección.';

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center animate-fade-in">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 max-w-md shadow-sm">
        <ShieldAlert className="mx-auto mb-3 text-amber-600" size={40} aria-hidden />
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">{message ?? defaultMsg}</p>
        <p className="mt-3 text-[11px] text-slate-500">
          Esta restricción es visual en el navegador. La seguridad definitiva debe reforzarse con políticas RLS en
          Supabase.
        </p>
        {restricted ? (
          <button
            type="button"
            onClick={() => navigate('/finanzas/gastos')}
            className="mt-5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Ir a Gastos permitidos
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
          >
            Volver al inicio
          </button>
        )}
      </div>
    </div>
  );
};

export default RestrictedAccess;
