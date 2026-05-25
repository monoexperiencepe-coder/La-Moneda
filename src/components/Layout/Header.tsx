import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Menu,
  X,
  Bell,
  Settings,
  Home,
  DollarSign,
  Car,
  Wrench,
  BarChart3,
  Target,
  LogOut,
  Undo2,
  Loader2,
  Sparkles,
  History,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUndoManager } from '../../context/UndoManagerContext';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { canViewSection, permissionUserFromAuth, type AppSection } from '../../utils/permissions';
import RealtimeStatusBadge from '../Common/RealtimeStatusBadge';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  socio: 'Socio',
  contador: 'Contador',
  operador: 'Operador',
};

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  emoji: string;
}

const navItems: NavItem[] = [
  { label: 'Inicio', path: '/', icon: <Home size={15} />, emoji: '🏠' },
  { label: 'Finanzas', path: '/finanzas', icon: <DollarSign size={15} />, emoji: '💰' },
  { label: 'Vehículos', path: '/vehiculos', icon: <Car size={15} />, emoji: '🚗' },
  { label: 'Operaciones', path: '/operaciones', icon: <Wrench size={15} />, emoji: '🔧' },
  { label: 'Reportes', path: '/reportes', icon: <BarChart3 size={15} />, emoji: '📊' },
  { label: 'Metas', path: '/metas', icon: <Target size={15} />, emoji: '🎯' },
  { label: 'Asistente', path: '/asistente', icon: <Sparkles size={15} />, emoji: '✨' },
];

const NAV_SECTION: Record<string, AppSection> = {
  '/': 'inicio',
  '/finanzas': 'finanzas_gastos',
  '/vehiculos': 'vehiculos',
  '/operaciones': 'operaciones',
  '/reportes': 'reportes',
  '/metas': 'metas',
  '/asistente': 'asistente',
};

const DEV = import.meta.env.DEV;

