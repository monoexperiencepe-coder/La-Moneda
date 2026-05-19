import React from 'react';
import { useLocation } from 'react-router-dom';

/** Fade suave al cambiar de ruta (sin pantallazo vacío extra). */
const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="content-enter min-h-[12rem]">
      {children}
    </div>
  );
};

export default PageTransition;
