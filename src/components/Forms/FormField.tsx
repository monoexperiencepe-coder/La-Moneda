import React from 'react';

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  helper?: string;
  className?: string;
}

const FormField: React.FC<FormFieldProps> = ({ label, required, error, children, helper, className = '' }) => (
  <div className={`w-full ${className}`}>
    <label className="label">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    {helper && !error && <p className="mt-1 text-xs text-gray-400">{helper}</p>}
  </div>
);

export default FormField;
