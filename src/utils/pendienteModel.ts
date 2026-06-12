import type { Conductor, Pendiente, Vehicle } from '../data/types';
import type {
  EstadoPendiente,
  PendientePrioridadV2,
  PendienteRelacionadoTipo,
  PendienteTipo,
  PrioridadPendiente,
} from '../data/types';
import { todayStr } from './formatting';

export const PENDIENTE_TIPOS: { value: PendienteTipo; label: string; emoji: string }[] = [
  { value: 'recordatorio', label: 'Recordatorio', emoji: '🔔' },
  { value: 'alerta', label: 'Alerta', emoji: '⚠️' },
  { value: 'mantenimiento', label: 'Mantenimiento', emoji: '🔧' },
  { value: 'documento', label: 'Documento', emoji: '📋' },
  { value: 'financiero', label: 'Financiero', emoji: '💰' },
  { value: 'conductor', label: 'Conductor', emoji: '👤' },
  { value: 'vehiculo', label: 'Vehículo', emoji: '🚗' },
  { value: 'operacion', label: 'Operación', emoji: '⚙️' },
];

export const PENDIENTE_PRIORIDADES_V2: { value: PendientePrioridadV2; label: string }[] = [
  { value: 'critica', label: 'Crítica' },
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'baja', label: 'Baja' },
];

export const PENDIENTE_RELACION_TIPOS: { value: PendienteRelacionadoTipo; label: string }[] = [
  { value: 'ninguno', label: 'Sin relación' },
  { value: 'vehiculo', label: 'Vehículo' },
  { value: 'conductor', label: 'Conductor' },
  { value: 'documento', label: 'Documento' },
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'gasto', label: 'Gasto' },
];

export type PendienteTabId = 'hoy' | 'proximas' | 'backlog' | 'completadas';

const PRIORIDAD_RANK: Record<PendientePrioridadV2, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baja: 3,
};

export function pendienteTitulo(p: Pendiente): string {
  const t = p.titulo?.trim();
  if (t) return t;
  const d = p.descripcion.trim();
  if (!d) return 'Sin título';
  const first = d.split('\n')[0]?.trim() ?? d;
  return first.length > 100 ? `${first.slice(0, 97)}…` : first;
}

export function pendienteTipoEmoji(tipo: PendienteTipo): string {
  return PENDIENTE_TIPOS.find((x) => x.value === tipo)?.emoji ?? '📌';
}

export function isPendienteActivo(p: Pendiente): boolean {
  return p.estado === 'ABIERTO' || p.estado === 'EN_CURSO';
}

export function isPendienteCompletado(p: Pendiente): boolean {
  return p.estado === 'RESUELTO' || p.estado === 'CANCELADO';
}

export function prioridadV2FromLegacy(prioridad: PrioridadPendiente, meta?: PendientePrioridadV2): PendientePrioridadV2 {
  if (meta && PRIORIDAD_RANK[meta] !== undefined) return meta;
  if (prioridad === 'ALTA') return 'alta';
  if (prioridad === 'BAJA') return 'baja';
  return 'media';
}

export function prioridadLegacyFromV2(v2: PendientePrioridadV2): PrioridadPendiente {
  if (v2 === 'critica' || v2 === 'alta') return 'ALTA';
  if (v2 === 'baja') return 'BAJA';
  return 'MEDIA';
}

export function estadoFromV2(v2: 'abierto' | 'en_curso' | 'completado'): EstadoPendiente {
  if (v2 === 'en_curso') return 'EN_CURSO';
  if (v2 === 'completado') return 'RESUELTO';
  return 'ABIERTO';
}

export function estadoV2FromLegacy(estado: EstadoPendiente): 'abierto' | 'en_curso' | 'completado' {
  if (estado === 'EN_CURSO') return 'en_curso';
  if (estado === 'RESUELTO' || estado === 'CANCELADO') return 'completado';
  return 'abierto';
}

export function sortPendientesEquipo(list: Pendiente[]): Pendiente[] {
  return [...list].sort((a, b) => {
    const rp = PRIORIDAD_RANK[a.prioridadV2] - PRIORIDAD_RANK[b.prioridadV2];
    if (rp !== 0) return rp;
    const fa = a.fechaObjetivo ?? a.fecha;
    const fb = b.fechaObjetivo ?? b.fecha;
    const fd = fa.localeCompare(fb);
    if (fd !== 0) return fd;
    return b.id - a.id;
  });
}

export function filterPendientesEquipoHoy(list: Pendiente[]): Pendiente[] {
  return sortPendientesEquipo(
    list.filter((p) => isPendienteActivo(p) && p.mostrarEnHoy !== false),
  );
}

export function countPendientesEquipoActivos(list: Pendiente[]): number {
  return list.filter((p) => isPendienteDashboardVisible(p)).length;
}

/** Pendiente activo y no eliminado (libreta del equipo). */
export function isPendienteDashboardVisible(p: Pendiente): boolean {
  if (p.deletedAt) return false;
  return isPendienteActivo(p);
}

