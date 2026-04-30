import React, { createContext, useContext, useState, ReactNode } from 'react';

/** Solo acciones que persisten en Supabase (ingreso / gasto). */
export type DrawerType = 'income' | 'expense' | null;

interface DrawerContextValue {
  openDrawer: DrawerType;
  open: (type: DrawerType) => void;
  close: () => void;
  lastVehicleId: number | null;
  setLastVehicleId: (id: number) => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

export const DrawerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [openDrawer, setOpenDrawer] = useState<DrawerType>(null);
  const [lastVehicleId, setLastVehicleId] = useState<number | null>(1);

  const open = (type: DrawerType) => setOpenDrawer(type);
  const close = () => setOpenDrawer(null);

  return (
    <DrawerContext.Provider value={{ openDrawer, open, close, lastVehicleId, setLastVehicleId }}>
      {children}
    </DrawerContext.Provider>
  );
};

export const useDrawer = () => {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useDrawer must be used within DrawerProvider');
  return ctx;
};
