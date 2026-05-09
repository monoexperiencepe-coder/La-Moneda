import React from 'react';
import { Navigate } from 'react-router-dom';

/** Compatibilidad: la vista vive en `/finanzas/financiamiento`. */
const Prestamos: React.FC = () => <Navigate to="/finanzas/financiamiento" replace />;

export default Prestamos;
