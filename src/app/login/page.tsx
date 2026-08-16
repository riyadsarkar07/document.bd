'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Fingerprint,
  Landmark,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import { FieldLabel, Input } from '@/components/ui/input';
import { ThemeSwitcher } from '@/components/layout/theme-switcher';
import { cn } from '@/lib/utils';

const TERMINAL_LINES = [
  '> initializing secure gateway...',
  '> checking session...',
  '> establishing encrypted channel...',
  '> connection ready',
];

const TERMINAL_STATUS = [
  { label: 'SYSTEM ONLINE', value: '✓', ok: true },
  { label: 'SESSION READY', value: '✓', ok: true },
  { label: 'ACCESS GATE', value: 'ACTIVE', ok: true },
];

const PARTICLES = Array.from({ length: 16 }, (_, i) => {
  const seed = (n: number) => {
    const s = Math.sin(n) * 10000;
    return s - Math.floor(s);
  };
  return {
    x: 4 + seed(i * 1.7) * 92,
    y: 4 + seed(i * 3.1) * 92,
    size: 1.5 + (i % 3) * 0.6,
    dur: 14 + (i % 6) * 3,
    delay: seed(i * 0.9) * 8,
    opacity: 0.22 + (i % 3) * 0.12,
    color: i % 2 === 0 ? 'rgba(52,211,153,0.75)' : 'rgba(34,211,238,0.7)',
  };
});

const cssVars = (vars: Record<string, string>): React.CSSProperties => vars as unknown as React.CSSProperties;

