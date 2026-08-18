'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, History, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { loadVault, deleteVaultRecord, liveVerifyUrl, resolveCreatorEmails, type VaultRecord } from '@/lib/workspace/vault';
import { renderTMCertificate } from '@/lib/renderers/tmRenderer';
import { loadImage, loadDataUrlImage } from '@/lib/images';
import { TM_BACKGROUND, TM_SIGNATURE } from '@/lib/constants/tm';
import { useAuth } from '@/lib/auth/auth-context';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { useToast } from '@/lib/toast/toast-provider';
import { cn } from '@/lib/utils';

export default function HistoryPage() {
  const toast = useToast();
  const { user, profile } = useAuth();
  const [records, setRecords] = useState<VaultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VaultRecord | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VaultRecord | null>(null);

  const refresh = useCallback(async () => {
    const res = await loadVault();
    if (res.error) {
      setError(res.error);
      setRecords([]);
    } else {
      const resolved = await resolveCreatorEmails(res.records, {
        currentUserId: user?.id,
        currentUserEmail: user?.email ?? profile?.email ?? null,
        role: profile?.role ?? null,
      });
      setRecords(resolved);
      setError(null);
    }
    setLoading(false);
  }, [user, profile]);

  useEffect(() => {
    void refresh();
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

  const remove = async () => {
    if (!deleteTarget?.id) return;
    const res = await deleteVaultRecord(deleteTarget.id);
    if (res.error) toast.error(res.error);
    else toast.info('Record deleted from vault');
    setDeleteTarget(null);
    await refresh();
  };

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

      <div className="mb-5 flex flex-wrap gap-3">
        <Badge tone="gold">Total Records {records.length}</Badge>
        <Badge tone="blue">Last Synced {records[0]?.timestamp ?? '—'}</Badge>
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
        <EmptyState
          icon={<History className="h-8 w-8" />}
          title="No download records yet"
          description="Export a certificate from the TM editor to secure it in the Cloud Vault."
        />
      ) : (
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
                  return (
                    <tr
                      key={r.id ?? i}
                      className={cn('border-b border-line transition hover:bg-accent/5', i % 2 === 1 && 'bg-surface-raised/40')}
                    >
                      <td className="px-4 py-3 font-mono text-[11px] text-dimm">#{i + 1}</td>
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
                          <Button size="sm" variant="success" onClick={() => downloadRecord(r)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={`TM No. ${preview?.trademarkNo ?? ''}`}
        meta={`${preview?.companyName} · ${preview?.ownerName} · ${preview?.timestamp}`}
        maxWidth="max-w-3xl"
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="font-mono text-[11px] text-dimm">
              Archived: {preview?.timestamp}
            </span>
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
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Delete this record?"
        body={`TM No. "${deleteTarget?.trademarkNo}" (${deleteTarget?.companyName}) will be permanently removed from the vault.`}
        confirmLabel="Delete Permanently"
      />
    </div>
  );
}
