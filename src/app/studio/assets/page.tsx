'use client';

import { Check, Copy, FileImage, Package, Download } from 'lucide-react';
import { useState } from 'react';
import { ASSET_LIST } from '@/lib/constants/nid';
import { Card, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/lib/toast/toast-provider';

export default function AssetsPage() {
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const copyPath = (path: string) => {
    navigator.clipboard?.writeText(path).then(() => {
      setCopied(path);
      setTimeout(() => setCopied(null), 1500);
    });
    toast.success('Path copied');
  };

  const images = ASSET_LIST.filter((a) => a.type === 'image');
  const fonts = ASSET_LIST.filter((a) => a.type === 'font');

  const renderRow = (a: (typeof ASSET_LIST)[number], withThumb: boolean) => (
    <div
      key={a.name}
      className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/50"
    >
      {withThumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.path} alt={a.name} className="h-14 w-14 rounded-xl border border-line object-cover" />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-line bg-surface-raised text-accent-bright">
          <Package className="h-6 w-6" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[13px] font-semibold text-primary">{a.name}</span>
          <Badge tone={a.type === 'image' ? 'blue' : 'gold'}>{a.type}</Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">{a.desc}</p>
        <p className="mt-0.5 font-mono text-[10.5px] text-dimm">{a.path}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={() => copyPath(a.path)}>
          {copied === a.path ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
        <a href={a.path} download={a.name}>
          <Button size="sm" variant="success">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </a>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Assets"
        subtitle="Bundled backgrounds, overlays and fonts used by the document renderers"
        icon={<Package className="h-5 w-5" />}
        actions={<Badge tone="muted">{ASSET_LIST.length} files</Badge>}
      />

      <div className="mb-5">
        <Card title="Images" subtitle="Canvas backgrounds & overlays" bodyClassName="flex flex-col gap-3">
          {images.map((a) => renderRow(a, true))}
        </Card>
      </div>

      <Card title="Fonts" subtitle="Registered FontFace families used by the renderers" bodyClassName="flex flex-col gap-3">
        {fonts.map((a) => renderRow(a, false))}
      </Card>

      <div className="mt-5">
        <Card title="Editor Uploads" subtitle="Images uploaded at runtime are held in memory for the session">
          <ul className="list-inside list-disc space-y-1.5 text-sm text-muted">
            <li>TM editor — custom logo / seal image (replaces the white box at logo anchors)</li>
            <li>NID editor — profile photo composited at absolute photo coordinates</li>
            <li>Signature overlay — <span className="font-mono text-accent-bright">sign remove.png</span> rendered last, always on top</li>
          </ul>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-4 py-3">
            <FileImage className="h-4 w-4 shrink-0 text-info" />
            <p className="text-xs text-muted">
              Asset paths must not change — the renderer loads them at these public URLs and canvas
              dimensions derive from the background image natural size.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
