import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  padding?: boolean;
  /** Menos padding y tipografía más pequeña (listas densas). */
  compact?: boolean;
  hover?: boolean;
}

const Card: React.FC<CardProps> = ({
  children,
  className = '',
  title,
  subtitle,
  action,
  padding = true,
  compact = false,
  hover = false,
}) => {
  const padClass = !padding ? '' : compact ? 'p-3 sm:p-4' : 'p-6';
  const headerMb = compact ? 'mb-2' : 'mb-4';
  return (
    <div
      className={`
        bg-white rounded-xl border border-gray-100 shadow-soft
        ${hover ? 'hover:shadow-soft-md hover:-translate-y-0.5 cursor-pointer' : ''}
        transition-all duration-200
        ${padClass}
        ${className}
      `}
    >
      {(title || action) && (
        <div className={`flex flex-wrap items-start justify-between gap-x-3 gap-y-1 ${headerMb}`}>
          <div className="min-w-0 flex-1">
            {title && (
              <h3 className={compact ? 'text-sm font-semibold text-gray-900 leading-tight' : 'text-base font-semibold text-gray-900'}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p
                className={
                  compact
                    ? 'text-[10px] text-gray-500 mt-0.5 leading-snug'
                    : 'text-xs text-gray-500 mt-0.5'
                }
              >
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