function logProfileMenu(action: string) {
  if (DEV) console.log(`[profile-menu] click ${action}`);
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type ProfilePanelProps = {
  initials: string;
  userName: string;
  userEmail: string | null | undefined;
  userRole: string;
  realtimeConnected: boolean;
  isAdmin: boolean;
  onGoConfig: () => void;
  onGoHistorial: () => void;
  onLogout: () => void;
};

/** Contenido completo del perfil (sheet móvil y dropdown desktop). */
const ProfilePanelContent: React.FC<ProfilePanelProps> = ({
  initials,
  userName,
  userEmail,
  userRole,
  realtimeConnected,
  isAdmin,
  onGoConfig,
  onGoHistorial,
  onLogout,
}) => (
  <>
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 text-sm font-bold text-white shadow-sm">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-gray-900">{userName}</p>
        {userEmail ? <p className="truncate text-xs text-gray-500">{userEmail}</p> : null}
        <p className="mt-0.5 text-[11px] font-medium text-primary-600">
          {ROLE_LABEL[userRole] ?? userRole}
        </p>
      </div>
    </div>

    <div className="mt-4 rounded-xl bg-gray-50 px-3 py-2.5 text-[11px] leading-snug text-gray-600">
      <p className="font-semibold text-gray-800">Sesión activa</p>
      <p className="mt-0.5">
        {realtimeConnected
          ? 'Datos sincronizados en vivo con la base.'
          : 'Conectado a La Moneda.'}
      </p>
    </div>

    <div className="mt-3 space-y-1.5">
      <button
        type="button"
        role="menuitem"
        onClick={onGoConfig}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 active:bg-gray-100"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
          <Settings size={18} aria-hidden />
        </span>
        Configuración y perfil
      </button>
      {isAdmin ? (
        <button
          type="button"
          role="menuitem"
          onClick={onGoHistorial}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 active:bg-gray-100"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <History size={18} aria-hidden />
          </span>
          Historial del sistema
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        onClick={onLogout}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 active:bg-red-100"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
          <LogOut size={18} aria-hidden />
        </span>
        Cerrar sesión
      </button>
    </div>
  </>
);

type DesktopProfileMenuProps = ProfilePanelProps & {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
};

const DesktopProfileMenu: React.FC<DesktopProfileMenuProps> = ({
  open,
  onToggle,
  onClose,
  initials,
  ...panelProps
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    if (!mq.matches) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-xs font-bold text-white shadow-sm ring-2 ring-white transition-transform active:scale-[0.96]"
        aria-label="Menú de perfil"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {initials}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Perfil y sesión"
          className="absolute right-0 top-full z-[9999] mt-2 w-72 min-w-[220px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-lg animate-scale-in"
        >
          <ProfilePanelContent initials={initials} {...panelProps} />
        </div>
      ) : null}
    </div>
  );
};

const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const { user, profile, logout, isFinancialOperador } = useAuth();
  const { executeUndo, latestLabel, undoRunning, lastAction } = useUndoManager();
  const { toast, registrosRealtimeConnected } = useRegistrosContext();

  const permissionUser = permissionUserFromAuth(user, profile?.email ?? null);
  const visibleNavItems = isFinancialOperador
    ? [
        {
          label: 'Conciliación',
          path: '/finanzas/gastos',
          icon: <DollarSign size={15} />,
          emoji: '⏳',
        },
        {
          label: 'Pendientes IA',
          path: '/finanzas/ia-clasificacion',
          icon: <Sparkles size={15} />,
          emoji: '🤖',
        },
        {
          label: 'Asistente',
          path: '/asistente',
          icon: <Sparkles size={15} />,
          emoji: '✨',
        },
      ]
    : navItems.filter((item) => canViewSection(permissionUser, NAV_SECTION[item.path] ?? 'inicio'));

  const hasUndo = Boolean(lastAction);
  const undoDisabled = !hasUndo || undoRunning;
  const undoTitle = undoRunning
    ? 'Revirtiendo última acción…'
    : hasUndo
      ? `Revertir última acción: ${latestLabel}`
      : 'No hay acciones para deshacer';

  const undoButtonClass = hasUndo
    ? 'border-indigo-200 bg-indigo-50 text-indigo-800 ring-1 ring-indigo-100/80 hover:bg-indigo-100/90'
    : 'border-gray-200 bg-gray-50/90 text-gray-400';

  const mobileUndoButtonClass = `${undoButtonClass} ${
    !hasUndo && !undoRunning ? 'cursor-not-allowed opacity-40' : 'active:scale-[0.98]'
  }`;

  const handleGlobalUndo = async () => {
    if (!hasUndo || undoRunning) return;
    const label = latestLabel;
    const res = await executeUndo();
    if (res === 'ok') {
      toast.success('Cambio revertido', label ? `Se revirtió: ${label}` : undefined);
    } else if (res === 'fail') {
      toast.error('No se pudo revertir el cambio.');
    }
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const closeProfileMenu = useCallback(() => setProfileMenuOpen(false), []);

  const handleLogout = () => {
    logProfileMenu('logout');
    closeProfileMenu();
    logout();
  };

  const handleGoConfig = () => {
    logProfileMenu('configuracion');
    closeProfileMenu();
    navigate('/configuracion');
  };

  const handleGoHistorial = () => {
    logProfileMenu('historial');
    closeProfileMenu();
    navigate('/admin/historial-sistema');
  };

  const openProfileMenu = useCallback(() => {
    setProfileMenuOpen(true);
    setMobileOpen(false);
  }, []);

  const toggleDesktopProfileMenu = useCallback(() => {
    setProfileMenuOpen((v) => !v);
    setMobileOpen(false);
  }, []);

  const initials = userInitials(user.name);
  const displayEmail = profile?.email ?? user.email;

  const canViewHistorial = canViewSection(permissionUser, 'admin');

  const profilePanelProps: ProfilePanelProps = {
    initials,
    userName: user.name,
    userEmail: displayEmail,
    userRole: user.role,
    realtimeConnected: registrosRealtimeConnected,
    isAdmin: canViewHistorial,
    onGoConfig: handleGoConfig,
    onGoHistorial: handleGoHistorial,
    onLogout: handleLogout,
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="border-b border-gray-100 bg-white/95 shadow-soft backdrop-blur-md">
        <div className="mx-auto max-w-screen-2xl min-w-0 px-3 sm:px-6">
          {/* Mobile: [☰] [LA MONEDA] [↶?] [AD] */}
          <div className="flex h-14 min-w-0 items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(!mobileOpen);
                closeProfileMenu();
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-50 active:scale-[0.98]"
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-1 py-1 transition-colors hover:bg-gray-50/90 active:scale-[0.98]"
              aria-label="La Moneda — Ir al inicio"
            >
              <span className="shrink-0 text-base leading-none select-none" aria-hidden>
                🪙
              </span>
              <span className="truncate bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-sm font-bold tracking-tight text-transparent">
                LA MONEDA
              </span>
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => void handleGlobalUndo()}
                disabled={undoDisabled}
                aria-disabled={undoDisabled}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-sm transition-all duration-200 ${mobileUndoButtonClass}`}
                aria-label={undoTitle}
                title={undoTitle}
              >
                {undoRunning ? (
                  <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Undo2 size={16} strokeWidth={2.25} className="shrink-0" aria-hidden />
                )}
              </button>

              <button
                type="button"
                onClick={openProfileMenu}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-[11px] font-bold text-white shadow-sm ring-2 ring-white transition-transform active:scale-[0.96]"
                aria-label="Menú de perfil"
                aria-expanded={profileMenuOpen}
              >
                {initials}
              </button>
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden h-16 min-w-0 items-center gap-2 sm:gap-3 lg:flex">
            <div className="relative z-20 flex min-w-0 flex-1 items-center gap-1 overflow-hidden sm:gap-2">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 text-lg shadow-soft transition-shadow hover:shadow-glow"
                aria-label="Ir al inicio"
              >
                🪙
              </button>
              <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {visibleNavItems.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-all duration-200 xl:gap-1.5 xl:px-2.5 xl:text-sm
                      ${
                        isActive(item.path)
                          ? 'bg-primary-50 text-primary-600'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                      }`}
                  >
                    {item.icon}
                    <span className="hidden xl:inline">{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <div className="relative z-10 hidden shrink-0 justify-center px-1 sm:px-2 xl:flex">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex min-w-0 max-w-full items-center gap-1.5 rounded-xl px-1.5 py-1 transition-colors hover:bg-gray-50/90 active:scale-[0.98] sm:gap-2 sm:px-2"
                aria-label="La Moneda — Ir al inicio"
              >
                <span className="shrink-0 text-base leading-none select-none sm:text-lg" aria-hidden>
                  🪙
                </span>
                <span className="truncate bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-sm font-bold tracking-tight text-transparent sm:text-base md:text-lg">
                  LA MONEDA
                </span>
              </button>
            </div>

            <div className="relative z-20 flex shrink-0 items-center justify-end gap-0.5 sm:gap-1.5">
              <RealtimeStatusBadge connected={registrosRealtimeConnected} />
              <button
                type="button"
                onClick={() => void handleGlobalUndo()}
                disabled={undoDisabled}
                className={`flex max-w-[9rem] shrink-0 items-center gap-1.5 rounded-xl border px-2 py-1.5 shadow-sm transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none xl:max-w-[14rem] xl:px-2.5 xl:py-2 ${undoButtonClass}`}
                aria-label={undoTitle}
                title={undoTitle}
              >
                {undoRunning ? (
                  <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Undo2 size={16} strokeWidth={2.25} className="shrink-0" aria-hidden />
                )}
                <span className="hidden min-w-0 flex-col items-start text-left leading-tight lg:flex">
                  <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                    {undoRunning ? 'Revirtiendo…' : 'Deshacer'}
                  </span>
                  {hasUndo && !undoRunning ? (
                    <span className="max-w-[7rem] truncate text-xs font-semibold xl:max-w-[9rem]">
                      {latestLabel}
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-50"
                aria-label="Notificaciones"
              >
                <Bell size={18} />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/configuracion')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-50"
                aria-label="Configuración"
              >
                <Settings size={18} />
              </button>
              <DesktopProfileMenu
                open={profileMenuOpen}
                onToggle={toggleDesktopProfileMenu}
                onClose={closeProfileMenu}
                {...profilePanelProps}
              />
            </div>
          </div>
        </div>

        {mobileOpen ? (
          <div className="overflow-x-hidden border-t border-gray-100 bg-white px-4 py-3 animate-scale-in lg:hidden">
            <nav className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto overflow-x-hidden sm:grid-cols-4">
              {visibleNavItems.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    navigate(item.path);
                    setMobileOpen(false);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-xs font-medium transition-all
                    ${
                      isActive(item.path)
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-gray-500 hover:bg-gray-50'
                    }`}
                >
                  <span className="text-xl">{item.emoji}</span>
                  <span className="line-clamp-2 text-center leading-tight">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        ) : null}
      </div>

      {/* Perfil móvil: bottom sheet flotante (no altera altura del header) */}
      {profileMenuOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 z-0 bg-black/30 backdrop-blur-[1px]"
            aria-label="Cerrar menú de perfil"
            onClick={closeProfileMenu}
          />
          <div
            className="absolute bottom-0 left-0 right-0 z-10 rounded-t-2xl border border-gray-100 bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] animate-scale-in"
            role="dialog"
            aria-modal="true"
            aria-label="Perfil y sesión"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" aria-hidden />
            <ProfilePanelContent {...profilePanelProps} />
          </div>
        </div>
      ) : null}
    </header>
  );
};

export default Header;
