import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { AccountsPayableModule } from './accounts-payable/accounts-payable.module';
import { AccountsReceivableModule } from './accounts-receivable/accounts-receivable.module';
import { TreasuryModule } from './treasury/treasury.module';
import { CustomersModule } from './customers/customers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TaxRatesModule } from './tax-rates/tax-rates.module';
import { FinanceConfigModule } from './finance-config/finance-config.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { AllocationsModule } from './allocations/allocations.module';
import { BankReconciliationModule } from './bank-reconciliation/bank-reconciliation.module';
import { CostCentersModule } from './cost-centers/cost-centers.module';
import { CashFlowModule } from './cash-flow/cash-flow.module';
import { BankImportModule } from './bank-import/bank-import.module';
import { DunningModule } from './dunning/dunning.module';

@Module({
  imports: [
    DatabaseModule,
    AccountsPayableModule,
    AccountsReceivableModule,
    TreasuryModule,
    CustomersModule,
    SuppliersModule,
    TaxRatesModule,
    FinanceConfigModule,
    ExchangeRatesModule,
    AllocationsModule,
    BankReconciliationModule,
    CostCentersModule,
    CashFlowModule,
    BankImportModule,
    DunningModule,
  ],
  exports: [
    AccountsPayableModule,
    AccountsReceivableModule,
    TreasuryModule,
    CustomersModule,
    SuppliersModule,
    TaxRatesModule,
    FinanceConfigModule,
    ExchangeRatesModule,
    AllocationsModule,
    BankReconciliationModule,
    CostCentersModule,
    CashFlowModule,
    BankImportModule,
    DunningModule,
  ],
})
export class FinanceModule {}
