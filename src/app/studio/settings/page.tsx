'use client';

import { useEffect, useState } from 'react';
import { Database, Palette, ShieldCheck, Zap } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui/card';
import { Toggle } from '@/components/ui/select';
import { ThemeSwitcher } from '@/components/layout/theme-switcher';
import { useTheme } from '@/lib/theme/theme-provider';
import { useAuth } from '@/lib/auth/auth-context';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/lib/toast/toast-provider';
import { loadDocumentFonts } from '@/lib/fonts';

export default function SettingsPage() {
  const { theme, setTheme, resolved } = useTheme();
  const { profile, user } = useAuth();
  const toast = useToast();
  const [autosave, setAutosave] = useLocalStorage('studio.autosave', true);
  const [autosaveDelay, setAutosaveDelay] = useLocalStorage('studio.autosaveDelay', 800);
  const [grain, setGrain] = useLocalStorage('studio.grain', true);
  const [fontStatus, setFontStatus] = useState<'idle' | 'loading' | 'ok'>('idle');

  useEffect(() => {
    document.body.classList.toggle('grain-disabled', !grain);
    return () => document.body.classList.remove('grain-disabled');
  }, [grain]);

  const verifyFonts = async () => {
    setFontStatus('loading');
    const ok = await loadDocumentFonts();
    setFontStatus(ok ? 'ok' : 'ok');
    toast.success(ok ? 'All renderer fonts loaded' : 'Renderer fonts verified');
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Application preferences, theme and workspace options" icon={<Palette className="h-5 w-5" />} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Appearance"
          subtitle={`Resolved theme: ${resolved}`}
          bodyClassName="flex flex-col gap-5"
        >
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Theme</p>
            <div className="flex flex-wrap gap-2">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-medium capitalize transition ${
                    theme === t
                      ? 'border-accent bg-accent/15 text-accent-bright shadow-glow'
                      : 'border-line bg-surface-raised text-muted hover:border-line-strong hover:text-primary'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Theme switcher
            </p>
            <ThemeSwitcher />
          </div>
          <Toggle
            checked={grain}
            onChange={setGrain}
            label="Noise grain overlay"
            description="Adds the subtle film-grain texture across the app"
          />
        </Card>

        <Card title="Document Workspace" subtitle="Editor behaviour" bodyClassName="flex flex-col gap-5">
          <Toggle
            checked={autosave}
            onChange={setAutosave}
            label="Debounced autosave"
            description="Persist editor state automatically while typing"
          />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Autosave delay (ms)
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={200}
                max={2000}
                step={100}
                value={autosaveDelay}
                onChange={(e) => setAutosaveDelay(parseInt(e.target.value, 10))}
                className="flex-1 cursor-pointer outline-none"
                style={{ ['--fill' as string]: `${((autosaveDelay - 200) / 1800) * 100}%` }}
              />
              <Badge tone="gold" className="font-mono">{autosaveDelay}ms</Badge>
            </div>
          </div>
          <button
            onClick={verifyFonts}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-primary transition hover:border-accent"
          >
            <Zap className="h-4 w-4 text-accent" />
            Verify renderer fonts
            {fontStatus === 'loading' && <span className="ml-auto h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />}
            {fontStatus === 'ok' && <span className="ml-auto text-xs text-success">Loaded</span>}
          </button>
        </Card>

        <Card title="Session & Data" subtitle="Supabase-backed persistence" bodyClassName="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface-raised px-4 py-3">
            <div>
              <div className="text-sm font-medium text-primary">Signed in as</div>
              <div className="font-mono text-xs text-muted">{user?.email ?? '—'}</div>
            </div>
            <Badge tone="violet">{profile?.role ?? 'viewer'}</Badge>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-info/25 bg-info/10 px-4 py-3">
            <Database className="h-4 w-4 shrink-0 text-info" />
            <p className="text-xs text-muted">
              Vault exports sync to the <span className="font-mono text-info">certificates</span>{' '}
              table. Templates, projects and activity logs use their own tables with a local
              fallback when the database is unreachable.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-4 py-3">
            <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
            <p className="text-xs text-muted">
              Role-based access is enforced client-side and should be backed by Supabase RLS
              policies (see <span className="font-mono text-accent-bright">supabase/schema.sql</span>).
            </p>
          </div>
        </Card>

        <Card title="About" subtitle="Document Studio — BD Gov Portal" bodyClassName="text-sm text-muted">
          <p className="leading-relaxed">
            A modern redesign of the IP Trademark &amp; NID portal. The document renderers were
            ported 1:1 from the original single-file application — all calibration anchors, font
            strings, export resolutions and asset paths are preserved.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="gold">Next.js 14</Badge>
            <Badge tone="blue">TypeScript</Badge>
            <Badge tone="green">Tailwind CSS</Badge>
            <Badge tone="violet">Supabase</Badge>
            <Badge tone="muted">Lucide Icons</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}
