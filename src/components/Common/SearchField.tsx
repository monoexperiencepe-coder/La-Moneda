import React from 'react';
import { Loader2, Search, X } from 'lucide-react';

export type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  /** Esperando debounce local. */
  debouncing?: boolean;
  /** Carga server-side (p. ej. fetch historial). */
  loading?: boolean;
  onClear?: () => void;
  id?: string;
  'aria-describedby'?: string;
  disabled?: boolean;
  type?: 'search' | 'text';
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onFocus?: () => void;
  onBlur?: () => void;
};

const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
  inputClassName = 'input-field pl-9 text-sm',
  debouncing = false,
  loading = false,
  onClear,
  id,
  'aria-describedby': ariaDescribedBy,
  disabled = false,
  type = 'text',
  inputRef,
  onFocus,
  onBlur,
}) => {
  const showSpinner = debouncing || loading;
  const showClear = Boolean(value) && onClear && !showSpinner;

  return (
    <div className={`relative ${className}`}>
      <Search
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        aria-hidden
      />
      <input
        ref={inputRef}
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        aria-describedby={ariaDescribedBy}
        autoComplete="off"
        spellCheck={false}
        className={`${inputClassName}${showSpinner ? ' pr-9' : showClear ? ' pr-9' : ''}`}
      />
      {showSpinner ? (
        <Loader2
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-indigo-400 pointer-events-none"
          aria-hidden
        />
      ) : showClear ? (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          aria-label="Limpiar búsqueda"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
};

export default SearchField;
