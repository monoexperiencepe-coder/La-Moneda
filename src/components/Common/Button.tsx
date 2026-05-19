import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

const variantClasses = {
  primary:
    'bg-primary-500 hover:bg-primary-600 text-white shadow-soft hover:shadow-soft-md border border-transparent hover:brightness-[1.03]',
  secondary:
    'bg-white/80 backdrop-blur-sm border border-gray-200/90 text-primary-500 hover:bg-gray-50/90 hover:border-gray-300/90',
  outline:
    'border-2 border-primary-500/90 text-primary-500 hover:bg-primary-50/80 bg-white/70 backdrop-blur-sm',
  danger: 'bg-red-500 hover:bg-red-600 text-white shadow-soft border border-transparent hover:brightness-[1.03]',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100/90 border border-transparent',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs rounded-md',
  md: 'px-5 py-2.5 text-sm rounded-lg',
  lg: 'px-7 py-3 text-base rounded-lg',
};

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  className = '',
  disabled,
  ...props
}) => {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 font-medium
        transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
        active:scale-[0.985] active:transition-transform
        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
        disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {loading ? (
        <Loader2 size={size === 'sm' ? 14 : 16} className="animate-spin" />
      ) : (
        icon && iconPosition === 'left' && icon
      )}
      {children}
      {!loading && icon && iconPosition === 'right' && icon}
    </button>
  );
};

export default Button;
