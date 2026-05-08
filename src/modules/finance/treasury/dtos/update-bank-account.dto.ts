import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateBankAccountDto } from './create-bank-account.dto';

/**
 * UPDATE não permite alterar bank_code/account_number (chaves naturais)
 * nem initialBalance (movimentaria contabilidade — use cash-movement para isso).
 */
export class UpdateBankAccountDto extends PartialType(
  OmitType(CreateBankAccountDto, ['bankCode', 'accountNumber', 'initialBalance'] as const),
) {}
