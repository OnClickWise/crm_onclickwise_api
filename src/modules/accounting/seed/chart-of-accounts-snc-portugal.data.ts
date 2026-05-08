import { AccountSeedEntry } from './chart-of-accounts-seed.data';

/**
 * Sistema de Normalização Contabilística (SNC) — Portugal.
 * Estrutura simplificada (Decreto-Lei 158/2009 e atualizações).
 *
 * Classes:
 *   1. Meios financeiros líquidos
 *   2. Contas a receber e a pagar
 *   3. Inventários e ativos biológicos
 *   4. Investimentos
 *   5. Capital, reservas e resultados transitados
 *   6. Gastos
 *   7. Rendimentos
 *   8. Resultados
 */
export const CHART_OF_ACCOUNTS_SNC_PORTUGAL: AccountSeedEntry[] = [
  {
    code: '1', name: 'Meios Financeiros Líquidos', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '11', name: 'Caixa', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      {
        code: '12', name: 'Depósitos à Ordem', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '12.1', name: 'Banco Principal', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      { code: '13', name: 'Outros Depósitos Bancários', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '14', name: 'Outros Instrumentos Financeiros', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
    ],
  },
  {
    code: '2', name: 'Contas a Receber e a Pagar', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      {
        code: '21', name: 'Clientes', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '21.1', name: 'Clientes c/c', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '21.8', name: 'Adiantamentos de Clientes', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
        ],
      },
      {
        code: '22', name: 'Fornecedores', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '22.1', name: 'Fornecedores c/c', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '22.8', name: 'Adiantamentos a Fornecedores', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '24', name: 'Estado e Outros Entes Públicos', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '24.1', name: 'Imposto sobre Rendimento', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          {
            code: '24.3', name: 'IVA', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
            children: [
              { code: '24.3.1', name: 'IVA Suportado', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '24.3.3', name: 'IVA Liquidado', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '24.3.6', name: 'IVA a Pagar', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
            ],
          },
          { code: '24.5', name: 'Contribuições para a Segurança Social', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
        ],
      },
      {
        code: '26', name: 'Outras Contas a Receber/Pagar', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '26.1', name: 'Pessoal — Adiantamentos', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
        ],
      },
    ],
  },
  {
    code: '3', name: 'Inventários e Ativos Biológicos', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '31', name: 'Compras', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '32', name: 'Mercadorias', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '33', name: 'Matérias-Primas', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '36', name: 'Produtos Acabados', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
    ],
  },
  {
    code: '4', name: 'Investimentos', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '43', name: 'Ativos Fixos Tangíveis', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '44', name: 'Ativos Intangíveis', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '48', name: 'Depreciações Acumuladas', accountType: 'asset', normalBalance: 'credit', allowsPosting: true },
    ],
  },
  {
    code: '5', name: 'Capital, Reservas e Resultados', accountType: 'equity', normalBalance: 'credit', allowsPosting: false,
    children: [
      { code: '51', name: 'Capital', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '55', name: 'Reservas', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '56', name: 'Resultados Transitados', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
    ],
  },
  {
    code: '6', name: 'Gastos', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '61', name: 'Custo das Mercadorias Vendidas e MP Consumidas', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      {
        code: '62', name: 'Fornecimentos e Serviços Externos', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '62.1', name: 'Subcontratos', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '62.2', name: 'Serviços Especializados', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '62.4', name: 'Energia e Fluidos', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '62.6', name: 'Comunicações', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '63', name: 'Gastos com o Pessoal', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '63.2', name: 'Remunerações ao Pessoal', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '63.5', name: 'Encargos sobre Remunerações', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      { code: '64', name: 'Gastos de Depreciação e Amortização', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '68', name: 'Outros Gastos', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
    ],
  },
  {
    code: '7', name: 'Rendimentos', accountType: 'revenue', normalBalance: 'credit', allowsPosting: false,
    children: [
      { code: '71', name: 'Vendas', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
      { code: '72', name: 'Prestações de Serviços', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
      { code: '78', name: 'Outros Rendimentos', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
    ],
  },
  {
    code: '8', name: 'Resultados', accountType: 'equity', normalBalance: 'credit', allowsPosting: false,
    children: [
      { code: '81', name: 'Resultado Líquido do Período', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
    ],
  },
];
