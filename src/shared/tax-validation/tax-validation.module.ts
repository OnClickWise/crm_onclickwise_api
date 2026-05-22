import { Module, Global } from '@nestjs/common';
import { TaxIdValidator } from './tax-id.validator';

/**
 * Módulo global — qualquer outro módulo (Sales, Compras, RH…) pode injetar
 * o TaxIdValidator sem precisar importar.
 */
@Global()
@Module({
  providers: [TaxIdValidator],
  exports: [TaxIdValidator],
})
export class TaxValidationModule {}
