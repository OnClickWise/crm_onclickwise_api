import { AccountSeedEntry } from './chart-of-accounts-seed.data';

/**
 * Plan Comptable Général (PCG) — France.
 * Estrutura simplificada (système de base, art. 932-1 du PCG).
 *
 * Classes:
 *   1. Comptes de capitaux
 *   2. Comptes d'immobilisations
 *   3. Comptes de stocks et en-cours
 *   4. Comptes de tiers
 *   5. Comptes financiers
 *   6. Comptes de charges
 *   7. Comptes de produits
 */
export const CHART_OF_ACCOUNTS_PCG_FRANCE: AccountSeedEntry[] = [
  {
    code: '1', name: 'Comptes de Capitaux', accountType: 'equity', normalBalance: 'credit', allowsPosting: false,
    children: [
      { code: '101', name: 'Capital', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '106', name: 'Réserves', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '110', name: 'Report à Nouveau', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '120', name: 'Résultat de l\'Exercice', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '164', name: 'Emprunts auprès d\'Établissements de Crédit', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
    ],
  },
  {
    code: '2', name: 'Comptes d\'Immobilisations', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '211', name: 'Terrains', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '213', name: 'Constructions', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '215', name: 'Installations Techniques, Matériels et Outillages', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '218', name: 'Autres Immobilisations Corporelles', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '281', name: 'Amortissements des Immobilisations Corporelles', accountType: 'asset', normalBalance: 'credit', allowsPosting: true },
    ],
  },
  {
    code: '3', name: 'Comptes de Stocks et En-cours', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '31', name: 'Matières Premières', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '37', name: 'Stocks de Marchandises', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
    ],
  },
  {
    code: '4', name: 'Comptes de Tiers', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '401', name: 'Fournisseurs', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
      { code: '409', name: 'Fournisseurs Débiteurs (Avances)', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '411', name: 'Clients', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '419', name: 'Clients Créditeurs (Avances)', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
      { code: '421', name: 'Personnel — Rémunérations Dues', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
      { code: '431', name: 'Sécurité Sociale', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
      { code: '445', name: 'État — Taxes sur le Chiffre d\'Affaires', accountType: 'liability', normalBalance: 'credit', allowsPosting: false,
        children: [
          { code: '44566', name: 'TVA Déductible sur ABS', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
          { code: '44571', name: 'TVA Collectée', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
          { code: '44551', name: 'TVA à Décaisser', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
        ],
      },
      { code: '447', name: 'Autres Impôts, Taxes et Versements Assimilés', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
    ],
  },
  {
    code: '5', name: 'Comptes Financiers', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '512', name: 'Banques', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '530', name: 'Caisse', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
    ],
  },
  {
    code: '6', name: 'Comptes de Charges', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '601', name: 'Achats Stockés — Matières Premières', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '607', name: 'Achats de Marchandises', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '613', name: 'Locations', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '622', name: 'Rémunérations d\'Intermédiaires et Honoraires', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '626', name: 'Frais Postaux et Télécommunications', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '641', name: 'Rémunérations du Personnel', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '645', name: 'Charges de Sécurité Sociale et de Prévoyance', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '681', name: 'Dotations aux Amortissements', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
    ],
  },
  {
    code: '7', name: 'Comptes de Produits', accountType: 'revenue', normalBalance: 'credit', allowsPosting: false,
    children: [
      { code: '701', name: 'Ventes de Produits Finis', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
      { code: '707', name: 'Ventes de Marchandises', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
      { code: '706', name: 'Prestations de Services', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
    ],
  },
];
