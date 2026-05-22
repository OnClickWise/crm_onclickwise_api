import { Injectable } from '@nestjs/common';

/**
 * Validador algorítmico de identificadores fiscais multi-país.
 *
 *  Suportados:
 *    - cnpj    Brasil (14 dígitos, 2 DVs mod 11)
 *    - cpf     Brasil (11 dígitos, 2 DVs mod 11)
 *    - nif     Portugal (9 dígitos, 1 DV mod 11 sobre pesos 9..2)
 *    - nipc    Portugal (mesmo algoritmo do NIF, prefixo de empresa)
 *    - nif_ao  Angola (10 dígitos, primeiro determina tipo de pessoa)
 *    - nie     Espanha (X|Y|Z + 7 dígitos + letra de controle)
 *    - cif     Espanha (letra + 7 dígitos + DV)
 *    - rfc     México (estrutura básica — 12 PJ, 13 PF, sem DV oficial publicado)
 *
 *  Quando o tipo for desconhecido, retorna { valid: null } (não validado,
 *  não inválido).
 */
@Injectable()
export class TaxIdValidator {
  /**
   * Valida `value` conforme `type`. Normaliza removendo pontuação antes.
   * Retorna:
   *   { valid: true }  -> documento válido
   *   { valid: false, reason } -> formato/DV inválido
   *   { valid: null }  -> tipo não suportado para validação algorítmica
   */
  validate(
    type: string | null | undefined,
    value: string | null | undefined,
  ): { valid: boolean | null; reason?: string; normalized?: string } {
    if (!value || !value.trim()) return { valid: false, reason: 'Documento vazio' };
    if (!type) return { valid: null };

    const t = type.toLowerCase();
    const raw = value.replace(/[\s.\-/]/g, '').toUpperCase();

    switch (t) {
      case 'cnpj':
        return this.validateCNPJ(raw);
      case 'cpf':
        return this.validateCPF(raw);
      case 'nif':
      case 'nipc':
        return this.validateNIF_PT(raw);
      case 'nif_ao':
        return this.validateNIF_AO(raw);
      case 'nie':
        return this.validateNIE_ES(raw);
      case 'cif':
        return this.validateCIF_ES(raw);
      case 'rfc':
        return this.validateRFC_MX(raw);
      default:
        return { valid: null }; // ssn, tin, siret, other — sem validador local
    }
  }

  // ─── BR: CNPJ (14 dígitos, 2 DV) ───────────────────────────────────────
  private validateCNPJ(s: string): { valid: boolean; reason?: string; normalized: string } {
    if (!/^\d{14}$/.test(s)) return { valid: false, reason: 'CNPJ deve ter 14 dígitos', normalized: s };
    // Rejeita sequências triviais
    if (/^(\d)\1{13}$/.test(s)) return { valid: false, reason: 'CNPJ inválido (sequência)', normalized: s };

    const calc = (slice: string, weights: number[]): number => {
      const sum = slice.split('').reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
      const rest = sum % 11;
      return rest < 2 ? 0 : 11 - rest;
    };
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const d1 = calc(s.slice(0, 12), w1);
    const d2 = calc(s.slice(0, 12) + d1, w2);
    if (Number(s[12]) !== d1 || Number(s[13]) !== d2)
      return { valid: false, reason: 'CNPJ com dígito verificador inválido', normalized: s };
    return { valid: true, normalized: s };
  }

  // ─── BR: CPF (11 dígitos, 2 DV) ────────────────────────────────────────
  private validateCPF(s: string): { valid: boolean; reason?: string; normalized: string } {
    if (!/^\d{11}$/.test(s)) return { valid: false, reason: 'CPF deve ter 11 dígitos', normalized: s };
    if (/^(\d)\1{10}$/.test(s)) return { valid: false, reason: 'CPF inválido (sequência)', normalized: s };

    const calc = (slice: string, factor: number): number => {
      let sum = 0;
      for (let i = 0; i < slice.length; i++) sum += Number(slice[i]) * (factor - i);
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };
    const d1 = calc(s.slice(0, 9), 10);
    const d2 = calc(s.slice(0, 10), 11);
    if (Number(s[9]) !== d1 || Number(s[10]) !== d2)
      return { valid: false, reason: 'CPF com dígito verificador inválido', normalized: s };
    return { valid: true, normalized: s };
  }