function useMediaBool(query: string) {
  const [matches, setMatches] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

type TerminalMode = 'pending' | 'typing' | 'instant';

function useTerminal(mode: TerminalMode, startDelay: number) {
  const [completed, setCompleted] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (mode === 'pending') return;
    setCompleted([]);
    setCurrent('');
    setDone(false);

    if (mode === 'instant') {
      setCompleted(TERMINAL_LINES);
      setDone(true);
      return;
    }

    let cancelled = false;
    let lineIndex = 0;
    let charIndex = 0;
    let interval: ReturnType<typeof setInterval> | null = null;

    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        if (cancelled) return;
        if (lineIndex >= TERMINAL_LINES.length) {
          if (interval) clearInterval(interval);
          setDone(true);
          return;
        }
        const line = TERMINAL_LINES[lineIndex];
        charIndex += 1;
        if (charIndex <= line.length) {
          setCurrent(line.slice(0, charIndex));
        } else {
          setCompleted((prev) => [...prev, line]);
          setCurrent('');
          lineIndex += 1;
          charIndex = 0;
        }
      }, 28);
    }, startDelay);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [mode, startDelay]);

  return { completed, current, done };
}

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const isDesktop = useMediaBool('(min-width: 1024px)');
  const reduced = useMediaBool('(prefers-reduced-motion: reduce)');
  const terminalMode: TerminalMode = reduced
    ? 'instant'
    : isDesktop === true
      ? 'typing'
      : isDesktop === false
        ? 'instant'
        : 'pending';
  const { completed, current, done } = useTerminal(terminalMode, 600);

  useEffect(() => {
    if (user) router.replace('/studio');
  }, [user, router]);

  useEffect(() => {
    const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');
    if (reducedMq.matches || !finePointer.matches) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: MouseEvent) => {
      x = e.clientX / window.innerWidth - 0.5;
      y = e.clientY / window.innerHeight - 0.5;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          const el = rootRef.current;
          if (el) {
            el.style.setProperty('--mx', x.toFixed(4));
            el.style.setProperty('--my', y.toFixed(4));
          }
        });
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Please fill in both fields.');
      return;
    }
    setBusy(true);
    const result = await signIn(email.trim(), password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace('/studio');
  };

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-screen flex-col overflow-hidden bg-[#020407]"
    >
      {/* ── Background layers ── */}
      <div className="cyber-canvas pointer-events-none absolute inset-0" />
      <div className="cyber-parallax-bg pointer-events-none absolute inset-0 overflow-hidden">
        <div className="cyber-grid-layer cyber-grid-pan" />
      </div>
      <div className="cyber-parallax-glow pointer-events-none absolute inset-0">
        <div className="cyber-breath absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[140px]" />
        <div
          className="cyber-breath absolute -right-32 top-10 h-[420px] w-[420px] rounded-full bg-cyan-500/10 blur-[120px]"
          style={{ animationDelay: '1.6s' }}
        />
      </div>
      <div className="cyber-scan cyber-scan-anim pointer-events-none" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="cyber-particle"
            style={cssVars({
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              color: p.color,
              '--p-dur': `${p.dur}s`,
              '--p-delay': `${p.delay}s`,
              '--p-o': `${p.opacity}`,
            })}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/25 to-transparent" />

      {/* ── Center security orbit (desktop) ── */}
      <div className="cyber-parallax-orbit pointer-events-none absolute left-1/2 top-1/2 z-0 hidden h-[280px] w-[280px] lg:block">
        <div className="absolute inset-0 rounded-full border border-emerald-400/12" />
        <div className="absolute inset-10 rounded-full border border-cyan-400/10" />
        <div className="absolute inset-20 rounded-full border border-emerald-400/8" />
        <div className="cyber-spin-cw absolute inset-1 rounded-full">
          <div className="cyber-seg absolute inset-0 rounded-full" />
        </div>
        <div className="cyber-spin-ccw absolute inset-8 rounded-full" style={{ animationDuration: '42s' }}>
          <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
        </div>
        <div className="cyber-spin-cw absolute inset-14 rounded-full" style={{ animationDuration: '21s' }}>
          <span className="absolute left-1/2 top-0 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
        </div>
        {[0, 90, 180, 270].map((deg) => (
          <span
            key={deg}
            className="absolute left-1/2 top-1/2 h-2 w-px bg-emerald-400/40"
            style={{ transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-140px)` }}
          />
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/5 text-emerald-300 shadow-[0_0_30px_rgba(52,211,153,0.15)]">
            <Fingerprint className="h-6 w-6" />
          </div>
        </div>
      </div>

      <div className="absolute right-4 top-4 z-40 sm:right-6 sm:top-6">
        <ThemeSwitcher variant="cyber" />
      </div>

      {/* ── Mobile / tablet compact brand header ── */}
      <header className="relative z-10 md:hidden">
        <div className="flex items-center justify-between px-5 pt-6">
          <div className="cyber-in flex items-center gap-3" style={{ animationDelay: '100ms' }}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.22)]">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-[15px] font-semibold leading-tight text-white">
                Document Studio
              </div>
              <div className="font-mono text-[8px] uppercase tracking-[0.26em] text-emerald-300/70">
                BD Gov Portal
              </div>
            </div>
          </div>
          <span className="cyber-in flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-emerald-300" style={{ animationDelay: '150ms' }}>
            <span className="cyber-pulse h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            secure node
          </span>
        </div>
        <div className="mx-auto mt-4 w-full max-w-md px-5">
          <div
            className="cyber-in-t overflow-hidden rounded-xl border border-emerald-400/15 bg-[#050a12]/80 backdrop-blur-sm"
            style={{ animationDelay: '200ms' }}
          >
            <div className="px-3.5 py-2 font-mono text-[10px] text-emerald-300/80">
              <span className="text-emerald-400/70">&gt;</span> secure gateway online
              <span className="cyber-caret text-emerald-300">▌</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main layout ── */}
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-7 px-5 py-8 sm:px-8 md:grid md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-center md:gap-8 md:py-10 lg:gap-10 xl:gap-14">
        {/* Left — command center */}
        <aside className="cyber-in hidden flex-col md:flex" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.22)]">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <div className="font-display text-lg font-semibold leading-tight text-white">
                  Document Studio
                </div>
                <div className="font-mono text-[9px] uppercase tracking-[0.26em] text-emerald-300/70">
                  BD Gov Portal
                </div>
              </div>
            </div>
            <span className="cyber-flicker flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-300">
              <span className="cyber-pulse h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
              secure node
            </span>
          </div>

          <div className="mt-9">
            <div className="font-mono text-[9px] uppercase tracking-[0.32em] text-emerald-300/60">
              Document Studio
            </div>
            <h2 className="mt-2 font-body text-[28px] font-semibold leading-tight tracking-[0.06em] text-white">
              ACCESS TERMINAL
            </h2>
            <p className="mt-2 font-mono text-[10px] tracking-[0.08em] text-slate-500">
              Authorized personnel only — credentials required for entry.
            </p>
          </div>

          {/* Terminal window */}
          <div
            className="cyber-in-t mt-7 overflow-hidden rounded-xl border border-emerald-400/20 bg-[#050a12]/80 backdrop-blur-sm"
            style={{ animationDelay: '200ms' }}
          >
            <div className="flex items-center gap-1.5 border-b border-white/5 bg-white/[0.02] px-3.5 py-2">
              <span className="h-2 w-2 rounded-full bg-rose-400/70" />
              <span className="h-2 w-2 rounded-full bg-amber-400/70" />
              <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
              <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                security_terminal
              </span>
            </div>
            <div className="p-4 font-mono text-[11px] leading-[1.75]">
              {completed.map((line) => (
                <p key={line} className="text-emerald-300/90">
                  {line}
                </p>
              ))}
              {!done && (
                <p className="text-emerald-300/90">
                  {current}
                  <span className="cyber-caret text-emerald-300">▌</span>
                </p>
              )}
              {done && (
                <>
                  {TERMINAL_STATUS.map((s) => (
                    <p
                      key={s.label}
                      className="flex items-center justify-between gap-3 text-slate-400"
                    >
                      <span className="truncate">
                        <span className="text-emerald-300/80">[</span> {s.label}{' '}
                        <span className="text-emerald-300/80">]</span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0',
                          s.ok ? 'text-emerald-300' : 'text-amber-300',
                        )}
                      >
                        {s.value}
                      </span>
                    </p>
                  ))}
                  <p className="mt-2.5 text-slate-500">
                    <span className="text-emerald-400/70">$</span> access granted — welcome
                    <span className="cyber-caret text-emerald-300">▌</span>
                  </p>
                </>
              )}
            </div>
          </div>
        </aside>

        {/* Right — login panel */}
        <section className="cyber-in-p relative mx-auto w-full max-w-md md:mx-0 md:justify-self-end">
          <div className="cyber-panel-glow relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-[#070c16]/75 p-6 backdrop-blur-2xl sm:p-8">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />

            <div className="flex flex-col items-center text-center">
              <div className="cyber-lock-glow flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/5 text-cyan-300">
                <LockKeyhole className="h-7 w-7" />
              </div>
              <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-300/70">
                authentication required
              </div>
              <h1 className="mt-2.5 font-body text-[26px] font-semibold leading-tight tracking-[0.12em] text-white">
                ACCESS PORTAL
              </h1>
              <p className="mt-2.5 max-w-[300px] text-[12.5px] leading-relaxed text-slate-400">
                Sign in to access Document Studio.
              </p>
            </div>

            {error && (
              <div className="mt-6 flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-[12.5px] text-rose-300 animate-slide-in-right">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="text-left">{error}</span>
              </div>
            )}

            <div className="mt-7">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-300" />
                </div>
              ) : (
                <form onSubmit={submit} className="flex flex-col gap-5">
                  <div>
                    <FieldLabel
                      htmlFor="login-email"
                      className="font-mono !tracking-[0.25em] !text-emerald-300/80"
                    >
                      Email Address
                    </FieldLabel>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="admin@example.com"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="!border-emerald-400/25 !bg-[#060b14]/85 focus:!border-emerald-400 focus:!ring-emerald-400/25 focus:!shadow-[0_0_0_1px_rgba(52,211,153,0.3),0_0_22px_rgba(52,211,153,0.14)]"
                    />
                  </div>
                  <div>
                    <FieldLabel
                      htmlFor="login-password"
                      className="font-mono !tracking-[0.25em] !text-emerald-300/80"
                    >
                      Password
                    </FieldLabel>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••••"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="!border-emerald-400/25 !bg-[#060b14]/85 focus:!border-emerald-400 focus:!ring-emerald-400/25 focus:!shadow-[0_0_0_1px_rgba(52,211,153,0.3),0_0_22px_rgba(52,211,153,0.14)]"
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="cyber"
                    size="lg"
                    loading={busy}
                    className="mt-1 w-full"
                  >
                    <TerminalSquare className="h-4 w-4" />
                    Sign In to Portal
                  </Button>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400/15 bg-black/30 px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                          Auth Service
                        </div>
                        <div className="font-mono text-[10px] tracking-[0.06em] text-emerald-200/90">
                          Secure Session
                        </div>
                      </div>
                    </div>
                    <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-300/80">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]',
                          done && 'cyber-pulse',
                        )}
                      />
                      {done ? 'secured' : 'linking…'}
                    </span>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
