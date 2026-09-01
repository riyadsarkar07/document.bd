import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Clock } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export function ServiceComingSoon({
  title,
  eyebrow = 'Coming soon',
  description,
  icon,
}: {
  title: string;
  eyebrow?: string;
  description: string;
  icon: LucideIcon;
}) {
  const Icon = icon;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={description}
        icon={<Icon className="h-6 w-6" />}
      />
      <Card>
        <EmptyState
          icon={<Clock className="h-7 w-7" />}
          title="We are updating now."
          description="This service is not available yet and is still being prepared. It will be enabled for you soon, so no action is needed on your side. Please check back later."
          action={
            <Link
              href="/studio"
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-line bg-surface-raised px-4 text-sm font-medium text-primary transition-all duration-150 hover:border-line-strong hover:bg-surface-hover"
            >
              Back to Dashboard
            </Link>
          }
        />
      </Card>
    </div>
  );
}
