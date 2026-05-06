import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  padding?: boolean;
  hover?: boolean;
}

const Card: React.FC<CardProps> = ({
  children,
  className = '',
  title,
  subtitle,
  action,
  padding = true,
  hover = false,
}) => {
  return (
    <div
      className={`
        bg-white rounded-xl border border-gray-100 shadow-soft
        ${hover ? 'hover:shadow-soft-md hover:-translate-y-0.5 cursor-pointer' : ''}
        transition-all duration-200
        ${padding ? 'p-6' : ''}
        ${className}
      `}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
          <div className="min-w-0 flex-1">
            {title && (
              <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            )}
            {subtitle && (
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
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
