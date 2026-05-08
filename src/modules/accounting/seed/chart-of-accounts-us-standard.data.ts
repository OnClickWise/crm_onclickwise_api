import { AccountSeedEntry } from './chart-of-accounts-seed.data';

/**
 * US Standard Chart of Accounts (US GAAP-compatible, simplified).
 *
 * Estrutura tradicional 1000-9999:
 *   1000s — Assets
 *   2000s — Liabilities
 *   3000s — Equity
 *   4000s — Revenue
 *   5000s — Cost of Goods Sold
 *   6000s — Operating Expenses
 *   7000s — Other Income
 *   8000s — Other Expenses
 */
export const CHART_OF_ACCOUNTS_US_STANDARD: AccountSeedEntry[] = [
  {
    code: '1000', name: 'ASSETS', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      {
        code: '1100', name: 'Current Assets', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '1110', name: 'Cash', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '1120', name: 'Petty Cash', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '1130', name: 'Checking Account', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '1140', name: 'Savings Account', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '1200', name: 'Accounts Receivable', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '1210', name: 'Allowance for Doubtful Accounts', accountType: 'asset', normalBalance: 'credit', allowsPosting: true },
          { code: '1300', name: 'Inventory', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '1400', name: 'Prepaid Expenses', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '1500', name: 'Other Current Assets', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '1700', name: 'Fixed Assets', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '1710', name: 'Land', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '1720', name: 'Buildings', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '1730', name: 'Equipment', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '1740', name: 'Vehicles', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '1790', name: 'Accumulated Depreciation', accountType: 'asset', normalBalance: 'credit', allowsPosting: true },
        ],
      },
    ],
  },
  {
    code: '2000', name: 'LIABILITIES', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
    children: [
      {
        code: '2100', name: 'Current Liabilities', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '2110', name: 'Accounts Payable', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '2120', name: 'Credit Cards Payable', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '2200', name: 'Sales Tax Payable', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '2210', name: 'Payroll Liabilities', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '2220', name: 'Federal Income Tax Withheld', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '2230', name: 'State Income Tax Withheld', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '2240', name: 'FICA / Medicare Payable', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '2300', name: 'Accrued Expenses', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
        ],
      },
      {
        code: '2700', name: 'Long-Term Liabilities', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '2710', name: 'Long-Term Loans Payable', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '2720', name: 'Mortgages Payable', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
        ],
      },
    ],
  },
  {
    code: '3000', name: 'EQUITY', accountType: 'equity', normalBalance: 'credit', allowsPosting: false,
    children: [
      { code: '3100', name: 'Owner\'s Capital / Common Stock', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '3200', name: 'Owner\'s Drawings', accountType: 'equity', normalBalance: 'debit', allowsPosting: true },
      { code: '3300', name: 'Retained Earnings', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
    ],
  },
  {
    code: '4000', name: 'REVENUE', accountType: 'revenue', normalBalance: 'credit', allowsPosting: false,
    children: [
      { code: '4100', name: 'Product Sales', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
      { code: '4200', name: 'Service Revenue', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
      { code: '4300', name: 'Sales Returns and Allowances', accountType: 'revenue', normalBalance: 'debit', allowsPosting: true },
      { code: '4400', name: 'Sales Discounts', accountType: 'revenue', normalBalance: 'debit', allowsPosting: true },
    ],
  },
  {
    code: '5000', name: 'COST OF GOODS SOLD', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '5100', name: 'Purchases', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '5200', name: 'Freight-in', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '5300', name: 'Direct Labor', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
    ],
  },
  {
    code: '6000', name: 'OPERATING EXPENSES', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '6100', name: 'Salaries and Wages', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '6110', name: 'Payroll Taxes', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '6200', name: 'Rent Expense', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '6300', name: 'Utilities', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '6400', name: 'Insurance', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '6500', name: 'Office Supplies', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '6600', name: 'Marketing and Advertising', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '6700', name: 'Professional Fees', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '6800', name: 'Depreciation Expense', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '6900', name: 'Other Operating Expenses', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
    ],
  },
  {
    code: '7000', name: 'OTHER INCOME', accountType: 'revenue', normalBalance: 'credit', allowsPosting: false,
    children: [
      { code: '7100', name: 'Interest Income', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
      { code: '7200', name: 'Gain on Sale of Assets', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
    ],
  },
  {
    code: '8000', name: 'OTHER EXPENSES', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '8100', name: 'Interest Expense', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '8200', name: 'Income Tax Expense', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
    ],
  },
];
