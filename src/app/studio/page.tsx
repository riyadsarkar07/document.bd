'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CreditCard,
  FilePen,
  FileText,
  History,
  Landmark,
  Lock,
  Package,
  Shapes,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { hasToolAccess, type ToolScope } from '@/lib/workspace/access';
import { useAccessGate } from '@/components/layout/access-gate';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { loadVault } from '@/lib/workspace/vault';
import { listTemplates, listProjects, getScopedStorageKey } from '@/lib/workspace/store';
import { cn, timeAgo } from '@/lib/utils';
import type { ActivityRecord } from '@/lib/auth/types';

export default function DashboardPage() {
  const { profile } = useAuth();
  const { denyAccess } = useAccessGate();
  const [stats, setStats] = useState({
    records: 0,
    templates: 0,
    projects: 0,
    lastSync: null as string | null,
  });
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [vault, tpl, proj] = await Promise.all([loadVault(), listTemplates(), listProjects()]);
      setStats({
        records: vault.records.length,
        templates: tpl.data.length,
        projects: proj.data.length,
        lastSync: vault.records[0]?.timestamp ?? null,
      });
      try {
        const activityKey = await getScopedStorageKey('studio.activity');
        const local = JSON.parse(window.localStorage.getItem(activityKey) || '[]') as ActivityRecord[];
        setActivity(local.slice(0, 5));
      } catch {
        setActivity([]);
      }
      setLoading(false);
    })();
  }, []);

  const firstName =
    profile?.full_name?.split(' ')[0] || profile?.email?.split('@')[0] || 'Guest';
  const role = profile?.role ?? 'viewer';

  return (
    <div>
      {/* Hero band */}
      <div className="relative mb-8 overflow-hidden rounded-3xl border border-line-strong bg-gradient-to-br from-surface via-surface to-accent-dim/40 p-8 shadow-deep">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-accent/10 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-20 right-40 h-48 w-48 rounded-full bg-violet/8 blur-[90px]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge tone="gold" className="uppercase">
                <Zap className="h-3 w-3" /> Live Studio
              </Badge>
              <Badge tone="violet">Role: {role}</Badge>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-primary">
              Welcome back, <span className="text-gradient-gold">{firstName}</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Design, calibrate and export government documents — live canvas rendering,
              versioned templates and a secured cloud vault.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {hasToolAccess(profile, 'tm') ? (
              <Link href="/studio/editor/tm">
                <Button variant="secondary" icon={<FileText className="h-4 w-4" />}>
                  TM Certificate
                </Button>
              </Link>
            ) : (
              <Button variant="secondary" icon={<Lock className="h-4 w-4" />} onClick={denyAccess}>
                TM Certificate
              </Button>
            )}
            {hasToolAccess(profile, 'nid') ? (
              <Link href="/studio/editor/nid">
                <Button variant="primary" icon={<CreditCard className="h-4 w-4" />}>
                  NID Card
                </Button>
              </Link>
            ) : (
              <Button variant="primary" icon={<Lock className="h-4 w-4" />} onClick={denyAccess}>
                NID Card
              </Button>
            )}
            {hasToolAccess(profile, 'tin') ? (
              <Link href="/studio/editor/tin">
                <Button variant="success" icon={<Landmark className="h-4 w-4" />}>
                  TIN Record
                </Button>
              </Link>
            ) : (
              <Button variant="success" icon={<Lock className="h-4 w-4" />} onClick={denyAccess}>
                TIN Record
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {hasToolAccess(profile, 'history') ? (
          <Link href="/studio/history">
            <StatCard
              label="Vault Records"
              value={stats.records}
              hint={stats.lastSync ? `Last sync ${timeAgo(stats.lastSync)}` : 'No syncs yet'}
              icon={<History className="h-5 w-5" />}
              tone="gold"
              loading={loading}
            />
          </Link>
        ) : (
          <button type="button" className="w-full text-left" onClick={denyAccess}>
            <StatCard
              label="Vault Records"
              value={stats.records}
              hint="Admin permission required"
              icon={<Lock className="h-5 w-5" />}
              tone="gold"
              loading={loading}
            />
          </button>
        )}
        {hasToolAccess(profile, 'templates') ? (
          <Link href="/studio/templates">
            <StatCard
              label="Templates"
              value={stats.templates}
              hint="Reusable document presets"
              icon={<Shapes className="h-5 w-5" />}
              tone="blue"
              loading={loading}
            />
          </Link>
        ) : (
          <button type="button" className="w-full text-left" onClick={denyAccess}>
            <StatCard
              label="Templates"
              value={stats.templates}
              hint="Admin permission required"
              icon={<Lock className="h-5 w-5" />}
              tone="blue"
              loading={loading}
            />
          </button>
        )}
        {hasToolAccess(profile, 'projects') ? (
          <Link href="/studio/projects">
            <StatCard
              label="Projects"
              value={stats.projects}
              hint="Saved working documents"
              icon={<Package className="h-5 w-5" />}
              tone="green"
              loading={loading}
            />
          </Link>
        ) : (
          <button type="button" className="w-full text-left" onClick={denyAccess}>
            <StatCard
              label="Projects"
              value={stats.projects}
              hint="Admin permission required"
              icon={<Lock className="h-5 w-5" />}
              tone="green"
              loading={loading}
            />
          </button>
        )}
        <StatCard
          label="Assets"
          value="7"
          hint="Backgrounds, fonts, seals"
          icon={<Sparkles className="h-5 w-5" />}
          tone="violet"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Quick Actions"
          subtitle="Jump into the studio workbench"
          bodyClassName="p-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {[
            {
              href: '/studio/editor/tm',
              title: 'Trademark Certificate Editor',
              desc: 'Render & export IP trademark certificates with exact anchor calibration.',
              icon: FileText,
              tone: 'from-accent to-accent-bright text-canvas',
              meta: '2373 × 3508 px',
              scope: 'tm',
            },
            {
              href: '/studio/editor/nid',
              title: 'NID Card Editor',
              desc: 'Compose national ID cards with Kalpurush & Arial absolute positioning.',
              icon: CreditCard,
              tone: 'from-info to-blue-500 text-white',
              meta: '3570 × 2203 px',
              scope: 'nid',
            },
            {
              href: '/studio/editor/tin',
              title: 'TIN Record Editor',
              desc: 'Edit a DEMO TIN information record with live QR — not an NBR certificate.',
              icon: Landmark,
              tone: 'from-success to-emerald-500 text-white',
              meta: '2480 × 3508 px',
              scope: 'tin',
            },
            {
              href: '/studio/editor/pdf',
              title: 'PDF Editor',
              desc: 'Upload a PDF, annotate pages, then export without leaving the studio.',
              icon: FilePen,
              tone: 'from-warning to-amber-500 text-canvas',
              meta: 'Client-side only',
              scope: 'pdf',
            },
            {
              href: '/studio/templates',
              title: 'Template Gallery',
              desc: 'Browse and manage reusable document templates.',
              icon: Shapes,
              tone: 'from-success to-emerald-500 text-white',
              meta: `${stats.templates} saved`,
              scope: 'templates',
            },
            {
              href: '/studio/history',
              title: 'Cloud Vault',
              desc: 'Review archived certificate exports and live verification links.',
              icon: History,
              tone: 'from-violet-500 to-purple-600 text-white',
              meta: `${stats.records} archived`,
              scope: 'history',
            },
          ]
            .map((q) => {
            const locked = !hasToolAccess(profile, q.scope as ToolScope);
            const className = cn(
              'group rounded-2xl border border-line bg-surface-raised p-5 text-left transition',
              locked
                ? 'cursor-not-allowed opacity-80'
                : 'hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-pop',
            );
            const inner = (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${q.tone}`}>
                    {locked ? <Lock className="h-5 w-5" /> : <q.icon className="h-5 w-5" />}
                  </div>
                  <span className="font-mono text-[9.5px] uppercase tracking-wider text-dimm">
                    {locked ? 'Locked' : q.meta}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-medium text-primary">
                  {q.title}
                  {locked ? (
                    <Lock className="h-3.5 w-3.5 text-dimm" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 text-dimm transition group-hover:translate-x-0.5 group-hover:text-accent-bright" />
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {locked ? 'Admin permission required' : q.desc}
                </p>
              </>
            );
            if (locked) {
              return (
                <button
                  key={q.href}
                  type="button"
                  onClick={denyAccess}
                  className={className}
                  aria-disabled="true"
                  aria-label={`${q.title}, Admin permission required`}
                >
                  {inner}
                </button>
              );
            }
            return (
              <Link key={q.href} href={q.href} className={className}>
                {inner}
              </Link>
            );
          })}
        </Card>

        <Card title="Recent Activity" subtitle="Latest actions in this workspace">
          {activity.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Sparkles className="h-8 w-8 text-dimm" />
              <p className="text-xs text-muted">
                No activity yet — actions you take will appear here.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {activity.map((a, i) => (
                <li key={a.id ?? i} className="flex items-start gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent shadow-glow" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-primary">{a.action}</div>
                    {a.detail && <div className="mt-0.5 truncate text-xs text-muted">{a.detail}</div>}
                    <div className="mt-0.5 font-mono text-[10.5px] text-dimm">{timeAgo(a.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Badge tone="violet">Role: {role}</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}
