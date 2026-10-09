'use client';

import type { jsPDF, jsPDFOptions } from 'jspdf';

export async function createJsPdf(options: jsPDFOptions): Promise<jsPDF> {
  const mod = await import('jspdf');
  return new mod.jsPDF(options);
}
