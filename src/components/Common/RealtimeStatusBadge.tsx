import React from 'react';
import { Radio } from 'lucide-react';

type Props = {
  connected: boolean;
};

const RealtimeStatusBadge: React.FC<Props> = ({ connected }) => {
  if (!connected) return null;
  return (
    <span
      className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-200/90 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
      title="Los cambios en gastos se sincronizan entre cuentas conectadas"
    >
      <Radio size={10} className="text-emerald-600" aria-hidden />
      Actualizado en vivo
    </span>
  );
};

export default RealtimeStatusBadge;
