/**
 * Internal row schema — fixed keys mapped from the SharePoint Excel workbook's
 * (possibly irregular) column headers. Every *Date field is either a strict
 * ISO "YYYY-MM-DD" string or null (never a fabricated/garbage date).
 */
export interface VehicleRow {
  srNo: string | null;
  invoiceDate: string | null;
  aging: string | null;
  chassis: string | null;
  engNo: string | null;
  mfYear: string | null;
  model: string | null;
  suffix: string | null;
  fuel: string | null;
  variant: string | null;
  colour: string | null;
  intColour: string | null;
  tlName: string | null;
  soName: string | null;
  customerName: string | null;
  ctdmsStatus: string | null;
  customerStatus: string | null;
  estDeliveryDate: string | null;
  ctdmsInvoice: string | null;
  dnDate: string | null;
  deliveryDate: string | null;
  stockStatus: string | null;
  reference: string | null;
  tfsPaymentDate: string | null;
  exShowroom: string | null;
  rtoName: string | null;
  remarks: string | null;
  stockLocation: string | null;
}

export interface DataFile {
  generatedAt: string;
  rows: VehicleRow[];
}

export const DATE_FIELDS = [
  'invoiceDate',
  'estDeliveryDate',
  'dnDate',
  'deliveryDate',
  'tfsPaymentDate',
] as const;

export type DateField = (typeof DATE_FIELDS)[number];
