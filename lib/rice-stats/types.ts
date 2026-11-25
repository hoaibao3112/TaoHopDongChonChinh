export interface RiceStatsOverview {
  monthKey: string; // 'MM/YYYY' hoặc 'ALL'
  freshLots: number;
  freshTotalKg: number;
  freshTotalAmount: number;
  freshAvgPrice: number;
  dryLots: number;
  dryTotalKg: number;
  dryTotalAmount: number;
  dryAvgPrice: number;
  combinedTotalKg: number;
  combinedTotalLots: number;
  combinedTotalAmount: number;
}

export interface RiceVarietyStat {
  variety: string;
  source: 'Tươi' | 'Khô' | 'Cả hai';
  freshKg: number;
  dryKg: number;
  totalKg: number;
  lots: number;
  totalAmount: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  sharePercent: number;
}

export interface DailyIntakePoint {
  date: string; // DD/MM/YYYY
  dayOfMonth: number;
  freshKg: number;
  dryKg: number;
  totalKg: number;
  lots: number;
}

export interface BuyerStat {
  buyer: string;
  freshLots: number;
  freshKg: number;
  dryLots: number;
  dryKg: number;
  totalKg: number;
  totalAmount: number;
  avgPrice: number;
  avgLossPercent: number;
}

export interface SupplierStat {
  supplier: string;
  source: 'Tươi' | 'Khô' | 'Cả hai';
  lots: number;
  totalKg: number;
  totalAmount: number;
  avgPrice: number;
}

export interface RegionStat {
  region: string;
  lots: number;
  freshKg: number;
  dryKg: number;
  totalKg: number;
  totalFreight: number;
  avgFreightPerKg: number;
}

export interface CostBreakdownStat {
  fresh: {
    riceAmount: number;
    inboundFreight: number;
    transshipmentFreight: number;
    laborUnionCost: number;
    dryingCostVat5: number;
    exportReturnCostVat8: number;
    totalAllCosts: number;
    totalKg: number;
    realUnitCostPerKg: number;
  };
  dry: {
    riceAmount: number;
    dryFreight: number;
    otherCosts: number;
    totalFactoryCost: number;
    totalKg: number;
    realUnitCostPerKg: number;
  };
  grandTotalCost: number;
}

export interface FacilityDryStat {
  facility: string;
  lots: number;
  inputFreshKg: number;
  scaleDryInputKg: number;
  lossKg: number;
  lossPercent: number;
  outputDryKg: number;
  avgRecoveryPercent: number;
}

export interface KcsVarietyStat {
  variety: string;
  sampleCount: number;
  avgLossPercent: number;
  avgTotalYieldKg: number;
  avgHeadRiceKg: number;
}

export interface LossAlertItem {
  source: 'Lúa Tươi' | 'Lúa Khô';
  date: string;
  lotCode: string;
  supplier: string;
  vehicle: string;
  buyer: string;
  variety: string;
  weightKg: number;
  lossKg: number;
  lossPercent: number;
  note: string;
  reason: string;
}

export interface MillingProgressStat {
  totalLots: number;
  milledLots: number;
  unmilledLots: number;
  milledPercentByWeight: number;
  freshMilledMay1Kg: number;
  freshMilledMay2Kg: number;
  freshMilledNsxKg: number;
  dryMilledKg: number;
  unmilledFreshKg: number;
  unmilledDryKg: number;
  avgStorageDays: number;
  unmilledItems: UnmilledLotItem[];
}

export interface UnmilledLotItem {
  source: 'Lúa Tươi' | 'Lúa Khô';
  date: string;
  lotCode: string;
  supplier: string;
  variety: string;
  weightKg: number;
  buyer: string;
  facility: string;
}

export interface FinancialSummaryStat {
  totalAmount: number;
  totalAdvance: number;
  totalDepositDeducted: number;
  totalPayable: number;
  paidCount: number;
  unpaidCount: number;
  unpaidAmount: number;
  refundCount: number;
  refundAmount: number;
  banks: BankStat[];
  debtAlerts: DebtAlertItem[];
}

export interface BankStat {
  bank: string;
  count: number;
  totalPaid: number;
}

export interface DebtAlertItem {
  source: 'Lúa Tươi' | 'Lúa Khô';
  date: string;
  lotCode: string;
  supplier: string;
  buyer: string;
  amount: number;
  advance: number;
  depositDeducted: number;
  payable: number;
  bank: string;
  paymentDate: string;
  alertType: 'Chưa thanh toán' | 'Số tiền âm / Hoàn tiền';
}

export interface RiceMonthlyStatsResult {
  monthKey: string;
  availableMonths: string[];
  hasFreshFile: boolean;
  hasDryFile: boolean;
  overview: RiceStatsOverview;
  varieties: RiceVarietyStat[];
  dailyTrend: DailyIntakePoint[];
  buyers: BuyerStat[];
  suppliers: SupplierStat[];
  regions: RegionStat[];
  costBreakdown: CostBreakdownStat;
  facilities: FacilityDryStat[];
  kcsByVariety: KcsVarietyStat[];
  lossAlerts: LossAlertItem[];
  totalFreshLossKg: number;
  totalFreshLossPercent: number;
  totalDryLossKg: number;
  totalDryLossPercent: number;
  milling: MillingProgressStat;
  financial: FinancialSummaryStat;
}
