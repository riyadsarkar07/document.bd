'use client';

import { Suspense } from 'react';
import { ServiceRecordEditor } from '@/components/editor/service-record-editor';
import { BUSINESS_MANAGER_CONFIG } from '@/lib/constants/services';

export default function BusinessManagerAccessPage() {
  return (
    <Suspense
      fallback={<div className="flex flex-1 items-center justify-center text-sm text-dimm">Loading editor…</div>}
    >
      <ServiceRecordEditor config={BUSINESS_MANAGER_CONFIG} />
    </Suspense>
  );
}
