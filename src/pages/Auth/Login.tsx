import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const C = 2 * Math.PI * 44;

/** Tras el preloader global: mensaje dentro del card antes del formulario (ms). */
const LOGIN_CARD_INTRO_MS = 3000;

/** Panal hexagonal (tile); combine con la rejilla y el violeta del login. */
const HEX_TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="60" viewBox="0 0 52 60"><path fill="none" stroke="#6366f1" stroke-width="0.45" d="M26 1.5 L49.5 15.25 L49.5 42.75 L26 56.5 L2.5 42.75 L2.5 15.25 Z"/></svg>`;
const HEX_PATTERN_URL = `url("data:image/svg+xml,${encodeURIComponent(HEX_TILE_SVG)}")`;

/** Fondo: panal, barrido, aurora lenta, viñeta. Sin partículas. */
const LOGIN_BG_CSS = `
@keyframes lmHexPan {
  0% { background-position: 0 0; }
  100% { background-position: 520px 300px; }
}
@keyframes lmScanBeam {
  0% { transform: translate3d(0, -120%, 0); opacity: 0; }
  8% { opacity: 1; }
  92% { opacity: 1; }
  100% { transform: translate3d(0, 120vh, 0); opacity: 0; }
}
@keyframes lmAuroraDrift {
  0%, 100% { transform: translate(-4%, -2%) rotate(-8deg) scale(1); opacity: 0.82; }
  50% { transform: translate(3%, 3%) rotate(6deg) scale(1.03); opacity: 1; }
}
.lm-aurora-layer {
  animation: lmAuroraDrift 52s ease-in-out infinite;
}
/* Fase “cargando sistema” dentro del card */
@keyframes lmLoginCardIntroBar {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
.lm-login-card-intro-bar-fill {
  transform-origin: left center;
  transform: scaleX(0);
  animation: lmLoginCardIntroBar var(--login-card-intro, 3s) cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes lmLoginCardIntroShimmer {
  0% { transform: translateX(-120%) skewX(-8deg); opacity: 0; }
  14% { opacity: 0.2; }
  100% { transform: translateX(120%) skewX(-8deg); opacity: 0; }
}
.lm-login-card-intro-shimmer {
  background: linear-gradient(
    105deg,
    transparent 0%,
    rgba(99, 102, 241, 0.05) 42%,
    rgba(34, 211, 238, 0.035) 50%,
    rgba(139, 92, 246, 0.05) 58%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: lmLoginCardIntroShimmer 11s ease-in-out infinite;
}
/* Revelado del contenido del card (una vez al terminar la fase intro) */
@keyframes lmLoginRevealIn {
  from { opacity: 0; transform: translate3d(0, 14px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}
.lm-login-reveal {
  opacity: 0;
  transform: translate3d(0, 14px, 0);
}
.lm-login-reveal--on {
  animation: lmLoginRevealIn 0.68s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: var(--reveal-d, 0ms);
}
@media (prefers-reduced-motion: reduce) {
  .lm-aurora-layer { animation: none; opacity: 0.92; }
  .lm-hex-layer { animation: none !important; }
  .lm-scan-layer { animation: none !important; opacity: 0; }
  .lm-login-card-intro-bar-fill { animation: none; transform: scaleX(1); }
  .lm-login-card-intro-shimmer { animation: none !important; opacity: 0; }
  .lm-login-reveal,
  .lm-login-reveal--on {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
`;

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginCardReady, setLoginCardReady] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  /* ambient spin ring — purely decorative */
  const [ring, setRing] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  useEffect(() => {
    const tick = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      setRing(((ts - startRef.current) % 3000) / 3000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (loginCardReady) return;
    const id = window.setTimeout(() => setLoginCardReady(true), LOGIN_CARD_INTRO_MS);
    return () => window.clearTimeout(id);
  }, [loginCardReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      const err = await login(email.trim(), password);
      if (err) {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const arcOffset = C * ring;
  const reveal = () => `lm-login-reveal ${loginCardReady ? 'lm-login-reveal--on' : ''}`;
  const revealStyle = (delayMs: number): React.CSSProperties =>
    ({ ['--reveal-d' as string]: `${delayMs}ms` });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950 overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: LOGIN_BG_CSS }} />

      {/* Fondo: blobs + aurora suave + panal + barrido */}
      <div
        className="pointer-events-none absolute inset-0 isolate overflow-hidden z-0"
        aria-hidden
      >
        <div
          className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full blur-[130px]"
          style={{ background: 'rgba(99,102,241,0.32)' }}
        />
        <div
          className="absolute -bottom-40 -right-20 h-[420px] w-[420px] rounded-full blur-[110px]"
          style={{ background: 'rgba(139,92,246,0.24)' }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[160px]"
          style={{ background: 'rgba(79,70,229,0.14)' }}
        />

        {/* Acentos fríos (datos / terminal) — encajan con índigo del sistema */}
        <div
          className="absolute -left-[10%] top-[12%] h-[min(520px,58vh)] w-[min(560px,62vw)] rounded-full blur-[115px]"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(34, 211, 238, 0.2) 0%, transparent 68%)',
          }}
        />
        <div
          className="absolute -right-[8%] bottom-[8%] h-[min(440px,52vh)] w-[min(480px,55vw)] rounded-full blur-[105px]"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(129, 140, 248, 0.22) 0%, transparent 65%)',
          }}
        />

        {/* Aurora: mancha índigo/cian más visible; animación controla opacidad */}
        <div
          className="lm-aurora-layer pointer-events-none absolute -left-[20%] top-[10%] h-[82vh] w-[110vw] max-w-[1000px] rounded-[45%] blur-[85px]"
          style={{
            background:
              'linear-gradient(118deg, rgba(99,102,241,0.55) 0%, rgba(34,211,238,0.28) 38%, rgba(139,92,246,0.42) 100%)',
          }}
        />

        {/* Panal hexagonal muy suave, movimiento lento */}
        <div
          className="lm-hex-layer absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage: HEX_PATTERN_URL,
            backgroundSize: '52px 60px',
            animation: 'lmHexPan 90s linear infinite',
          }}
        />

        {/* Barrido luminoso tenue (una vez / loop largo) */}
        <div
          className="lm-scan-layer pointer-events-none absolute inset-x-0 top-0 h-[min(180px,28vh)]"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, rgba(56, 189, 248, 0.14) 45%, transparent 100%)',
            animation: 'lmScanBeam 14s ease-in-out infinite',
          }}
        />
      </div>

      {/* Rejilla */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          opacity: 0.055,
          backgroundImage:
            'linear-gradient(rgba(165,180,252,0.9) 1px,transparent 1px),linear-gradient(90deg,rgba(165,180,252,0.9) 1px,transparent 1px)',
          backgroundSize: '52px 52px',
        }}
      />

      {/* Viñeta: oscurece bordes, centra la mirada en el card sin ruido */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background:
            'radial-gradient(ellipse 78% 72% at 50% 48%, transparent 0%, transparent 42%, rgba(2, 6, 23, 0.22) 78%, rgba(2, 6, 23, 0.48) 100%)',
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm mx-4">
        <div
          className="relative rounded-2xl p-8 flex flex-col items-center min-h-[min(520px,72vh)] justify-center"
          style={{
            background: 'rgba(15,23,42,0.85)',
            border: '1px solid rgba(99,102,241,0.18)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
            backdropFilter: 'blur(24px)',
            ['--login-card-intro' as string]: `${LOGIN_CARD_INTRO_MS}ms`,
          }}
          aria-busy={!loginCardReady}
        >
          {/* Fase post-preloader: solo texto + barra + barrido suave */}
          <div
            className={`absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden rounded-2xl transition-opacity duration-500 ease-out ${
              loginCardReady ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            style={{
              background: 'linear-gradient(165deg, rgba(15,23,42,0.98) 0%, rgba(30,27,75,0.52) 100%)',
            }}
            aria-hidden={loginCardReady}
          >
            <div
              className="lm-login-card-intro-shimmer pointer-events-none absolute inset-0 rounded-2xl opacity-90"
              aria-hidden
            />
            <div className="relative z-10 flex max-w-[280px] flex-col items-center px-6 text-center">
              <div
                className="mb-5 h-12 w-12 shrink-0 rounded-full border-[3px] border-indigo-950/70 border-t-indigo-400 border-r-violet-400/50 animate-spin motion-reduce:animate-none motion-reduce:border-t-indigo-400/80"
                style={{ boxShadow: '0 0 22px rgba(99, 102, 241, 0.35)' }}
                aria-hidden
              />
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Inicializando
              </p>
              <h2
                className="mb-8 text-lg font-bold tracking-tight sm:text-xl"
                style={{
                  background: 'linear-gradient(90deg, #fff 0%, #c4b5fd 45%, #818cf8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Cargando sistema inteligente
              </h2>
              <div className="w-full max-w-[240px]">
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <div
                    className="lm-login-card-intro-bar-fill h-full rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #22d3ee)',
                      boxShadow: '0 0 12px rgba(139,92,246,0.4)',
                    }}
                  />
                </div>
              </div>
              <p className="mt-5 text-[10px] tracking-wide text-slate-500">
                Preparando acceso seguro
              </p>
            </div>
          </div>

          <div
            className={`relative z-10 flex w-full flex-col items-center ${
              loginCardReady ? 'pointer-events-auto' : 'pointer-events-none select-none'
            }`}
            aria-hidden={!loginCardReady}
          >
          {/* Spinning ring + coin */}
          <div
            className={`relative mb-6 ${reveal()}`}
            style={{ ...revealStyle(0), width: 80, height: 80 }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)',
                filter: 'blur(10px)',
              }}
            />
            <svg width="80" height="80" viewBox="0 0 100 100"
              style={{ transform: 'rotate(-90deg)', display: 'block' }}>
              <defs>
                <linearGradient id="lg-ring" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6366F1" />
                  <stop offset="100%" stopColor="#A78BFA" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="44" fill="none"
                stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
              <circle cx="50" cy="50" r="44" fill="none"
                stroke="url(#lg-ring)" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={arcOffset}
                style={{ transition: 'stroke-dashoffset 0.05s linear' }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(99,102,241,0.5)',
              }}>
                <span style={{ fontSize: 22, lineHeight: 1, userSelect: 'none' }}>🪙</span>
              </div>
            </div>
          </div>

          {/* Brand */}
          <h1
            className={`mb-0.5 font-black tracking-tight whitespace-nowrap ${reveal()}`}
            style={{
              ...revealStyle(55),
              fontSize: '2rem',
              background: 'linear-gradient(90deg,#fff 0%,#C4B5FD 50%,#818CF8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            LA MONEDA
          </h1>
          <p
            className={`mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 ${reveal()}`}
            style={revealStyle(110)}
          >
            Gestión Financiera
          </p>
          <p
            className={`mb-7 text-[10px] font-medium uppercase tracking-[0.16em] text-white/95 [text-shadow:0_0_18px_rgba(255,255,255,0.35),0_0_10px_rgba(196,181,253,0.5)] ${reveal()}`}
            style={revealStyle(165)}
          >
            Flota · Taxis · InDrive
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div className={reveal()} style={revealStyle(220)}>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@lamoneda.com"
                required
                className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(99,102,241,0.22)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(139,92,246,0.6)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.22)'}
              />
            </div>

            <div className={reveal()} style={revealStyle(285)}>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-slate-600 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(99,102,241,0.22)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(139,92,246,0.6)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.22)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-red-300 transition-opacity duration-300"
                style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                {error}
              </div>
            )}

            {loginCardReady && (
            <button
              type="submit"
              disabled={loading}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${reveal()}`}
              style={{
                ...revealStyle(350),
                background: loading
                  ? 'rgba(99,102,241,0.5)'
                  : 'linear-gradient(135deg,#6366F1 0%,#8B5CF6 100%)',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(99,102,241,0.4)',
              }}
            >
              {loading ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <LogIn size={16} />
              )}
              <span>{loading ? 'Verificando…' : 'Ingresar'}</span>
            </button>
            )}
          </form>

          <p
            className={`mt-6 text-center text-[11px] text-slate-600 ${reveal()}`}
            style={revealStyle(415)}
          >
            La Moneda · Sistema privado de gestión
          </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
