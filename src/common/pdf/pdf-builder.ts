import PDFDocument from 'pdfkit';

export type PdfTableRow = Array<string | number>;

export function createBrandedPdf(options?: {
  title?: string;
  subtitle?: string;
}): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: {
      Title: options?.title ?? 'Bagi Rata',
      Author: 'Bagi Rata',
      Creator: 'Bagi Rata',
    },
  });

  // Brand header bar
  doc.rect(0, 0, doc.page.width, 56).fill('#0f766e');
  doc
    .fillColor('#ecfdf5')
    .fontSize(18)
    .font('Helvetica-Bold')
    .text('Bagi Rata', 48, 18, { continued: false });
  doc
    .fillColor('#a7f3d0')
    .fontSize(9)
    .font('Helvetica')
    .text('Patungan transparan · bagirata.app', 48, 38);

  doc.moveDown(2);
  doc.fillColor('#18181b');

  if (options?.title) {
    doc.fontSize(16).font('Helvetica-Bold').text(options.title, 48, 72);
  }
  if (options?.subtitle) {
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#52525b')
      .text(options.subtitle, 48, options?.title ? 94 : 72);
  }

  doc.fillColor('#18181b').font('Helvetica').fontSize(10);
  doc.y = Math.max(doc.y, 120);
  return doc;
}

export function formatIdrPdf(amountMinor: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amountMinor);
}

export function addFooter(doc: PDFKit.PDFDocument, pageNote?: string) {
  const bottom = doc.page.height - 36;
  doc
    .fontSize(8)
    .fillColor('#71717a')
    .text(
      pageNote ??
        'Dibuat oleh Bagi Rata · Dokumen ini bukan faktur pajak kecuali dinyatakan lain.',
      48,
      bottom,
      { width: doc.page.width - 96, align: 'center' },
    );
}

export function addKeyValue(
  doc: PDFKit.PDFDocument,
  rows: Array<[string, string]>,
) {
  for (const [k, v] of rows) {
    doc
      .font('Helvetica')
      .fillColor('#71717a')
      .text(`${k}`, { continued: true })
      .fillColor('#18181b')
      .font('Helvetica-Bold')
      .text(`  ${v}`);
  }
  doc.moveDown(0.5);
}

export async function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
