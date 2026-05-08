export type AccountSeedEntry = {
  code: string;
  name: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normalBalance: 'debit' | 'credit';
  allowsPosting: boolean;
  children?: AccountSeedEntry[];
};

export const CHART_OF_ACCOUNTS_SEED: AccountSeedEntry[] = [
  // ── 1. ATIVO ────────────────────────────────────────────────────────────────
  {
    code: '1', name: 'ATIVO', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      {
        code: '1.1', name: 'ATIVO CIRCULANTE', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
        children: [
          {
            code: '1.1.1', name: 'CAIXA E EQUIVALENTES DE CAIXA', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
            children: [
              { code: '1.1.1.01', name: 'Caixa Geral', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.1.1.02', name: 'Bancos — Conta Corrente', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.1.1.03', name: 'Aplicações de Liquidez Imediata', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
            ],
          },
          {
            code: '1.1.2', name: 'CONTAS A RECEBER', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
            children: [
              { code: '1.1.2.01', name: 'Clientes — Duplicatas a Receber', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.1.2.02', name: 'Clientes — Cheques a Receber', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.1.2.03', name: '(-) Provisão para Devedores Duvidosos', accountType: 'asset', normalBalance: 'credit', allowsPosting: true },
              { code: '1.1.2.04', name: 'Adiantamentos a Clientes', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
            ],
          },
          {
            code: '1.1.3', name: 'ESTOQUES', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
            children: [
              { code: '1.1.3.01', name: 'Mercadorias para Revenda', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.1.3.02', name: 'Matérias-Primas', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.1.3.03', name: 'Produtos em Elaboração', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.1.3.04', name: 'Produtos Acabados', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
            ],
          },
          {
            code: '1.1.4', name: 'TRIBUTOS A RECUPERAR', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
            children: [
              { code: '1.1.4.01', name: 'ICMS a Recuperar', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.1.4.02', name: 'PIS a Recuperar', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.1.4.03', name: 'COFINS a Recuperar', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.1.4.04', name: 'IRPJ Antecipado', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
            ],
          },
          {
            code: '1.1.5', name: 'OUTROS ATIVOS CIRCULANTES', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
            children: [
              { code: '1.1.5.01', name: 'Adiantamentos a Empregados', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.1.5.02', name: 'Despesas Antecipadas', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.1.5.03', name: 'Outros Créditos', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
            ],
          },
        ],
      },
      {
        code: '1.2', name: 'ATIVO NÃO CIRCULANTE', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
        children: [
          {
            code: '1.2.1', name: 'REALIZÁVEL A LONGO PRAZO', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
            children: [
              { code: '1.2.1.01', name: 'Créditos com Partes Relacionadas', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.2.1.02', name: 'Depósitos Judiciais', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
            ],
          },
          {
            code: '1.2.2', name: 'INVESTIMENTOS', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
            children: [
              { code: '1.2.2.01', name: 'Participações em Coligadas e Controladas', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.2.2.02', name: 'Outros Investimentos', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
            ],
          },
          {
            code: '1.2.3', name: 'IMOBILIZADO', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
            children: [
              { code: '1.2.3.01', name: 'Terrenos', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.2.3.02', name: 'Edificações e Construções', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.2.3.03', name: 'Máquinas e Equipamentos', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.2.3.04', name: 'Móveis e Utensílios', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.2.3.05', name: 'Veículos', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.2.3.06', name: 'Equipamentos de Informática', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.2.3.07', name: '(-) Depreciação Acumulada', accountType: 'asset', normalBalance: 'credit', allowsPosting: true },
            ],
          },
          {
            code: '1.2.4', name: 'INTANGÍVEL', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
            children: [
              { code: '1.2.4.01', name: 'Marcas e Patentes', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.2.4.02', name: 'Software e Licenças', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.2.4.03', name: 'Goodwill', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
              { code: '1.2.4.04', name: '(-) Amortização Acumulada', accountType: 'asset', normalBalance: 'credit', allowsPosting: true },
            ],
          },
        ],
      },
    ],
  },

  // ── 2. PASSIVO ──────────────────────────────────────────────────────────────
  {
    code: '2', name: 'PASSIVO', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
    children: [
      {
        code: '2.1', name: 'PASSIVO CIRCULANTE', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
        children: [
          {
            code: '2.1.1', name: 'FORNECEDORES', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
            children: [
              { code: '2.1.1.01', name: 'Fornecedores Nacionais', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.1.1.02', name: 'Fornecedores do Exterior', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
            ],
          },
          {
            code: '2.1.2', name: 'OBRIGAÇÕES FISCAIS', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
            children: [
              { code: '2.1.2.01', name: 'ICMS a Recolher', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.1.2.02', name: 'ISS a Recolher', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.1.2.03', name: 'PIS a Recolher', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.1.2.04', name: 'COFINS a Recolher', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.1.2.05', name: 'IRPJ a Recolher', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.1.2.06', name: 'CSLL a Recolher', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.1.2.07', name: 'Simples Nacional a Recolher', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
            ],
          },
          {
            code: '2.1.3', name: 'OBRIGAÇÕES TRABALHISTAS E SOCIAIS', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
            children: [
              { code: '2.1.3.01', name: 'Salários a Pagar', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.1.3.02', name: 'FGTS a Recolher', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.1.3.03', name: 'INSS a Recolher', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.1.3.04', name: 'Férias a Pagar', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.1.3.05', name: '13° Salário a Pagar', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
            ],
          },
          {
            code: '2.1.4', name: 'EMPRÉSTIMOS E FINANCIAMENTOS', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
            children: [
              { code: '2.1.4.01', name: 'Empréstimos Bancários — CP', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.1.4.02', name: 'Financiamentos — CP', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
            ],
          },
          {
            code: '2.1.5', name: 'OUTRAS OBRIGAÇÕES', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
            children: [
              { code: '2.1.5.01', name: 'Adiantamentos de Clientes', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.1.5.02', name: 'Contas a Pagar Diversas', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
            ],
          },
        ],
      },
      {
        code: '2.2', name: 'PASSIVO NÃO CIRCULANTE', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
        children: [
          {
            code: '2.2.1', name: 'EMPRÉSTIMOS E FINANCIAMENTOS — LP', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
            children: [
              { code: '2.2.1.01', name: 'Empréstimos Bancários — LP', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.2.1.02', name: 'Financiamentos — LP', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.2.1.03', name: 'Debêntures', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
            ],
          },
          {
            code: '2.2.2', name: 'PROVISÕES', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
            children: [
              { code: '2.2.2.01', name: 'Provisão para Contingências', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
              { code: '2.2.2.02', name: 'Provisão para Garantias', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
            ],
          },
        ],
      },
    ],
  },

  // ── 3. PATRIMÔNIO LÍQUIDO ───────────────────────────────────────────────────
  {
    code: '3', name: 'PATRIMÔNIO LÍQUIDO', accountType: 'equity', normalBalance: 'credit', allowsPosting: false,
    children: [
      { code: '3.1', name: 'Capital Social', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '3.2', name: 'Reservas de Capital', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      {
        code: '3.3', name: 'RESERVAS DE LUCRO', accountType: 'equity', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '3.3.1', name: 'Reserva Legal', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
          { code: '3.3.2', name: 'Reserva para Contingências', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
          { code: '3.3.3', name: 'Reserva de Retenção de Lucros', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
        ],
      },
      { code: '3.4', name: 'Lucros ou Prejuízos Acumulados', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '3.5', name: 'Ajustes de Avaliação Patrimonial', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
    ],
  },

  // ── 4. RECEITAS ─────────────────────────────────────────────────────────────
  {
    code: '4', name: 'RECEITAS', accountType: 'revenue', normalBalance: 'credit', allowsPosting: false,
    children: [
      {
        code: '4.1', name: 'RECEITA BRUTA', accountType: 'revenue', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '4.1.1', name: 'Venda de Mercadorias', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
          { code: '4.1.2', name: 'Prestação de Serviços', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
          { code: '4.1.3', name: 'Venda de Produtos', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
        ],
      },
      {
        code: '4.2', name: 'DEDUÇÕES DA RECEITA BRUTA', accountType: 'revenue', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '4.2.1', name: 'Devoluções de Vendas', accountType: 'revenue', normalBalance: 'debit', allowsPosting: true },
          { code: '4.2.2', name: 'Descontos Comerciais Concedidos', accountType: 'revenue', normalBalance: 'debit', allowsPosting: true },
          { code: '4.2.3', name: 'ICMS sobre Vendas', accountType: 'revenue', normalBalance: 'debit', allowsPosting: true },
          { code: '4.2.4', name: 'ISS sobre Serviços', accountType: 'revenue', normalBalance: 'debit', allowsPosting: true },
          { code: '4.2.5', name: 'PIS sobre Faturamento', accountType: 'revenue', normalBalance: 'debit', allowsPosting: true },
          { code: '4.2.6', name: 'COFINS sobre Faturamento', accountType: 'revenue', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '4.3', name: 'RECEITAS FINANCEIRAS', accountType: 'revenue', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '4.3.1', name: 'Juros Ativos', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
          { code: '4.3.2', name: 'Descontos Obtidos', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
          { code: '4.3.3', name: 'Variações Monetárias Ativas', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
          { code: '4.3.4', name: 'Rendimentos de Aplicações Financeiras', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
        ],
      },
      {
        code: '4.4', name: 'OUTRAS RECEITAS OPERACIONAIS', accountType: 'revenue', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '4.4.1', name: 'Ganho na Venda de Ativo', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
          { code: '4.4.2', name: 'Outras Receitas Diversas', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
        ],
      },
    ],
  },

  // ── 5. DESPESAS ─────────────────────────────────────────────────────────────
  {
    code: '5', name: 'DESPESAS', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
    children: [
      {
        code: '5.1', name: 'CUSTO DAS MERCADORIAS / SERVIÇOS VENDIDOS', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '5.1.1', name: 'Custo das Mercadorias Vendidas (CMV)', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.1.2', name: 'Custo dos Serviços Prestados (CSP)', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.1.3', name: 'Custo dos Produtos Vendidos (CPV)', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '5.2', name: 'DESPESAS COM PESSOAL', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '5.2.1', name: 'Salários e Ordenados', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.2.2', name: 'Encargos Sociais (INSS, FGTS)', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.2.3', name: 'Férias e 13° Salário', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.2.4', name: 'Vale-Refeição e Vale-Transporte', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.2.5', name: 'Plano de Saúde', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.2.6', name: 'Treinamento e Capacitação', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '5.3', name: 'DESPESAS ADMINISTRATIVAS', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '5.3.1', name: 'Aluguel de Imóveis', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.3.2', name: 'Energia Elétrica e Água', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.3.3', name: 'Telefone e Internet', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.3.4', name: 'Material de Escritório e Consumo', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.3.5', name: 'Serviços de Terceiros (Contabilidade, TI, etc.)', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.3.6', name: 'Seguros', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.3.7', name: 'Manutenção e Conservação', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.3.8', name: 'Depreciação e Amortização', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '5.4', name: 'DESPESAS COMERCIAIS E DE VENDAS', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '5.4.1', name: 'Comissões sobre Vendas', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.4.2', name: 'Fretes e Carretos sobre Vendas', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.4.3', name: 'Marketing e Publicidade', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '5.5', name: 'DESPESAS FINANCEIRAS', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '5.5.1', name: 'Juros Passivos', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.5.2', name: 'Tarifas e IOF Bancários', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.5.3', name: 'Descontos Concedidos (Financeiros)', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.5.4', name: 'Variações Monetárias Passivas', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '5.6', name: 'IMPOSTOS E CONTRIBUIÇÕES', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '5.6.1', name: 'IRPJ — Imposto de Renda PJ', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.6.2', name: 'CSLL — Contribuição Social sobre Lucro', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.6.3', name: 'Simples Nacional', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.6.4', name: 'IPTU', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.6.5', name: 'IPVA', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
        ],
      },
      {
        code: '5.7', name: 'OUTRAS DESPESAS OPERACIONAIS', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
        children: [
          { code: '5.7.1', name: 'Perdas em Baixa de Ativo', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.7.2', name: 'Multas e Penalidades', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
          { code: '5.7.3', name: 'Outras Despesas Diversas', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
        ],
      },
    ],
  },
];
