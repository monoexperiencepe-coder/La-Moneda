import { useState, useMemo } from 'react';
import { FilterState, Ingreso, Gasto } from '../data/types';
import { buildSearchHaystack, matchesSearchHaystack } from '../utils/recordSearch';
import { useDebouncedSearch } from './useDebouncedSearch';

const defaultFilters: FilterState = {
  mes: null,
  anio: null,
  vehicleId: null,
  fechaDesde: '',
  fechaHasta: '',
};

export const useFilters = () => {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => setFilters(defaultFilters);

  const filterByDate = <T extends { fecha: string }>(items: T[]): T[] => {
    return items.filter(item => {
      const date = new Date(item.fecha);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      if (filters.anio && year !== filters.anio) return false;
      if (filters.mes && month !== filters.mes) return false;
      if (filters.fechaDesde && item.fecha < filters.fechaDesde) return false;
      if (filters.fechaHasta && item.fecha > filters.fechaHasta) return false;

      return true;
    });
  };

  const filterByVehicle = <T extends { vehicleId: number | string | null }>(items: T[]): T[] => {
    if (!filters.vehicleId) return items;
    const want = String(filters.vehicleId);
    return items.filter((item) => item.vehicleId != null && String(item.vehicleId) === want);
  };

  const filterIngresos = (ingresos: Ingreso[]): Ingreso[] => {
    return filterByVehicle(filterByDate(ingresos));
  };

  const filterGastos = (gastos: Gasto[]): Gasto[] => {
    return filterByVehicle(filterByDate(gastos));
  };

  return {
    filters,
    updateFilter,
    resetFilters,
    filterIngresos,
    filterGastos,
    filterByDate,
  };
};

export const useSearch = <T extends Record<string, unknown>>(
  items: T[],
  searchKeys: (keyof T)[],
  delayMs = 300,
) => {
  const { inputValue, setInputValue, appliedValue, isDebouncing, clear } = useDebouncedSearch('', delayMs);

  const filtered = useMemo(() => {
    if (!appliedValue.trim()) return items;
    return items.filter((item) => {
      const parts = searchKeys.map((key) => {
        const val = item[key];
        if (typeof val === 'string') return val;
        if (typeof val === 'number' || typeof val === 'boolean') return String(val);
        return '';
      });
      return matchesSearchHaystack(buildSearchHaystack(...parts), appliedValue);
    });
  }, [items, appliedValue, searchKeys]);

  return { query: inputValue, setQuery: setInputValue, appliedQuery: appliedValue, isDebouncing, clear, filtered };
};
