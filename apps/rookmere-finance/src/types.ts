export interface PortfolioCompanyRow {
  companyId: string;
  detailLevel: "full" | "summary";
  name: string;
  fundId: "fund_rm_iii" | "fund_rm_iv";
  fundShortCode: "RIG-III" | "RIG-IV";
  headquarters: string;
  subsector: string;
  localCurrency: "EUR" | "SEK" | "NOK" | "GBP";
  fxRateBudget: number;
  fxRateActual: number;
  erpSystem: string;
  submissionFormat: string;
  dealLead: string;
  operatingLead: string;
  financeReviewer: string;
  latestPeriod: string;
  revenueActualEur: number;
  revenueBudgetEur: number;
  ebitdaActualEur: number;
  ebitdaBudgetEur: number;
  fxTranslationImpactEur: number;
  volumeMixImpactEur: number;
  costScrapImpactEur: number;
  netDebtEur: number;
  ltmEbitdaEur: number;
  netLeverageRatio: number;
  covenantMaxLeverage: number;
  primaryVarianceDriver: string;
}

export interface RookmereEmployeeAccount {
  employeeId: string;
  name: string;
  title: string;
  department: string;
  office: string;
  permittedScope: string;
}

export interface RookmereFeedbackItem {
  id: string;
  employeeName: string;
  role: string;
  submittedAt: string;
  comment: string;
}
