import React from 'react';
import { Ingreso } from '../../data/types';
import { METODOS_INGRESO_RAPIDO } from '../../data/factCatalog';
import MetodoCuentaPicker from '../Common/MetodoCuentaPicker';

interface PagoRapidoIngresoProps {
  metodoPago: string;
  metodoPagoDetalle: string;
  onChange: (payload: { metodoPago: string; metodoPagoDetalle: string; celularMetodo: string | null }) => void;
  ingresos: Ingreso[];
}

const PagoRapidoIngreso: React.FC<PagoRapidoIngresoProps> = ({
  ingresos,
  ...rest
}) => (
  <MetodoCuentaPicker
    {...rest}
    metodosChips={METODOS_INGRESO_RAPIDO}
    registrosForCount={ingresos}
    theme="emerald"
    conteoEtiqueta="ingresos"
  />
);

export default PagoRapidoIngreso;
