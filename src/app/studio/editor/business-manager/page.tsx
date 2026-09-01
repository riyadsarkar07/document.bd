import { Briefcase } from 'lucide-react';
import { ServiceComingSoon } from '@/components/editor/service-coming-soon';

export default function BusinessManagerAccessPage() {
  return (
    <ServiceComingSoon
      title="Business Manager Access"
      description="Set up or restore Business Manager access for your pages and ad accounts."
      icon={Briefcase}
    />
  );
}
