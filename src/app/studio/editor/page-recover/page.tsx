'use client';

import { Suspense } from 'react';
import { ServiceRecordEditor } from '@/components/editor/service-record-editor';
import { PAGE_RECOVER_CONFIG } from '@/lib/constants/services';

export default function PageRecoverPage() {
  return (
    <Suspense
      fallback={<div className="flex flex-1 items-center justify-center text-sm text-dimm">Loading editor…</div>}
    >
      <ServiceRecordEditor config={PAGE_RECOVER_CONFIG} />
    </Suspense>
  );
}
