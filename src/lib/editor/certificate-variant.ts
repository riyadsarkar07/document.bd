import { TM_DEFAULTS } from '@/lib/constants/tm';
import { YT_DEFAULTS } from '@/lib/constants/youtube-trademark';
import type { TMSnapshot } from '@/lib/editor/types';
import type { CertificateDocKind } from '@/lib/workspace/vault';

export interface CertificateVariantConfig {
  kind: CertificateDocKind;
  defaults: TMSnapshot;
  autosavePrefix: string;
  kindLabel: string;
  inspectorTitle: string;
  inspectorSubtitle: string;
  filePrefix: string;
  projectName: (tmNo: string) => string;
  resetMessage: string;
  activityPrefix: string;
}

export const CERTIFICATE_VARIANTS: Record<CertificateDocKind, CertificateVariantConfig> = {
  tm: {
    kind: 'tm',
    defaults: TM_DEFAULTS,
    autosavePrefix: 'studio.autosave.tm',
    kindLabel: 'TM Certificate',
    inspectorTitle: 'TM Certificate Inspector',
    inspectorSubtitle: 'Version 1 · absolute calibration',
    filePrefix: 'Certificate-TM',
    projectName: (tmNo) => `TM ${tmNo || 'Certificate'}`,
    resetMessage: 'TM editor reset to calibrated defaults',
    activityPrefix: 'tm',
  },
  'youtube-trademark': {
    kind: 'youtube-trademark',
    defaults: YT_DEFAULTS,
    autosavePrefix: 'studio.autosave.youtube-trademark',
    kindLabel: 'YouTube Trademark',
    inspectorTitle: 'YouTube Trademark Inspector',
    inspectorSubtitle: 'YouTube channel certificate · TM layout',
    filePrefix: 'Certificate-YT',
    projectName: (tmNo) => `YouTube TM ${tmNo || 'Certificate'}`,
    resetMessage: 'YouTube Trademark editor reset to defaults',
    activityPrefix: 'youtube',
  },
};