  // ─── PT: NIF / NIPC (9 dígitos, mod 11 pesos 9..2) ─────────────────────
  private validateNIF_PT(s: string): { valid: boolean; reason?: string; normalized: string } {
    if (!/^\d{9}$/.test(s)) return { valid: false, reason: 'NIF deve ter 9 dígitos', normalized: s };
    // Prefixos válidos PT
    const first = s[0];
    const validPrefixes = ['1', '2', '3', '5', '6', '7', '8', '9'];
    if (!validPrefixes.includes(first))
      return { valid: false, reason: `Primeiro dígito ${first} não corresponde a NIF válido em PT`, normalized: s };

    let sum = 0;
    for (let i = 0; i < 8; i++) sum += Number(s[i]) * (9 - i);
    const rest = sum % 11;
    const dv = rest < 2 ? 0 : 11 - rest;
    if (Number(s[8]) !== dv)
      return { valid: false, reason: 'NIF com dígito verificador inválido', normalized: s };
    return { valid: true, normalized: s };
  }

  // ─── AO: NIF Angola (10 dígitos para PJ, alfanumérico para PF) ─────────
  // Estrutura prática usada pela AGT: 10 dígitos para empresas, BI nº
  // (alfanumérico) para pessoas singulares. Validação aqui é estrutural.
  private validateNIF_AO(s: string): { valid: boolean; reason?: string; normalized: string } {
    // PJ: 10 dígitos
    if (/^\d{10}$/.test(s)) return { valid: true, normalized: s };
    // PF: 9 dígitos + 2 letras + 3 dígitos (formato BI angolano)
    if (/^\d{9}[A-Z]{2}\d{3}$/.test(s)) return { valid: true, normalized: s };
    return {
      valid: false,
      reason: 'NIF AO deve ter 10 dígitos (PJ) ou formato BI 9 dígitos + 2 letras + 3 dígitos (PF)',
      normalized: s,
    };
  }

  // ─── ES: NIE (X|Y|Z + 7 dígitos + letra) ───────────────────────────────
  private validateNIE_ES(s: string): { valid: boolean; reason?: string; normalized: string } {
    if (!/^[XYZ]\d{7}[A-Z]$/.test(s))
      return { valid: false, reason: 'NIE deve ter formato X/Y/Z + 7 dígitos + letra', normalized: s };
    const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
    const prefixMap: Record<string, string> = { X: '0', Y: '1', Z: '2' };
    const numeric = prefixMap[s[0]] + s.slice(1, 8);
    const expectedLetter = letters[Number(numeric) % 23];
    if (s[8] !== expectedLetter)
      return { valid: false, reason: 'NIE com letra de controle inválida', normalized: s };
    return { valid: true, normalized: s };
  }

  // ─── ES: CIF (letra + 7 dígitos + DV) ──────────────────────────────────
  private validateCIF_ES(s: string): { valid: boolean; reason?: string; normalized: string } {
    if (!/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[\dA-J]$/.test(s))
      return { valid: false, reason: 'CIF inválido: formato esperado letra + 7 dígitos + DV', normalized: s };
    const central = s.slice(1, 8);
    let sumEven = 0;
    let sumOdd = 0;
    for (let i = 0; i < 7; i++) {
      const d = Number(central[i]);
      if (i % 2 === 0) {
        const prod = d * 2;
        sumOdd += prod > 9 ? Math.floor(prod / 10) + (prod % 10) : prod;
      } else {
        sumEven += d;
      }
    }
    const total = (sumEven + sumOdd) % 10;
    const dvNum = total === 0 ? 0 : 10 - total;
    const dvLetter = 'JABCDEFGHI'[dvNum];
    const dv = s[8];
    const orgLetter = s[0];
    // Letras específicas exigem DV em letra (P, Q, R, S, K, N, W).
    if ('PQRSKNW'.includes(orgLetter)) {
      if (dv !== dvLetter)
        return { valid: false, reason: 'CIF com DV inválido (letra)', normalized: s };
    } else if ('ABEH'.includes(orgLetter)) {
      if (dv !== String(dvNum))
        return { valid: false, reason: 'CIF com DV inválido (número)', normalized: s };
    } else {
      // Outras letras aceitam ambos
      if (dv !== String(dvNum) && dv !== dvLetter)
        return { valid: false, reason: 'CIF com DV inválido', normalized: s };
    }
    return { valid: true, normalized: s };
  }

  // ─── MX: RFC (estrutura básica) ────────────────────────────────────────
  // PJ: 3 letras + 6 dígitos data + 3 alfanum (homoclave) = 12
  // PF: 4 letras + 6 dígitos data + 3 alfanum (homoclave) = 13
  // Validação estrutural — homoclave oficial requer tabela SAT.
  private validateRFC_MX(s: string): { valid: boolean; reason?: string; normalized: string } {
    if (/^[A-Z&Ñ]{3}\d{6}[A-Z\d]{3}$/.test(s)) return { valid: true, normalized: s };
    if (/^[A-Z&Ñ]{4}\d{6}[A-Z\d]{3}$/.test(s)) return { valid: true, normalized: s };
    return {
      valid: false,
      reason: 'RFC MX deve ter 12 (PJ) ou 13 (PF) caracteres no formato correto',
      normalized: s,
    };
  }
}
