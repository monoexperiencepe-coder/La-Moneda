import React, { useEffect, useState } from 'react';

interface PreloaderProps {
  onComplete: () => void;
}

const Preloader: React.FC<PreloaderProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const [currentPhrase, setCurrentPhrase] = useState(0);

  const phrases = [
    'Cargando tu gestión financiera...',
    'Inicializando registros de vehículos...',
    'Preparando panel de control...',
    'Listo para gestionar tu flota...',
  ];

  useEffect(() => {
    const phraseInterval = setInterval(() => {
      setCurrentPhrase(prev => (prev + 1) % phrases.length);
    }, 1200);

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return prev;
        return prev + Math.random() * 18 + 2;
      });
    }, 280);

    const completeTimer = setTimeout(() => {
      setProgress(100);
      clearInterval(progressInterval);
      setTimeout(() => {
        setFadingOut(true);
        setTimeout(onComplete, 700);
      }, 300);
    }, 5000);

    return () => {
      clearInterval(phraseInterval);
      clearInterval(progressInterval);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  const clampedProgress = Math.min(Math.round(progress), 100);

  return (
    <div
      className={`
        fixed inset-0 z-[200] flex flex-col items-center justify-center
        bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-50
        transition-opacity duration-700 ease-in-out
        ${fadingOut ? 'opacity-0' : 'opacity-100'}
      `}
    >
      {/* Background decorative orbs */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-indigo-200/30 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-purple-200/30 rounded-full blur-3xl" />

      <div className="relative z-10 flex flex-col items-center text-center px-8">
        {/* Spinner + Coin icon */}
        <div className="relative w-24 h-24 mb-8">
          <svg
            className="w-24 h-24 animate-spin"
            style={{ animationDuration: '2s' }}
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="spinnerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4F46E5" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
            </defs>
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="4"
            />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="url(#spinnerGrad)"
              strokeWidth="4"
              strokeDasharray="276"
              strokeDashoffset="200"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full flex items-center justify-center shadow-soft-md">
              <span className="text-2xl">🪙</span>
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-transparent mb-2 tracking-tight">
          LA MONEDA
        </h1>
        <p className="text-sm text-gray-500 mb-1 font-medium">Sistema de Gestión Financiera</p>
        <p className="text-gray-400 text-xs mb-10 font-medium tracking-wide uppercase">
          Flota de Taxis & InDrive
        </p>

        {/* Animated phrase */}
        <div className="h-5 mb-6">
          <p className="text-sm text-gray-500 animate-pulse">
            {phrases[currentPhrase]}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-72">
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 via-secondary-500 to-blue-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs text-gray-400">Iniciando sistema...</p>
            <p className="text-xs font-semibold text-primary-500">{clampedProgress}%</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Preloader;
