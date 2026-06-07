import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useRegistrosContext } from './RegistrosContext';
import RegistrarIndisponibilidadModal from '../components/vehiculos/RegistrarIndisponibilidadModal';
import type { Vehicle } from '../data/types';

type IndisponibilidadModalContextValue = {
  openRegistrar: (vehicle?: Vehicle | null) => void;
};

const IndisponibilidadModalContext = createContext<IndisponibilidadModalContextValue | null>(null);

export function IndisponibilidadModalProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const { vehicles } = useRegistrosContext();
  const [isOpen, setIsOpen] = useState(false);
  const [presetVehicle, setPresetVehicle] = useState<Vehicle | null>(null);

  const openRegistrar = useCallback((vehicle?: Vehicle | null) => {
    setPresetVehicle(vehicle ?? null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setPresetVehicle(null);
  }, []);

  const value = useMemo(() => ({ openRegistrar }), [openRegistrar]);

  return (
    <IndisponibilidadModalContext.Provider value={value}>
      {children}
      <RegistrarIndisponibilidadModal
        vehicle={presetVehicle}
        vehicles={vehicles}
        empresaId={profile?.empresa_id ?? null}
        isOpen={isOpen}
        onClose={close}
        onSaved={close}
      />
    </IndisponibilidadModalContext.Provider>
  );
}

export function useIndisponibilidadModal(): IndisponibilidadModalContextValue {
  const ctx = useContext(IndisponibilidadModalContext);
  if (!ctx) {
    throw new Error('useIndisponibilidadModal debe usarse dentro de IndisponibilidadModalProvider');
  }
  return ctx;
}
