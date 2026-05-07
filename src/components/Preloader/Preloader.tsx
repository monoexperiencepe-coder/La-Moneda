import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface PreloaderProps {
  onComplete: () => void;
}

/* Step labels shown as progress crosses each threshold */
const STEPS = [
  { label: 'Conectando base de datos…',    at: 0.12 },
  { label: 'Cargando flota de vehículos…', at: 0.35 },
  { label: 'Sincronizando registros…',     at: 0.60 },
  { label: 'Preparando panel de control…', at: 0.82 },
  { label: 'Todo listo ✓',                 at: 0.97 },
];

const FILL_DURATION = 3600; // ms to go from 0 → 97 %
const C = 2 * Math.PI * 44;  // SVG circumference for r=44

/* Ease-in-out curve */
const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

const Preloader: React.FC<PreloaderProps> = ({ onComplete }) => {
  const [visible, setVisible]     = useState(false); // flip to true after first layout
  const [pct, setPct]             = useState(0);     // 0–100
  const [labelIdx, setLabelIdx]   = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const rafRef  = useRef<number>(0);
  const startTs = useRef<number>(0);

  /* ── Show content only after first layout (avoids gradient-text FOUC) ── */
  useLayoutEffect(() => {
    // requestAnimationFrame ensures paint happened
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /* ── Smooth progress loop ── */
  useEffect(() => {
    if (!visible) return;

    const tick = (ts: number) => {
      if (!startTs.current) startTs.current = ts;
      const elapsed = ts - startTs.current;
      const raw = Math.min(elapsed / FILL_DURATION, 1);
      const eased = ease(raw);
      const next = Math.round(eased * 97); // fill up to 97 %

      setPct(next);

      // Update step label as thresholds are crossed
      setLabelIdx((prev) => {
        let idx = prev;
        while (idx < STEPS.length - 1 && eased >= STEPS[idx + 1]!.at) idx++;
        return idx;
      });

      if (raw < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Hold at 97 % briefly, then snap to 100 % and fade
        setTimeout(() => {
          setPct(100);
          setLabelIdx(STEPS.length - 1);
          setTimeout(() => {
            setFadingOut(true);
            setTimeout(onComplete, 520);
          }, 350);
        }, 200);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible, onComplete]);

  const arcOffset = C * (1 - pct / 100);

  return (
    <div
      style={{
        opacity: !visible ? 0 : fadingOut ? 0 : 1,
        transition: visible ? 'opacity 0.52s ease-in-out' : 'none',
        willChange: 'opacity',
      }}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-950"
    >
      {/* Ambient blobs – static, no layout impact */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full blur-[130px]"
          style={{ background: 'rgba(99,102,241,0.18)' }} />
        <div className="absolute -bottom-40 -right-20 w-[420px] h-[420px] rounded-full blur-[110px]"
          style={{ background: 'rgba(139,92,246,0.13)' }} />
      </div>

      {/* Grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.028,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)',
          backgroundSize: '52px 52px',
        }}
      />

      {/* ── Main content – fixed width/height to prevent any reflow ── */}
      <div
        className="relative z-10 flex flex-col items-center text-center"
        style={{ width: 280, willChange: 'transform' }}
      >

        {/* SVG ring + coin */}
        <div className="relative mb-8" style={{ width: 96, height: 96 }}>
          {/* Glow behind ring */}
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)',
              filter: 'blur(12px)',
            }}
          />
          <svg width="96" height="96" viewBox="0 0 100 100"
            style={{ transform: 'rotate(-90deg)', display: 'block' }}>
            <defs>
              <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#A78BFA" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="44" fill="none"
              stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
            <circle cx="50" cy="50" r="44" fill="none"
              stroke="url(#rg)" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={arcOffset}
              style={{ transition: 'stroke-dashoffset 0.12s linear' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(99,102,241,0.45)',
            }}>
              <span style={{ fontSize: 26, lineHeight: 1, userSelect: 'none' }}>🪙</span>
            </div>
          </div>
        </div>

        {/* Brand – gradient via inline style, fixed height to prevent reflow */}
        <div style={{ height: 48, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'flex-start', marginBottom: 8 }}>
          <h1
            style={{
              margin: 0,
              fontWeight: 900,
              fontSize: '2.5rem',
              lineHeight: 1,
              letterSpacing: '-0.02em',
              background: 'linear-gradient(90deg,#fff 0%,#C4B5FD 50%,#818CF8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              whiteSpace: 'nowrap',
            }}
          >
            LA MONEDA
          </h1>
        </div>

        <p style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: '#64748B', margin: '0 0 2px',
        }}>
          Gestión Financiera
        </p>
        <p style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'rgba(248, 250, 252, 0.96)',
          margin: '0 0 36px',
          textShadow:
            '0 0 18px rgba(255,255,255,0.35), 0 0 10px rgba(196,181,253,0.5)',
        }}>
          Flota · Taxis · InDrive
        </p>

        {/* Progress bar */}
        <div style={{ width: '100%', marginBottom: 10 }}>
          <div style={{
            width: '100%', height: 5, borderRadius: 999,
            background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 999,
              width: `${pct}%`,
              background: 'linear-gradient(90deg,#6366F1,#8B5CF6,#A78BFA)',
              boxShadow: '0 0 14px rgba(139,92,246,0.75)',
              transition: 'width 0.12s linear',
            }} />
          </div>
        </div>

        {/* Label + pct row – fixed height to stop layout jumps */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', width: '100%',
          height: 20, marginBottom: 20,
        }}>
          <p style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'rgba(248, 250, 252, 0.96)',
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '75%',
            margin: 0,
            flex: '1 1 auto',
            textShadow:
              '0 0 14px rgba(255,255,255,0.32), 0 0 8px rgba(196,181,253,0.48)',
          }}>
            {STEPS[labelIdx]?.label}
          </p>
          <span style={{
            fontSize: 13, fontWeight: 700, color: '#A78BFA',
            fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8,
          }}>
            {pct}%
          </span>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {STEPS.map((s, i) => {
            const done   = (pct / 100) > s.at + 0.04;
            const active = !done && (pct / 100) >= (i === 0 ? 0 : STEPS[i - 1]!.at);
            return (
              <span key={i} style={{
                display: 'inline-block',
                height: 8,
                borderRadius: 999,
                width: active ? 22 : 8,
                background: done
                  ? '#6366F1'
                  : active
                  ? 'linear-gradient(90deg,#6366F1,#A78BFA)'
                  : 'rgba(255,255,255,0.09)',
                transition: 'width 0.35s ease, background 0.35s ease',
              }} />
            );
          })}
        </div>

      </div>
    </div>
  );
};

export default Preloader;