export function filterPendientesDashboardActivos(list: Pendiente[]): Pendiente[] {
  return sortPendientesDashboard(list.filter(isPendienteDashboardVisible));
}

/** Orden: antiguos no resueltos → hoy → recientes. */
export function sortPendientesDashboard(list: Pendiente[], today = todayStr()): Pendiente[] {
  const bucket = (p: Pendiente): number => {
    const f = (p.fechaObjetivo ?? p.fecha).slice(0, 10);
    if (f < today) return 0;
    if (f === today) return 1;
    return 2;
  };
  return [...list].sort((a, b) => {
    const ba = bucket(a);
    const bb = bucket(b);
    if (ba !== bb) return ba - bb;
    const fa = a.fechaObjetivo ?? a.fecha;
    const fb = b.fechaObjetivo ?? b.fecha;
    if (ba === 0) return fa.localeCompare(fb) || a.id - b.id;
    if (ba === 1) return a.id - b.id;
    return fb.localeCompare(fa) || b.id - a.id;
  });
}

export function countPendientesAntiguos(list: Pendiente[], today = todayStr()): number {
  return list.filter((p) => {
    if (!isPendienteDashboardVisible(p)) return false;
    const f = (p.fechaObjetivo ?? p.fecha).slice(0, 10);
    return f < today;
  }).length;
}

export function pendienteAutorLabel(p: Pendiente): string {
  const name = p.createdByName?.trim();
  if (name) return name.split(' ')[0] ?? name;
  if (p.responsable?.trim()) return p.responsable.trim().split(' ')[0] ?? p.responsable.trim();
  return 'Equipo';
}

export function pendienteFechaCortaLabel(fecha: string, today = todayStr()): string {
  const f = fecha.slice(0, 10);
  if (f === today) return 'Hoy';
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  if (f === yStr) return 'Ayer';
  const d = new Date(`${f}T12:00:00`);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', '');
}

export function canEditPendiente(
  p: Pendiente,
  userId: string | null | undefined,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  const uid = (userId ?? '').trim();
  const creator = (p.createdBy ?? '').trim();
  return uid !== '' && creator !== '' && uid === creator;
}

export function canDeletePendiente(
  p: Pendiente,
  userId: string | null | undefined,
  isAdmin: boolean,
): boolean {
  return canEditPendiente(p, userId, isAdmin);
}

export function filterPendientesResueltos(list: Pendiente[]): Pendiente[] {
  return [...list]
    .filter((p) => !p.deletedAt && isPendienteCompletado(p))
    .sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt));
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function isPendienteVencida(p: Pendiente, today = todayStr()): boolean {
  const f = p.fechaObjetivo ?? p.fecha;
  return f < today;
}

export function isPendienteHoyTab(p: Pendiente, today = todayStr()): boolean {
  if (!isPendienteActivo(p)) return false;
  if (p.prioridadV2 === 'critica') return true;
  const f = p.fechaObjetivo ?? p.fecha;
  if (f <= today) return true;
  return isPendienteVencida(p, today);
}

export function isPendienteProximasTab(p: Pendiente, today = todayStr()): boolean {
  if (!isPendienteActivo(p)) return false;
  const f = p.fechaObjetivo;
  if (!f || f <= today) return false;
  const d = daysBetween(today, f);
  return d >= 1 && d <= 30;
}

export function isPendienteBacklogTab(p: Pendiente): boolean {
  if (!isPendienteActivo(p)) return false;
  return !p.fechaObjetivo?.trim();
}

export function filterPendientesTab(list: Pendiente[], tab: PendienteTabId, today = todayStr()): Pendiente[] {
  const visible = list.filter((p) => !p.deletedAt);
  const sorted = sortPendientesEquipo(visible);
  switch (tab) {
    case 'hoy':
      return sorted.filter((p) => isPendienteHoyTab(p, today));
    case 'proximas':
      return sorted.filter((p) => isPendienteProximasTab(p, today));
    case 'backlog':
      return sorted.filter((p) => isPendienteBacklogTab(p));
    case 'completadas':
      return sorted.filter((p) => isPendienteCompletado(p));
    default:
      return sorted;
  }
}

export function pendienteRelacionLabel(
  p: Pendiente,
  ctx: {
    getVehicleLabel: (id: number | string | null | undefined) => string;
    vehicles: Vehicle[];
    conductores: Conductor[];
  },
): string {
  if (p.relacionadoTipo === 'vehiculo' && p.relacionadoId != null) {
    return ctx.getVehicleLabel(p.relacionadoId);
  }
  if (p.relacionadoTipo === 'vehiculo' && p.vehicleId != null) {
    return ctx.getVehicleLabel(p.vehicleId);
  }
  if (p.relacionadoTipo === 'conductor' && p.relacionadoId != null) {
    const id = String(p.relacionadoId);
    const c = ctx.conductores.find((x) => String(x.id) === id);
    if (c) return `${c.nombres} ${c.apellidos}`.trim() || `Conductor #${id}`;
    return `Conductor #${id}`;
  }
  if (p.vehicleId != null) return ctx.getVehicleLabel(p.vehicleId);
  return 'General';
}

