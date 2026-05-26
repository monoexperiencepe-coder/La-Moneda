/** Posicionamiento seguro del FAB del copiloto (evita tapar + registros / toasts). */

/** Clases Tailwind para FAB: izquierda en móvil, arriba del + en desktop. */
export const COPILOT_FAB_POSITION_CLASS = [
  'left-4',
  'bottom-[max(1.25rem,env(safe-area-inset-bottom,0px))]',
  'sm:left-auto sm:right-6',
  'sm:bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))]',
].join(' ');

/** z-index por debajo del AI Focus Mode pero accesible. */
export const COPILOT_FAB_Z_CLASS = 'z-[8500]';
