import { RotateCcw } from 'lucide-react';
import { ServiceComingSoon } from '@/components/editor/service-coming-soon';

export default function PageRecoverPage() {
  return (
    <ServiceComingSoon
      title="Hacked Page Recover"
      description="Restore access to a hacked or compromised Facebook page."
      icon={RotateCcw}
    />
  );
}
