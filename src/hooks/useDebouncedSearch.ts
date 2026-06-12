import { useCallback, useEffect, useState } from 'react';

/** Valor inmediato en el input vs valor aplicado al filtro (debounce). */
export function useDebouncedSearch(initialValue = '', delayMs = 300) {
  const [inputValue, setInputValue] = useState(initialValue);
  const [appliedValue, setAppliedValue] = useState(initialValue);

  useEffect(() => {
    const handle = window.setTimeout(() => setAppliedValue(inputValue), delayMs);
    return () => window.clearTimeout(handle);
  }, [inputValue, delayMs]);

  const isDebouncing = inputValue !== appliedValue;

  const clear = useCallback(() => {
    setInputValue('');
    setAppliedValue('');
  }, []);

  return { inputValue, setInputValue, appliedValue, isDebouncing, clear };
}
