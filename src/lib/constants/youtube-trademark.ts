import { TM_DEFAULTS } from './tm';
import type { TMSnapshot } from '../editor/types';

/**
 * YouTube Trademark reuses the TM certificate canvas, layout, and renderer.
 * Only the document defaults differ so channel records stay distinct from
 * TM Certificate vault rows (especially trademarkNo).
 */
export const YT_DEFAULTS: TMSnapshot = {
  ...TM_DEFAULTS,
  trademarkNo: '',
  companyName: '',
  ownerName: '',
  address: '',
  compType: 'YouTube Channel / Digital Media',
  goodsDesc:
    'in respect of online video publishing; YouTube channel operation; digital content creation; media broadcasting; news reporting; photography; video production; social media services and all other media services included in class-41.',
  logoText: '',
  docKind: 'youtube-trademark',
};
