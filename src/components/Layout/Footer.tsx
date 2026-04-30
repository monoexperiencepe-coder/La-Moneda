import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="border-t border-gray-100 bg-white mt-auto">
      <div className="max-w-screen-2xl mx-auto px-6 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🪙</span>
            <span className="text-sm font-semibold text-gradient">LA MONEDA</span>
            <span className="text-xs text-gray-400">— Sistema de Gestión Financiera</span>
          </div>
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} La Moneda · Todos los derechos reservados
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
