import React, { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';

type SmartClockVariant = 'hero' | 'hub';

function greetingForHour(h: number): string {
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 14) return 'Buen mediodía';
  if (h >= 14 && h < 19) return 'Buenas tardes';
  if (h >= 19 && h < 24) return 'Buenas noches';
  return 'Buenas noches';
}

export interface SmartClockProps {
  /** `hero`: inicio, grande. `hub`: sección compacta centrada. */
  variant?: SmartClockVariant;
  className?: string;
}

const SmartClock: React.FC<SmartClockProps> = ({ variant = 'hero', className = '' }) => {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const parts = useMemo(() => {
    const d = new Date(tick);
    const h = d.getHours();
    return {
      greeting: greetingForHour(h),
      time: d.toLocaleTimeString('es-PE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
      dateLong: d.toLocaleDateString('es-PE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'hora local',
    };
  }, [tick]);

  const isHero = variant === 'hero';

  return (
    <div
      className={[
        'rounded-2xl border border-gray-100 bg-white text-center shadow-soft',
        isHero ? 'py-4 px-4 sm:py-5 sm:px-5' : 'py-3.5 px-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="timer"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={[
          'inline-flex items-center justify-center gap-2 rounded-full border border-gray-100 bg-gray-50/80 text-gray-500',
          isHero ? 'px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]' : 'px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider',
        ].join(' ')}
      >
        <Clock size={isHero ? 11 : 10} className="shrink-0 opacity-70" aria-hidden />
        <span>{parts.greeting}</span>
      </div>

      <p
        className={[
          'mt-2 font-bold tabular-nums tracking-tight text-gray-900',
          isHero ? 'text-2xl sm:text-3xl leading-none' : 'text-xl sm:text-2xl leading-none',
        ].join(' ')}
      >
        {parts.time}
      </p>

      <p
        className={[
          'mt-1.5 text-gray-500 capitalize',
          isHero ? 'text-xs font-medium' : 'text-[11px]',
        ].join(' ')}
      >
        {parts.dateLong}
      </p>

      <p className="mt-1 text-[9px] text-gray-400 font-medium tabular-nums truncate px-1">{parts.zone}</p>
    </div>
  );
};

export default SmartClock;
