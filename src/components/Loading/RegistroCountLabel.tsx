import React from 'react';

type Props = {
  count: number;
  pending?: boolean;
  updating?: boolean;
  className?: string;
};

/** Contador de registros: nunca muestra "0" durante bootstrap. */
const RegistroCountLabel: React.FC<Props> = ({
  count,
  pending = false,
  updating = false,
  className = '',
}) => {
  if (pending) {
    return (
      <span
        className={`inline-block h-3.5 w-[5.5rem] rounded-md shimmer-bg align-middle ${className}`}
        aria-hidden
      />
    );
  }

  return (
    <span
      className={`text-xs text-gray-400 tabular-nums transition-colors duration-200 ${className}`}
    >
      {count} registro{count === 1 ? '' : 's'}
      {updating ? (
        <span className="ml-1 font-normal text-indigo-400/90">· sincronizando</span>
      ) : null}
    </span>
  );
};

export default RegistroCountLabel;
