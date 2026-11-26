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

export interface ContractKcsStat {
  kcs: string;
  contractCount: number;
  totalContractKg: number;
  totalReceivedKg: number;
  totalRemainingKg: number;
  completionPercent: number;
  totalDeposit: number;
  totalDepositRemaining: number;
}

export interface ContractSupplierStat {
  supplier: string;
  contractCount: number;
  totalContractKg: number;
  totalReceivedKg: number;
  totalRemainingKg: number;
  completionPercent: number;
  totalDeposit: number;
  totalDepositRemaining: number;
}

export interface ContractForecastPoint {
  date: string; // DD/MM/YYYY
  expectedKg: number;
  remainingKg: number;
  contractCount: number;
}

export interface ContractDepositAlert {
  contractNo: string;
  signDate: string;
  expectedDate: string;
  supplier: string;
  kcs: string;
  variety: string;
  contractKg: number;
  remainingKg: number;
  deposit: number;
  depositDeducted: number;
  depositRemaining: number;
  status: string;
  alertReason: string;
}

export interface ContractPriceCompareItem {
  variety: string;
  contractKg: number;
  avgContractPrice: number;
  actualKg: number;
  avgActualPrice: number;
  priceDiff: number; // actual - contract
}

export interface ContractMonthlyStats {
  totalContracts: number;
  totalContractKg: number;
  totalReceivedKg: number;
  totalRemainingKg: number;
  completionPercent: number;
  totalContractAmount: number;
  totalDeposit: number;
  totalDepositDeducted: number;
  totalDepositRemaining: number;
  depositRecoveryPercent: number;
  byPriceType: { label: string; count: number; contractKg: number }[];
  byRiceForm: { label: string; count: number; contractKg: number }[];
  byStatus: { label: string; count: number; contractKg: number }[];
  depositBanks: { bank: string; count: number; totalDeposit: number }[];
  kcsRanking: ContractKcsStat[];
  supplierRanking: ContractSupplierStat[];
  forecastByDate: ContractForecastPoint[];
  depositAlerts: ContractDepositAlert[];
  crossCheck: {
    inContractKg: number;
    outsideContractKg: number;
    inContractPercent: number;
    priceComparison: ContractPriceCompareItem[];
  };
}

export interface RiceMonthlyStatsResult {
  monthKey: string;
  availableMonths: string[];
  hasFreshFile: boolean;
  hasDryFile: boolean;
  hasContractFile: boolean;
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
  contracts?: ContractMonthlyStats;
}