export function pendienteRegistroPath(p: Pendiente): string | null {
  if (p.relacionadoTipo === 'vehiculo' && p.relacionadoId != null) {
    return `/vehiculos/${p.relacionadoId}`;
  }
  if (p.relacionadoTipo === 'vehiculo' && p.vehicleId != null) {
    return `/vehiculos/${p.vehicleId}`;
  }
  if (p.relacionadoTipo === 'conductor' && p.relacionadoId != null) {
    return `/operaciones/conductores`;
  }
  if (p.relacionadoTipo === 'ingreso' && p.relacionadoId != null) {
    return `/finanzas/ingresos`;
  }
  if (p.relacionadoTipo === 'gasto' && p.relacionadoId != null) {
    return `/finanzas/gastos`;
  }
  if (p.relacionadoTipo === 'documento') {
    return `/operaciones/docs`;
  }
  return null;
}

export type PendienteFormValues = {
  titulo: string;
  descripcion: string;
  tipo: PendienteTipo;
  prioridadV2: PendientePrioridadV2;
  estadoV2: 'abierto' | 'en_curso' | 'completado';
  fecha: string;
  fechaObjetivo: string;
  mostrarEnHoy: boolean;
  responsable: string;
  relacionadoTipo: PendienteRelacionadoTipo;
  relacionadoId: string;
  vehicleId: string;
};

export function emptyPendienteForm(): PendienteFormValues {
  return {
    titulo: '',
    descripcion: '',
    tipo: 'recordatorio',
    prioridadV2: 'media',
    estadoV2: 'abierto',
    fecha: todayStr(),
    fechaObjetivo: '',
    mostrarEnHoy: true,
    responsable: '',
    relacionadoTipo: 'ninguno',
    relacionadoId: '',
    vehicleId: '',
  };
}

export function pendienteToFormValues(p: Pendiente): PendienteFormValues {
  let relacionadoId = '';
  if (p.relacionadoId != null) relacionadoId = String(p.relacionadoId);
  else if (p.vehicleId != null && (p.relacionadoTipo === 'vehiculo' || p.relacionadoTipo === 'ninguno')) {
    relacionadoId = String(p.vehicleId);
  }
  return {
    titulo: pendienteTitulo(p),
    descripcion: p.descripcion,
    tipo: p.tipo,
    prioridadV2: p.prioridadV2,
    estadoV2: estadoV2FromLegacy(p.estado),
    fecha: p.fecha,
    fechaObjetivo: p.fechaObjetivo ?? '',
    mostrarEnHoy: p.mostrarEnHoy !== false,
    responsable: p.responsable ?? '',
    relacionadoTipo: p.relacionadoTipo,
    relacionadoId,
    vehicleId: p.vehicleId != null ? String(p.vehicleId) : '',
  };
}

export function formValuesToPendientePayload(
  f: PendienteFormValues,
): Omit<Pendiente, 'id' | 'createdAt'> {
  const titulo = f.titulo.trim();
  const descripcion = f.descripcion.trim() || titulo;
  const relacionadoTipo = f.relacionadoTipo;
  let relacionadoId: string | number | null = f.relacionadoId.trim() || null;
  let vehicleId: number | null = f.vehicleId ? Number(f.vehicleId) : null;

  if (relacionadoTipo === 'vehiculo' && relacionadoId) {
    vehicleId = Number(relacionadoId);
  } else if (relacionadoTipo === 'ninguno' && vehicleId) {
    relacionadoId = String(vehicleId);
    return {
      titulo,
      descripcion,
      vehicleId,
      estado: estadoFromV2(f.estadoV2),
      fecha: f.fecha,
      prioridad: prioridadLegacyFromV2(f.prioridadV2),
      tipo: f.tipo,
      prioridadV2: f.prioridadV2,
      mostrarEnHoy: f.mostrarEnHoy,
      responsable: f.responsable.trim() || null,
      fechaObjetivo: f.fechaObjetivo.trim() || null,
      relacionadoTipo: 'vehiculo',
      relacionadoId: vehicleId,
    };
  }

  if (relacionadoTipo === 'ninguno') {
    relacionadoId = null;
    vehicleId = f.vehicleId ? Number(f.vehicleId) : null;
  }

  return {
    titulo,
    descripcion,
    vehicleId,
    estado: estadoFromV2(f.estadoV2),
    fecha: f.fecha,
    prioridad: prioridadLegacyFromV2(f.prioridadV2),
    tipo: f.tipo,
    prioridadV2: f.prioridadV2,
    mostrarEnHoy: f.mostrarEnHoy,
    responsable: f.responsable.trim() || null,
    fechaObjetivo: f.fechaObjetivo.trim() || null,
    relacionadoTipo,
    relacionadoId,
  };
}
