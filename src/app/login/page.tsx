'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CreditCard,
  FileText,
  KeyRound,
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

const STATUS_ITEMS = [
  { label: 'SYSTEM ONLINE', detail: 'PORT 443', ok: true },
  { label: 'SECURE SESSION', detail: 'TOKEN VERIFIED', ok: true },
  { label: 'ENCRYPTED CONNECTION', detail: 'TLS 1.3', ok: true },
];

const FEATURES = [
  { icon: FileText, label: 'TM Certificate', sub: '2373 × 3508 px' },
  { icon: CreditCard, label: 'National ID', sub: '3570 × 2203 px' },
  { icon: KeyRound, label: 'Role-based access', sub: 'Admin · Editor · Viewer' },
  { icon: LockKeyhole, label: 'Cloud Vault', sub: 'Autosaved & signed' },
];

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace('/studio');
  }, [user, router]);

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black p-4 sm:p-6">
      {/* Cyber backdrop */}
      <div className="cyber-grid pointer-events-none absolute inset-0" />
      <div className="cyber-scanlines pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute -left-40 top-0 h-[520px] w-[520px] rounded-full bg-emerald-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[520px] w-[520px] rounded-full bg-cyan-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeSwitcher variant="cyber" />
      </div>

      <div className="relative z-10 grid w-full max-w-5xl gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
        {/* Left panel — cyber command center */}
        <div className="cyber-ring relative hidden animate-fade-in flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-[#05080f] via-[#070b14] to-[#04130d] p-8 backdrop-blur-xl lg:flex">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-[90px]" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-[90px]" />

          {/* Header */}
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.25)]">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <div className="font-display text-lg font-bold text-primary">Document Studio</div>
                <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-emerald-300/70">
                  BD Gov Portal
                </div>
              </div>
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
              secure node
            </span>
          </div>

          {/* Hero copy */}
          <div className="relative mt-8">
            <h2 className="font-display text-3xl font-bold leading-tight text-primary">
              Government-grade document
              <span className="text-gradient-gold"> generation studio</span>
            </h2>
            <p className="mt-3 max-w-md font-mono text-[12px] leading-relaxed text-muted">
              Pixel-calibrated Trademark Certificates and National ID cards rendered on a live
              canvas — versioned templates, a secured cloud vault, role-based control.
            </p>
          </div>

          {/* Terminal readout */}
          <div className="relative mt-7 overflow-hidden rounded-2xl border border-line-strong/70 bg-black/45 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-danger/80" />
              <span className="h-2 w-2 rounded-full bg-warning/80" />
              <span className="h-2 w-2 rounded-full bg-success/80" />
              <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.18em] text-dimm">
                access_gate.sh
              </span>
            </div>
            <div className="space-y-1.5 p-4 font-mono text-[11px] leading-relaxed">
              <p className="text-emerald-300/90">
                <span className="text-accent-bright">&gt;</span> initializing secure gateway…
                <span className="cyber-caret text-emerald-300">▌</span>
              </p>
              {STATUS_ITEMS.map((s) => (
                <p key={s.label} className="flex items-center justify-between text-dimm">
                  <span>
                    <span className="text-emerald-300/80">[</span> {s.label}{' '}
                    <span className="text-emerald-300/80">]</span>
                  </span>
                  <span className={s.ok ? 'text-emerald-300/90' : 'text-warning'}>
                    {s.detail}
                    {s.ok ? ' ✓' : ' …'}
                  </span>
                </p>
              ))}
            </div>
          </div>

          {/* Feature cards */}
          <div className="relative mt-6 grid grid-cols-2 gap-3">
            {FEATURES.map((f) => (
              <div
                key={f.label}
                className="flex items-start gap-2.5 rounded-xl border border-line-strong/60 bg-black/30 p-3 backdrop-blur-sm transition-colors hover:border-emerald-400/30"
              >
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                  <f.icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-primary">{f.label}</div>
                  <div className="truncate font-mono text-[9px] text-dimm">{f.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="relative mt-7 border-t border-line pt-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-dimm">
              INTERNAL / DEMO — Government of the People&apos;s Republic of Bangladesh
            </p>
          </div>
        </div>

        {/* Right panel — access portal */}
        <div className="cyber-ring relative animate-slide-up rounded-3xl bg-gradient-to-b from-[#080c17]/95 via-[#070b14]/95 to-[#04130d]/95 p-6 backdrop-blur-xl sm:p-8">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

          <div className="flex flex-col items-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 shadow-[0_0_28px_rgba(34,211,238,0.25)]">
              <LockKeyhole className="h-7 w-7" />
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-300/80">
              authentication required
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold text-primary">ACCESS PORTAL</h1>
            <p className="mt-2 max-w-[320px] text-[12.5px] leading-relaxed text-muted">
              Authenticate to enter the BD Government Document Studio. Your identity is verified
              against the secure registry before access is granted.
            </p>
          </div>

          {error && (
            <div className="mt-6 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger animate-slide-in-right">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="mt-6">
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
                    className="!border-emerald-400/25 !bg-black/40 focus:!border-emerald-400 focus:!ring-emerald-400/25"
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
                    className="!border-emerald-400/25 !bg-black/40 focus:!border-emerald-400 focus:!ring-emerald-400/25"
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
                <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-black/30 px-3 py-2.5">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                  <p className="font-mono text-[10.5px] text-dimm">
                    Secured by Supabase Authentication
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
