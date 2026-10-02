import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { ValidationError } from './errors';

export interface Sheet {
  name: string;
  headers: string[];
  /** Filas como texto (las fechas de Excel en ISO; porcentajes y monedas con su símbolo). */
  rows: string[][];
}

const MAX_ROWS = 100_000;

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = h.trim() || `Columna ${i + 1}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base} (${n + 1})`;
  });
}

/** Número con coma decimal y sin separador de miles: «1234,5» (sin ambigüedad al leerlo). */
export function decimalText(n: number): string {
  return String(n).replace('.', ',');
}

function excelText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const fmt = cell.numFmt ?? '';
    if (fmt.includes('%')) return `${decimalText(Math.round(value * 100 * 1e6) / 1e6)}%`;
    if (fmt.includes('€')) return `${decimalText(value)} €`;
    if (fmt.includes('$')) return `$${decimalText(value)}`;
    if (fmt.includes('£')) return `£${decimalText(value)}`;
    if (fmt.includes('₩')) return `₩${decimalText(value)}`;
    return decimalText(value);
  }
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  if (typeof value === 'object') {
    if ('result' in value) {
      const r = value.result;
      if (r instanceof Date) return r.toISOString().slice(0, 10);
      return r == null || typeof r === 'object' ? '' : String(r);
    }
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('hyperlink' in value) {
      const v = value as { text?: unknown; hyperlink: string };
      return typeof v.text === 'string' && !v.text.startsWith('http') ? v.text : v.hyperlink;
    }
    if ('text' in value) return String(value.text);
    return '';
  }
  return String(value);
}

/** Lee todas las hojas no vacías de un .xlsx, o el contenido de un .csv/.tsv. */
export async function readSheets(fileName: string, buffer: Buffer): Promise<Sheet[]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new ValidationError(
        'No se puede leer el libro de Excel. ¿Está dañado o protegido con contraseña?',
      );
    }
    const sheets: Sheet[] = [];
    for (const ws of wb.worksheets) {
      if (ws.actualRowCount === 0) continue;
      const headerRow = ws.getRow(1);
      const width = Math.max(headerRow.cellCount, ws.actualColumnCount);
      const headers = uniqueHeaders(
        Array.from({ length: width }, (_, i) => excelText(headerRow.getCell(i + 1))),
      );
      const rows: string[][] = [];
      ws.eachRow({ includeEmpty: false }, (row, n) => {
        if (n === 1 || rows.length >= MAX_ROWS) return;
        const values = headers.map((_, i) => excelText(row.getCell(i + 1)).trim());
        if (values.some(Boolean)) rows.push(values);
      });
      sheets.push({ name: ws.name, headers, rows });
    }
    if (sheets.length === 0) throw new ValidationError('El libro de Excel está vacío.');
    return sheets;
  }
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const result = Papa.parse<string[]>(text, {
      skipEmptyLines: 'greedy',
      delimiter: lower.endsWith('.tsv') ? '\t' : '',
    });
    const [head, ...body] = result.data;
    if (!head) throw new ValidationError('El archivo está vacío.');
    const headers = uniqueHeaders(head.map(String));
    const rows = body
      .slice(0, MAX_ROWS)
      .map((r) => headers.map((_, i) => String(r[i] ?? '').trim()));
    return [{ name: fileName.replace(/\.[^.]+$/, ''), headers, rows }];
  }
  throw new ValidationError(
    'Formato no admitido. Usa un archivo .xlsx o .csv (en Google Sheets: Archivo → Descargar).',
  );
}
