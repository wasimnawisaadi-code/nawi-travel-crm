// Shared helpers for branded PDFs (logo + header).
import jsPDF from 'jspdf';
import logoUrl from '@/assets/logo.png';

let cachedLogo: string | null = null;

async function loadLogoDataUrl(): Promise<string | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    cachedLogo = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return cachedLogo;
  } catch {
    return null;
  }
}

/** Draw the Nawi Saadi branded header on a jsPDF doc. Returns y of header bottom. */
export async function drawBrandHeader(doc: jsPDF, title: string): Promise<number> {
  const logo = await loadLogoDataUrl();
  if (logo) {
    try { doc.addImage(logo, 'PNG', 18, 12, 22, 22); } catch { /* ignore */ }
  }
  doc.setFontSize(16);
  doc.setTextColor(5, 47, 89); // navy
  doc.text('NAWI SAADI TRAVEL & TOURISM', 44, 22);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('Travel & Tourism Services', 44, 28);
  doc.setDrawColor(5, 47, 89);
  doc.setLineWidth(0.4);
  doc.line(18, 38, 192, 38);
  doc.setFontSize(13);
  doc.setTextColor(5, 47, 89);
  doc.text(title.toUpperCase(), 18, 48);
  doc.setTextColor(0);
  return 52;
}

export async function drawBrandFooter(doc: jsPDF, authorizedBy?: string) {
  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220);
  doc.line(18, ph - 22, 192, ph - 22);
  doc.setFontSize(8);
  doc.setTextColor(120);
  if (authorizedBy) doc.text(`Authorized by: ${authorizedBy}`, 18, ph - 16);
  doc.text('Nawi Saadi Travel & Tourism', 18, ph - 11);
  doc.text(`Generated ${new Date().toLocaleString('en-GB')}`, 192, ph - 11, { align: 'right' });
}
