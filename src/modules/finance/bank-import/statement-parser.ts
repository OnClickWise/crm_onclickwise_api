/**
 * Parser de extratos bancários — OFX e CSV.
 *
 * Funções puras (sem dependências de DB) que convertem o conteúdo bruto de
 * um arquivo de extrato em uma lista normalizada de transações.
 */

export interface ParsedStatementLine {
  transactionDate: string; // ISO 'YYYY-MM-DD'
  amount: number; // positivo = entrada (crédito); negativo = saída (débito)
  description: string;
  reference: string | null;
  transactionType: string; // 'credit' | 'debit' | livre
}

export interface ParsedStatement {
  lines: ParsedStatementLine[];
  openingBalance: number | null;
  closingBalance: number | null;
}

/** Converte data OFX (YYYYMMDD[HHMMSS][.xxx][TZ]) para 'YYYY-MM-DD'. */
function ofxDate(raw: string): string {
  const digits = raw.trim().replace(/[^0-9]/g, '');
  if (digits.length < 8) return new Date().toISOString().slice(0, 10);
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * Interpreta um número que pode estar em formato BR (1.234,56),
 * US (1,234.56) ou simples (1234.56 / 1234,56).
 */
export function parseAmount(raw: string): number {
  let s = raw.trim().replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // O separador decimal é o que aparece por último
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Vírgula sozinha → decimal (formato BR)
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Extrai o conteúdo de uma tag OFX (SGML — tags sem fechamento). */
function ofxTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

/** Parser de arquivos OFX (Open Financial Exchange). */
export function parseOfx(content: string): ParsedStatement {
  const lines: ParsedStatementLine[] = [];

  // Cada transação está em um bloco <STMTTRN>...</STMTTRN>
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  for (const block of blocks) {
    const trnType = ofxTag(block, 'TRNTYPE') ?? '';
    const dtPosted = ofxTag(block, 'DTPOSTED') ?? '';
    const trnAmt = ofxTag(block, 'TRNAMT') ?? '0';
    const fitId = ofxTag(block, 'FITID');
    const memo = ofxTag(block, 'MEMO');
    const name = ofxTag(block, 'NAME');

    const amount = parseAmount(trnAmt);
    lines.push({
      transactionDate: ofxDate(dtPosted),
      amount,
      description: (memo || name || trnType || 'Transação').slice(0, 500),
      reference: fitId,
      transactionType: amount >= 0 ? 'credit' : 'debit',
    });
  }

  // Saldo final (LEDGERBAL → BALAMT)
  let closingBalance: number | null = null;
  const ledger = /<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/i.exec(content);
  if (ledger) closingBalance = parseAmount(ledger[1]);

  return { lines, openingBalance: null, closingBalance };
}

/** Detecta o delimitador mais provável de um CSV. */
function detectDelimiter(sample: string): string {
  const candidates = [';', ',', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    const count = (sample.match(new RegExp(`\\${d}`, 'g')) ?? []).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** Quebra uma linha CSV respeitando aspas. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Parser de CSV de extrato bancário. Detecta colunas por palavras-chave no
 * cabeçalho: data, valor/amount, descrição/histórico.
 * Suporta colunas separadas de crédito/débito.
 */
export function parseCsv(content: string): ParsedStatement {
  const rawLines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (rawLines.length < 2) return { lines: [], openingBalance: null, closingBalance: null };

  const delimiter = detectDelimiter(rawLines[0]);
  const header = splitCsvLine(rawLines[0], delimiter).map((h) => h.toLowerCase());

  const findCol = (...keywords: string[]): number =>
    header.findIndex((h) => keywords.some((k) => h.includes(k)));

  const dateCol = findCol('data', 'date', 'dt ', 'lançamento', 'lancamento');
  const descCol = findCol('descri', 'históric', 'historic', 'memo', 'history', 'detalhe');
  const amountCol = findCol('valor', 'amount', 'montante', 'movimento');
  const creditCol = findCol('crédito', 'credito', 'credit', 'entrada');
  const debitCol = findCol('débito', 'debito', 'debit', 'saída', 'saida');

  if (dateCol < 0) {
    throw new Error(
      'Não foi possível identificar a coluna de data no CSV. Verifique o cabeçalho.',
    );
  }
  if (amountCol < 0 && creditCol < 0 && debitCol < 0) {
    throw new Error('Não foi possível identificar a coluna de valor no CSV.');
  }

  const lines: ParsedStatementLine[] = [];
  for (let i = 1; i < rawLines.length; i++) {
    const cols = splitCsvLine(rawLines[i], delimiter);
    const dateRaw = cols[dateCol] ?? '';
    if (!dateRaw) continue;

    let amount = 0;
    if (amountCol >= 0 && cols[amountCol]) {
      amount = parseAmount(cols[amountCol]);
    } else {
      const credit = creditCol >= 0 ? parseAmount(cols[creditCol] ?? '0') : 0;
      const debit = debitCol >= 0 ? parseAmount(cols[debitCol] ?? '0') : 0;
      amount = Math.abs(credit) - Math.abs(debit);
    }
    if (amount === 0) continue;

    lines.push({
      transactionDate: normalizeDate(dateRaw),
      amount,
      description: (descCol >= 0 ? cols[descCol] : '') || 'Transação',
      reference: null,
      transactionType: amount >= 0 ? 'credit' : 'debit',
    });
  }

  return { lines, openingBalance: null, closingBalance: null };
}

/** Normaliza datas comuns (DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY) para ISO. */
function normalizeDate(raw: string): string {
  const s = raw.trim();
  // ISO já
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY ou DD-MM-YYYY
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(s);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 10);
}

/** Ponto de entrada — escolhe o parser pelo formato. */
export function parseStatement(
  content: string,
  format: 'ofx' | 'csv',
): ParsedStatement {
  if (format === 'ofx') return parseOfx(content);
  return parseCsv(content);
}
