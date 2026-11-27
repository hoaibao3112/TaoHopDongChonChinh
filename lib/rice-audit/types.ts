export type RiceFileSource = 'fresh' | 'dry';

export type AuditCategory = 'lot_code' | 'customer' | 'price' | 'formula_payment';

export type AuditSeverity = 'error' | 'warning' | 'info';

export interface RiceAuditIssue {
  id: string;
  source: RiceFileSource;
  sourceLabel: 'Lúa Tươi' | 'Lúa Khô';
  sheetName: string;
  rowNumber: number;
  category: AuditCategory;
  severity: AuditSeverity;
  code: string;
  title: string;
  detail: string;
  suggestion: string;
  // Thông tin ngữ cảnh dòng
  dateStr: string;
  buyer: string;
  customer: string;
  riceType: string;
  lotCode: string;
  quantityKg: number | null;
  price: number | null;
  expectedPrice?: number | null;
  totalAmount?: number | null;
  paymentAmount?: number | null;
}

export interface CustomerPrefixMapping {
  customerNormalized: string;
  variants: string[];
  prefixes: { prefix: string; count: number }[];
  dominantPrefix: string;
  rowCount: number;
}

export interface RiceAuditSummary {
  totalFreshRows: number;
  totalDryRows: number;
  totalIssues: number;
  bySeverity: Record<AuditSeverity, number>;
  byCategory: Record<AuditCategory, number>;
  bySource: Record<RiceFileSource, number>;
  priceDeviationPct: number;
  analyzedAt: string;
}

export interface RiceAuditResult {
  summary: RiceAuditSummary;
  issues: RiceAuditIssue[];
  customerMappings: CustomerPrefixMapping[];
}
