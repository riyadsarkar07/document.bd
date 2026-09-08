'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/lib/toast/toast-provider';

interface AccessGateContextValue {
  denyAccess: () => void;
}

const AccessGateContext = createContext<AccessGateContextValue>({
  denyAccess: () => {},
});

export function useAccessGate() {
  return useContext(AccessGateContext);
}

export function AccessGateProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  const denyAccess = useCallback(() => setOpen(true), []);

  const contactAdmin = () => {
    setOpen(false);
    toast.info('Ask your administrator to grant access from Users → Access.');
  };

  return (
    <AccessGateContext.Provider value={{ denyAccess }}>
      {children}
      <Modal open={open} onClose={() => setOpen(false)} title="Admin permission required" maxWidth="max-w-md">
        <div className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface-raised text-muted">
            <Lock className="h-5 w-5" />
          </div>
          <p className="text-sm leading-relaxed text-muted">
            Your administrator has not granted access to this page yet.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button variant="primary" onClick={contactAdmin}>
              Contact Admin
            </Button>
          </div>
        </div>
      </Modal>
    </AccessGateContext.Provider>
  );
}
