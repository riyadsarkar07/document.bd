'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CreditCard, FileText, Landmark, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import { FieldLabel, Input } from '@/components/ui/input';
import { ThemeSwitcher } from '@/components/layout/theme-switcher';

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas p-6">
      {/* Decorative backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
      <div className="pointer-events-none absolute -left-40 top-0 h-[480px] w-[480px] rounded-full bg-accent/8 blur-[120px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[480px] w-[480px] rounded-full bg-violet/8 blur-[120px]" />

      <div className="absolute right-5 top-5 z-10">
        <ThemeSwitcher />
      </div>

      <div className="relative z-10 grid w-full max-w-4xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Brand panel */}
        <div className="hidden animate-fade-in flex-col justify-between rounded-3xl border border-line-strong bg-gradient-to-br from-surface via-surface to-accent-dim/40 p-10 shadow-deep lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-bright text-canvas shadow-glow">
              <Landmark className="h-6 w-6" />
            </div>
            <div>
              <div className="font-display text-lg font-bold text-primary">Document Studio</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-dimm">BD Gov Portal</div>
            </div>
          </div>

          <div>
            <h2 className="font-display text-3xl font-bold leading-tight text-primary">
              Government-grade document
              <span className="text-gradient-gold"> generation studio</span>
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
              Produce pixel-calibrated Trademark Certificates and National ID cards with a live canvas editor, versioned templates and a secured cloud vault.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                { icon: FileText, label: 'TM Certificate', sub: '2373 × 3508 px' },
                { icon: CreditCard, label: 'National ID', sub: '3570 × 2203 px' },
                { icon: ShieldCheck, label: 'Role-based access', sub: 'Admin · Editor · Viewer' },
                { icon: Landmark, label: 'Cloud Vault', sub: 'Autosaved & signed' },
              ].map((f) => (
                <div key={f.label} className="flex items-start gap-3 rounded-2xl border border-line bg-surface/70 p-3.5 backdrop-blur-sm">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent-bright">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-primary">{f.label}</div>
                    <div className="truncate font-mono text-[9.5px] text-dimm">{f.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="font-mono text-[10px] text-dimm">INTERNAL / DEMO — Government of the People&apos;s Republic of Bangladesh</p>
        </div>

        {/* Form card */}
        <div className="animate-slide-up rounded-3xl border border-line-strong bg-surface/85 p-8 shadow-deep backdrop-blur-xl sm:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-bright text-canvas shadow-glow">
              <Landmark className="h-8 w-8" />
            </div>
            <h1 className="font-display text-2xl font-bold text-primary">Welcome back</h1>
            <p className="mt-1.5 max-w-[300px] text-[12.5px] text-muted">
              Sign in to access the BD Government Document Studio
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger animate-slide-in-right">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-5">
              <div>
                <FieldLabel htmlFor="login-email">Email Address</FieldLabel>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="admin@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="login-password">Password</FieldLabel>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-1">
                Sign In to Portal
              </Button>
              <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 py-2.5">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent-bright" />
                <p className="font-mono text-[10.5px] text-dimm">Secured by Supabase Authentication</p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
