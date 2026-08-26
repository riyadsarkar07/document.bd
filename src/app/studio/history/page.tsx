'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, History, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import {
  listVaultRecords,
  listVaultOwnerOptions,
  trashVaultRecord,
  restoreVaultRecord,
  permanentDeleteVaultRecord,
  liveVerifyUrl,
  resolveCreatorEmails,
  type VaultRecord,
} from '@/lib/workspace/vault';
import { renderTMCertificate } from '@/lib/renderers/tmRenderer';
import { loadImage, loadDataUrlImage } from '@/lib/images';
import { TM_BACKGROUND, TM_SIGNATURE } from '@/lib/constants/tm';
import { useAuth } from '@/lib/auth/auth-context';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { useToast } from '@/lib/toast/toast-provider';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const toast = useToast();
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [records, setRecords] = useState<VaultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VaultRecord | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [trashTarget, setTrashTarget] = useState<VaultRecord | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<VaultRecord | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<VaultRecord | null>(null);

  const [view, setView] = useState<'active' | 'trashed'>('active');
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('');
  const [owner, setOwner] = useState('');
  const [type, setType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [ownerOptions, setOwnerOptions] = useState<{ id: string; email: string }[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // The Users page links here with ?createdBy=<user-id> to pre-filter the vault.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cb = new URLSearchParams(window.location.search).get('createdBy');
    if (cb) setCreatedBy(cb);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void listVaultOwnerOptions().then((res) => {
        if (!res.error) setOwnerOptions(res.options);
      });
    }
  }, [isAdmin]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await listVaultRecords({
      search,
      company,
      owner,
      type,
      createdBy,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      status: view,
      page,
      pageSize: PAGE_SIZE,
    });
    if (res.error) {
      setError(res.error);
      setRecords([]);
      setTotal(0);
    } else {
      const resolved = await resolveCreatorEmails(res.records, {
        currentUserId: user?.id,
        currentUserEmail: user?.email ?? profile?.email ?? null,
        role: profile?.role ?? null,
      });
      setRecords(resolved);
      setTotal(res.total);
      setError(null);
    }
    setLoading(false);
  }, [search, company, owner, type, dateFrom, dateTo, createdBy, view, page, user, profile]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 200);
    return () => clearTimeout(t);
  }, [refresh]);

  const openPreview = async (record: VaultRecord) => {
    setPreview(record);
    setPreviewImg(null);
    const bg = await loadImage(TM_BACKGROUND);
    const sign = await loadImage(TM_SIGNATURE);
    const logo = record.logoDataUrl ? await loadDataUrlImage(record.logoDataUrl) : null;
    const canvas = document.createElement('canvas');
    renderTMCertificate(canvas, record, bg, logo, sign);
    setPreviewImg(canvas.toDataURL('image/jpeg', 0.96));
  };

  const downloadRecord = async (record: VaultRecord) => {
    toast.success('Preparing download…');
    const bg = await loadImage(TM_BACKGROUND);
    const sign = await loadImage(TM_SIGNATURE);
    const logo = record.logoDataUrl ? await loadDataUrlImage(record.logoDataUrl) : null;
    const canvas = document.createElement('canvas');
    renderTMCertificate(canvas, record, bg, logo, sign);
    const link = document.createElement('a');
    link.download = `Archive-TM-${record.trademarkNo || 'cert'}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.96);
    link.click();
    toast.success(`Downloaded: TM No. ${record.trademarkNo}`);
  };

  const moveToTrash = async () => {
    const trademarkNo = trashTarget?.trademarkNo;
    if (!trademarkNo) return;
    const res = await trashVaultRecord(trademarkNo);
    if (res.error) toast.error(res.error);
    else toast.success('Record moved to Trash');
    setTrashTarget(null);
    await refresh();
  };

  const restore = async () => {
    const trademarkNo = restoreTarget?.trademarkNo;
    if (!trademarkNo) return;
    const res = await restoreVaultRecord(trademarkNo);
    if (res.error) toast.error(res.error);
    else toast.success('Record restored to the vault');
    setRestoreTarget(null);
    await refresh();
  };

  const purge = async () => {
    const trademarkNo = purgeTarget?.trademarkNo;
    if (!trademarkNo) return;
    const res = await permanentDeleteVaultRecord(trademarkNo);
    if (res.error) toast.error(res.error);
    else toast.success('Record permanently deleted');
    setPurgeTarget(null);
    await refresh();
  };

  const hasFilters = Boolean(search.trim() || company.trim() || owner.trim() || type.trim() || dateFrom || dateTo || createdBy);

  const ownerSelectOptions = [{ value: '', label: 'Created By — all users' }, ...ownerOptions.map((o) => ({ value: o.id, label: o.email }))];

  return (
    <div>
      <PageHeader
        title="Download History"
        subtitle="Cloud Vault — archived certificate exports backed by Supabase"
        icon={<History className="h-5 w-5" />}
        actions={
          <Link href="/studio/editor/tm">
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>
              Back to Editor
            </Button>
          </Link>
        }
      />

      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-line bg-surface-raised p-1">
            {(
              [
                { value: 'active', label: 'Active' },
                { value: 'trashed', label: 'Trash' },
              ] as const
            ).map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => {
                  setView(v.value);
                  setPage(1);
                }}
                className={cn(
                  'rounded-lg px-3.5 py-1.5 text-xs font-semibold transition',
                  view === v.value ? 'bg-accent text-canvas shadow' : 'text-muted hover:text-primary',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Badge tone="gold">Total {view === 'trashed' ? 'Trashed' : 'Records'} {total}</Badge>
            <Badge tone="blue">Last Synced {records[0]?.timestamp ?? '—'}</Badge>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Search TM No. / company / owner"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Input
            placeholder="Company"
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              setPage(1);
            }}
          />
          <Input
            placeholder="Owner"
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              setPage(1);
            }}
          />
          <Input
            placeholder="Company type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          />
          <label className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-3.5 py-2.5">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-dimm">Archived from</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full bg-transparent text-sm text-primary outline-none"
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-3.5 py-2.5">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-dimm">Archived to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full bg-transparent text-sm text-primary outline-none"
            />
          </label>
          {isAdmin && ownerOptions.length > 0 && (
            <Select
              options={ownerSelectOptions}
              value={createdBy ?? ''}
              onChange={(e) => {
                setCreatedBy(e.target.value || null);
                setPage(1);
              }}
            />
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-dimm">Loading vault records…</div>
      ) : error ? (
        <EmptyState
          icon={<Trash2 className="h-8 w-8" />}
          title="Vault unavailable"
          description={error}
          className="border-danger/30"
        />
      ) : records.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={<History className="h-8 w-8" />}
            title="No matching records"
            description="No vault records match the current filters."
          />
        ) : (
          <EmptyState
            icon={<History className="h-8 w-8" />}
            title={view === 'trashed' ? 'Trash is empty' : 'No download records yet'}
            description={
              view === 'trashed'
                ? 'Records you move to the trash appear here until restored or permanently deleted.'
                : 'Export a certificate from the TM editor to secure it in the Cloud Vault.'
            }
          />
        )
      ) : (
        <>
          <Card className="overflow-hidden p-0" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-surface-raised text-left text-[10.5px] font-bold uppercase tracking-wider text-dimm">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">TM No.</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Archived</th>
                    <th className="px-4 py-3">Created By</th>
                    <th className="px-4 py-3">Live</th>
                    <th className="px-4 py-3">Operations</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => {
                    const url = liveVerifyUrl(r.trademarkNo);
                    const rowNum = (page - 1) * PAGE_SIZE + i + 1;
                    return (
                      <tr
                        key={r.trademarkNo || `${view}-${i}`}
                        className={cn('border-b border-line transition hover:bg-accent/5', i % 2 === 1 && 'bg-surface-raised/40')}
                      >
                        <td className="px-4 py-3 font-mono text-[11px] text-dimm">{rowNum}</td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-accent-bright">
                          {r.trademarkNo}
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-primary" title={r.companyName}>
                          {r.companyName}
                        </td>
                        <td className="px-4 py-3 text-muted">{r.ownerName}</td>
                        <td className="max-w-[180px] truncate px-4 py-3 italic text-dimm" title={r.compType}>
                          {r.compType}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-muted">
                          {r.timestamp}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="block max-w-[150px] truncate text-muted sm:max-w-none sm:overflow-visible sm:whitespace-normal sm:break-words"
                            title={r.creatorEmail ?? undefined}
                          >
                            {r.creatorEmail || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-violet-300 transition hover:bg-violet-500/20"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View Live
                            </a>
                          ) : (
                            <span className="font-mono text-[11px] italic text-dimm">No TM No.</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => openPreview(r)}>
                              View
                            </Button>
                            {view === 'trashed' ? (
                              <>
                                <Button size="sm" variant="success" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setRestoreTarget(r)}>
                                  Restore
                                </Button>
                                {isAdmin && (
                                  <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setPurgeTarget(r)}>
                                    Delete
                                  </Button>
                                )}
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="success" onClick={() => downloadRecord(r)}>
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setTrashTarget(r)}>
                                  Trash
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} className="mt-4" />
        </>
      )}

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={`TM No. ${preview?.trademarkNo ?? ''}`}
        meta={`${preview?.companyName} · ${preview?.ownerName} · ${preview?.timestamp}`}
        maxWidth="max-w-3xl"
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="font-mono text-[11px] text-dimm">Archived: {preview?.timestamp}</span>
            <Button variant="success" onClick={() => preview && downloadRecord(preview)}>
              <Download className="h-4 w-4" /> Download JPG
            </Button>
          </div>
        }
      >
        {previewImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewImg} alt={`TM ${preview?.trademarkNo} preview`} className="mx-auto max-h-[70vh] w-auto rounded-md shadow-deep" />
        ) : (
          <div className="py-20 text-center text-sm text-dimm">Rendering preview…</div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(trashTarget)}
        onClose={() => setTrashTarget(null)}
        onConfirm={moveToTrash}
        title="Move to Trash?"
        body={`TM No. "${trashTarget?.trademarkNo}" (${trashTarget?.companyName}) will be moved to the Trash. You can restore it from the Trash view, or permanently delete it there.`}
        confirmLabel="Move to Trash"
        danger={false}
      />

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        onClose={() => setRestoreTarget(null)}
        onConfirm={restore}
        title="Restore this record?"
        body={`TM No. "${restoreTarget?.trademarkNo}" (${restoreTarget?.companyName}) will be moved back into the active vault.`}
        confirmLabel="Restore"
        danger={false}
      />

      <ConfirmDialog
        open={Boolean(purgeTarget)}
        onClose={() => setPurgeTarget(null)}
        onConfirm={purge}
        title="Delete this record?"
        body={`TM No. "${purgeTarget?.trademarkNo}" (${purgeTarget?.companyName}) will be permanently removed from the vault. This cannot be undone.`}
        confirmLabel="Delete Permanently"
      />
    </div>
  );
}
