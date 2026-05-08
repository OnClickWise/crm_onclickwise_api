import { AccountSeedEntry } from './chart-of-accounts-seed.data';

/**
 * Plan General de Contabilidad (PGC) — España (Real Decreto 1514/2007).
 *
 * Grupos:
 *   1. Financiación básica
 *   2. Activo no corriente
 *   3. Existencias
 *   4. Acreedores y deudores por operaciones comerciales
 *   5. Cuentas financieras
 *   6. Compras y gastos
 *   7. Ventas e ingresos
 */
export const CHART_OF_ACCOUNTS_PGC_SPAIN: AccountSeedEntry[] = [
  {
    code: '1', name: 'Financiación Básica', accountType: 'equity', normalBalance: 'credit', allowsPosting: false,
    children: [
      { code: '100', name: 'Capital Social', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '112', name: 'Reserva Legal', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '113', name: 'Reservas Voluntarias', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '120', name: 'Resultados de Ejercicios Anteriores', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '129', name: 'Resultado del Ejercicio', accountType: 'equity', normalBalance: 'credit', allowsPosting: true },
      { code: '170', name: 'Deudas a Largo Plazo con Entidades de Crédito', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
    ],
  },
  {
    code: '2', name: 'Activo No Corriente', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '210', name: 'Terrenos y Bienes Naturales', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '211', name: 'Construcciones', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '213', name: 'Maquinaria', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '216', name: 'Mobiliario', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '217', name: 'Equipos para Procesos de Información', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '281', name: 'Amortización Acumulada del Inmovilizado Material', accountType: 'asset', normalBalance: 'credit', allowsPosting: true },
    ],
  },
  {
    code: '3', name: 'Existencias', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '300', name: 'Mercaderías', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '310', name: 'Materias Primas', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '350', name: 'Productos Terminados', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
    ],
  },
  {
    code: '4', name: 'Acreedores y Deudores por Operaciones Comerciales', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '400', name: 'Proveedores', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
      { code: '407', name: 'Anticipos a Proveedores', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '410', name: 'Acreedores por Prestaciones de Servicios', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
      { code: '430', name: 'Clientes', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '438', name: 'Anticipos de Clientes', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
      { code: '440', name: 'Deudores', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '465', name: 'Remuneraciones Pendientes de Pago', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
      {
        code: '472', name: 'IVA Soportado', accountType: 'asset', normalBalance: 'debit', allowsPosting: true,
      },
      { code: '475', name: 'Hacienda Pública Acreedora', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
      { code: '477', name: 'IVA Repercutido', accountType: 'liability', normalBalance: 'credit', allowsPosting: true },
    ],
  },
  {
    code: '5', name: 'Cuentas Financieras', accountType: 'asset', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '570', name: 'Caja', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
      { code: '572', name: 'Bancos e Instituciones de Crédito c/c Vista', accountType: 'asset', normalBalance: 'debit', allowsPosting: true },
    ],
  },
  {
    code: '6', name: 'Compras y Gastos', accountType: 'expense', normalBalance: 'debit', allowsPosting: false,
    children: [
      { code: '600', name: 'Compras de Mercaderías', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '621', name: 'Arrendamientos y Cánones', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '622', name: 'Reparaciones y Conservación', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '623', name: 'Servicios de Profesionales Independientes', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '628', name: 'Suministros', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '629', name: 'Otros Servicios', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '640', name: 'Sueldos y Salarios', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '642', name: 'Seguridad Social a Cargo de la Empresa', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
      { code: '681', name: 'Amortización del Inmovilizado Material', accountType: 'expense', normalBalance: 'debit', allowsPosting: true },
    ],
  },
  {
    code: '7', name: 'Ventas e Ingresos', accountType: 'revenue', normalBalance: 'credit', allowsPosting: false,
    children: [
      { code: '700', name: 'Ventas de Mercaderías', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
      { code: '705', name: 'Prestaciones de Servicios', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
      { code: '759', name: 'Ingresos por Servicios Diversos', accountType: 'revenue', normalBalance: 'credit', allowsPosting: true },
    ],
  },
];
