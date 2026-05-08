import { AccountSeedEntry } from './chart-of-accounts-seed.data';

/**
 * Plano Geral de Contabilidade (PGC) — Angola.
 *
 * Estrutura inspirada no PGC angolano referenciado nos manuais Primavera V10
 * (Decreto Presidencial nº 232/10). Contém apenas as classes principais e
 * sub-contas analíticas mais comuns — pode ser estendido pela organização
 * via UI / API após o seed.
 *
 * Classes:
 *   1. Meios Fixos e Investimentos
 *   2. Existências
 *   3. Terceiros
 *   4. Meios Monetários
 *   5. Capital Próprio
 *   6. Proveitos por Natureza
 *   7. Custos por Natureza
 *   8. Resultados
 *
 * Importante: este seed cria contas SINTÉTICAS (não permitem lançamento direto)
 * e ANALÍTICAS (allowsPosting=true). Os exemplos do manual Primavera (11.3.1.01
 * Gerador Industrial, 21.2 Compra de Mercadoria, 31.1 Cliente, 32.1 Fornecedor,
 * 43.1 Depósito à Ordem, 45.1 Caixa, 51 Vendas, 61.3 Venda de Mercadoria,
 * 71.x CMVC etc.) estão presentes.
 */
export const CHART_OF_ACCOUNTS_PGC_ANGOLA: AccountSeedEntry[] = [
  // ── CLASSE 1 — MEIOS FIXOS E INVESTIMENTOS ────────────────────────────────
  {
    code: '1', name: 'MEIOS FIXOS E INVESTIMENTOS',
    accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      {
        code: '11', name: 'Imobilizações Corpóreas',
        accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
        children: [
          {
            code: '11.1', name: 'Terrenos e Recursos Naturais',
            accountType: 'asset', normalBalance: 'debit', allowsPosting: true,
          },
          {
            code: '11.2', name: 'Edifícios e Outras Construções',
            accountType: 'asset', normalBalance: 'debit', allowsPosting: true,
          },
          {
            code: '11.3', name: 'Equipamento Básico',
            accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
            children: [
              {
                code: '11.3.1', name: 'Material Industrial',
                accountType: 'asset', normalBalance: 'debit', allowsPosting: true,
              },
              {
                code: '11.3.2', name: 'Equipamento de Escritório',
                accountType: 'asset', normalBalance: 'debit', allowsPosting: true,
              },
            ],
          },
          {
            code: '11.4', name: 'Equipamento de Transporte',
            accountType: 'asset', normalBalance: 'debit', allowsPosting: true,
          },
          {
            code: '11.5', name: 'Ferramentas e Utensílios',
            accountType: 'asset', normalBalance: 'debit', allowsPosting: true,
          },
        ],
      },
      {
        code: '18', name: 'Amortizações Acumuladas',
        accountType: 'asset', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '18.1', name: 'Amortizações de Imobilizações Corpóreas', accountType: 'asset', normalBalance: 'credit', allowsPosting: true },
        ],
      },
    ],
  },

  // ── CLASSE 2 — EXISTÊNCIAS ────────────────────────────────────────────────
  {
    code: '2', name: 'EXISTÊNCIAS',
    accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      {
        code: '21', name: 'Compras',
        accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '21.1', name: 'Compras de Matérias-Primas', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '21.2', name: 'Compras de Mercadorias', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '21.3', name: 'Compras de Subsidiárias', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '26', name: 'Mercadorias',
        accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '26.1', name: 'Mercadorias em Armazém', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
        ],
      },
    ],
  },

  // ── CLASSE 3 — TERCEIROS ──────────────────────────────────────────────────
  {
    code: '3', name: 'TERCEIROS',
    accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      {
        code: '31', name: 'Clientes',
        accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '31.1', name: 'Clientes — Conta Corrente', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '31.2', name: 'Clientes — Títulos a Receber', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '31.8', name: 'Adiantamentos de Clientes', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
        ],
      },
      {
        code: '32', name: 'Fornecedores',
        accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '32.1', name: 'Fornecedores — Conta Corrente', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '32.2', name: 'Fornecedores — Títulos a Pagar', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '32.8', name: 'Adiantamentos a Fornecedores', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '34', name: 'Estado',
        accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '34.1', name: 'Imposto sobre o Rendimento', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '34.2', name: 'Retenções na Fonte', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '34.3', name: 'Imposto sobre o Valor Acrescentado (IVA)', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
        ],
      },
      {
        code: '36', name: 'Pessoal',
        accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '36.1', name: 'Remunerações a Pagar', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
        ],
      },
    ],
  },

  // ── CLASSE 4 — MEIOS MONETÁRIOS ───────────────────────────────────────────
  {
    code: '4', name: 'MEIOS MONETÁRIOS',
    accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      {
        code: '43', name: 'Depósitos à Ordem',
        accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '43.1', name: 'Depósito à Ordem — Banco Principal', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '43.2', name: 'Depósito à Ordem — Banco Secundário', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '45', name: 'Caixa',
        accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '45.1', name: 'Caixa Geral', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
        ],
      },
    ],
  },

  // ── CLASSE 5 — CAPITAL PRÓPRIO ────────────────────────────────────────────
  {
    code: '5', name: 'CAPITAL PRÓPRIO',
    accountType: 'equity', normalBalance: 'credit', allowsPosting: false,
    children: [
      { code: '51', name: 'Capital Social', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '55', name: 'Reservas', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '59', name: 'Resultados Transitados', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
    ],
  },

  // ── CLASSE 6 — PROVEITOS POR NATUREZA ─────────────────────────────────────
  {
    code: '6', name: 'PROVEITOS POR NATUREZA',
    accountType: 'revenue', normalBalance: 'credit', allowsPosting: false,
    children: [
      {
        code: '61', name: 'Vendas',
        accountType: 'revenue', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '61.1', name: 'Vendas de Produtos', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
          { code: '61.3', name: 'Vendas de Mercadorias', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
        ],
      },
      {
        code: '62', name: 'Prestação de Serviços',
        accountType: 'revenue', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '62.1', name: 'Serviços Prestados', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
        ],
      },
    ],
  },

  // ── CLASSE 7 — CUSTOS POR NATUREZA ────────────────────────────────────────
  {
    code: '7', name: 'CUSTOS POR NATUREZA',
    accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
    children: [
      {
        code: '71', name: 'Custo das Mercadorias Vendidas e Matérias Consumidas (CMVMC)',
        accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '71.3', name: 'CMVMC — Mercadorias', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '71.6', name: 'CMVMC — Variações de Existências', accountType: 'expense', normalBalance: 'credit', allowsPosting: true },
        ],
      },
      {
        code: '72', name: 'Custos com o Pessoal',
        accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '72.2', name: 'Remunerações do Pessoal', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '72.5', name: 'Encargos sobre Remunerações', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '73', name: 'Amortizações do Exercício',
        accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '73.1', name: 'Amortização de Imobilizações Corpóreas', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '75', name: 'Outros Custos Operacionais',
        accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '75.2', name: 'Fornecimentos e Serviços de Terceiros', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
            children: [
              { code: '75.2.11', name: 'EPAL — Água', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
              { code: '75.2.12', name: 'ENDE — Energia Elétrica', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
              { code: '75.2.13', name: 'Telefones e Comunicações', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
            ],
          },
        ],
      },
    ],
  },

  // ── CLASSE 8 — RESULTADOS ─────────────────────────────────────────────────
  {
    code: '8', name: 'RESULTADOS',
    accountType: 'equity', normalBalance: 'credit', allowsPosting: false,
    children: [
      {
        code: '82', name: 'Resultados Operacionais',
        accountType: 'equity', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '82.1', name: 'Vendas — Apuramento', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
          { code: '82.2', name: 'Prestação de Serviços — Apuramento', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
          { code: '82.6', name: 'CMVMC — Apuramento', accountType: 'equity', normalBalance: 'debit', allowsPosting: true },
          { code: '82.7', name: 'Custos com Pessoal — Apuramento', accountType: 'equity', normalBalance: 'debit', allowsPosting: true },
          { code: '82.8', name: 'Amortizações — Apuramento', accountType: 'equity', normalBalance: 'debit', allowsPosting: true },
          { code: '82.9', name: 'Outros Custos Operacionais — Apuramento', accountType: 'equity', normalBalance: 'debit', allowsPosting: true },
          { code: '82.19', name: 'Resultado Operacional', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
        ],
      },
      {
        code: '88', name: 'Resultado Líquido do Exercício',
        accountType: 'equity', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '88.1', name: 'Resultado Líquido', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
          { code: '88.5', name: 'Imposto sobre o Rendimento — Apuramento', accountType: 'equity', normalBalance: 'debit', allowsPosting: true },
        ],
      },
    ],
  },
];
