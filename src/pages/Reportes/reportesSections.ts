import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Car,
  Download,
  Landmark,
  Receipt,
  TrendingUp,
} from 'lucide-react';

export type ReportesSectionId =
  | 'mensual'
  | 'vehiculos'
  | 'gastos_op'
  | 'ingresos'
  | 'financiamiento'
  | 'exportar';

export interface ReportesSectionCard {
  id: ReportesSectionId;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
}

export const REPORTES_SECTION_CARDS: ReportesSectionCard[] = [
  {
    id: 'mensual',
    title: 'Rendimiento mensual',
    description: 'Compara ingresos, gastos y resultado por mes.',
    icon: BarChart3,
    accent: 'border-violet-200 hover:border-violet-400 hover:shadow-violet-100',
    iconBg: 'bg-violet-100 text-violet-700',
  },
  {
    id: 'vehiculos',
    title: 'Rentabilidad por vehículo',
    description: 'Detecta qué unidades generan más utilidad.',
    icon: Car,
    accent: 'border-emerald-200 hover:border-emerald-400 hover:shadow-emerald-100',
    iconBg: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'gastos_op',
    title: 'Gastos operativos',
    description: 'Analiza en qué se está yendo el gasto operativo.',
    icon: Receipt,
    accent: 'border-rose-200 hover:border-rose-400 hover:shadow-rose-100',
    iconBg: 'bg-rose-100 text-rose-700',
  },
  {
    id: 'ingresos',
    title: 'Ingresos',
    description: 'Revisa ingresos, pendientes y tendencias.',
    icon: TrendingUp,
    accent: 'border-teal-200 hover:border-teal-400 hover:shadow-teal-100',
    iconBg: 'bg-teal-100 text-teal-700',
  },
  {
    id: 'financiamiento',
    title: 'Préstamos y aportes',
    description: 'Visualiza movimientos financieros internos.',
    icon: Landmark,
    accent: 'border-indigo-200 hover:border-indigo-400 hover:shadow-indigo-100',
    iconBg: 'bg-indigo-100 text-indigo-700',
  },
  {
    id: 'exportar',
    title: 'Exportar información',
    description: 'Descarga reportes para análisis externo.',
    icon: Download,
    accent: 'border-slate-200 hover:border-slate-400 hover:shadow-slate-100',
    iconBg: 'bg-slate-100 text-slate-700',
  },
];
