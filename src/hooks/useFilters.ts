import { useState, useMemo } from 'react';
import { FilterState, Ingreso, Gasto } from '../data/types';

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

  const filterByVehicle = <T extends { vehicleId: number | null }>(items: T[]): T[] => {
    if (!filters.vehicleId) return items;
    return items.filter(item => item.vehicleId === filters.vehicleId);
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
) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const lower = query.toLowerCase();
    return items.filter(item =>
      searchKeys.some(key => {
        const val = item[key];
        return typeof val === 'string' && val.toLowerCase().includes(lower);
      })
    );
  }, [items, query, searchKeys]);

  return { query, setQuery, filtered };
};
