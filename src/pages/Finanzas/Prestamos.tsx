import React from 'react';
import { Navigate } from 'react-router-dom';

/** Compatibilidad: la vista nueva vive en `/finanzas/financiamiento/prestamos`. */
const Prestamos: React.FC = () => <Navigate to="/finanzas/financiamiento/prestamos" replace />;

export default Prestamos;
