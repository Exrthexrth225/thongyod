import { randomId } from '@/lib/id'
import { BACK_MAX, CARDS_MAX, FRONT_MAX, TITLE_MAX, makeCard, type Card } from './logic'

export type DeckFileError = { row: number; code: 'INVALID_FILE' | 'INVALID_HEADER' | 'INVALID_ROW' | 'TRUNCATED' | 'LIMIT' }
export type DeckFileResult = { title: string; cards: Card[]; skipped: number; errors: DeckFileError[] }
type Row = { row: number; fields: string[]; invalid?: boolean }
type ExportDeck = { cards: readonly Pick<Card, 'front' | 'back'>[] }

// Physical line numbers are retained even when a quoted field spans lines.
function csvRows(text: string, delimiter: string): Row[] {
  const rows: Row[] = []
  let fields: string[] = [], field = '', quoted = false, closed = false, invalid = false
  let line = 1, start = 1
  const finish = () => {
    rows.push({ row: start, fields: [...fields, field], invalid })
    fields = []; field = ''; closed = false; invalid = false
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else { quoted = false; closed = true }
      } else {
        field += ch
        if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line++
      }
    } else if (ch === delimiter) {
      fields.push(field); field = ''; closed = false
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      finish(); line++; start = line
    } else if (ch === '"' && field === '' && !closed) quoted = true
    else {
      if (closed || ch === '"') invalid = true
      field += ch
    }
  }
  if (quoted) invalid = true
  if (field || fields.length || invalid || closed) finish()
  return rows
}

/** Read CSV/TSV or the first XLSX worksheet; never writes device storage. Row 0 means a file-level error. */
export async function parseDeckFile(file: File): Promise<DeckFileResult> {
  const result: DeckFileResult = {
    title: [...file.name.replace(/\.[^.]+$/, '').trim()].slice(0, TITLE_MAX).join(''),
    cards: [], skipped: 0, errors: [],
  }
  let rows: Row[]
  try {
    if (/\.xlsx$/i.test(file.name)) {
      const { Workbook } = (await import('exceljs')).default
      const workbook = new Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      const sheet = workbook.worksheets[0]
      rows = []
      sheet?.eachRow((row, number) => {
        rows.push({ row: number, fields: Array.from({ length: row.cellCount }, (_, i) => row.getCell(i + 1).text) })
      })
    } else if (/\.(csv|tsv)$/i.test(file.name)) {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()).replace(/^\uFEFF/, '')
      const comma = csvRows(text, ',')
      const tab = csvRows(text, '\t')
      const header = (candidate: Row[]) => candidate.find((r) => r.fields.some((f) => f.trim()))?.fields.length ?? 0
      rows = header(tab) > header(comma) ? tab : comma
    } else throw new Error('Unsupported file')
  } catch {
    result.errors.push({ row: 0, code: 'INVALID_FILE' })
    return result
  }
  const nonempty = rows.filter((r) => r.invalid || r.fields.some((f) => f.trim()))
  const header = nonempty.shift()
  const names = header?.fields.map((f) => f.trim().toLowerCase()) ?? []
  const front = names.findIndex((f) => f === 'front' || f === 'หน้า')
  const back = names.findIndex((f) => f === 'back' || f === 'หลัง')
  if (!header || header.invalid || names.length !== 2 || front < 0 || back < 0) {
    result.skipped = nonempty.length
    result.errors.push({ row: header?.row ?? 0, code: 'INVALID_HEADER' })
    return result
  }
  for (const row of nonempty) {
    const f = row.fields[front]?.trim() ?? '', b = row.fields[back]?.trim() ?? ''
    const code = row.invalid || row.fields.length !== 2 || !f || !b ? 'INVALID_ROW'
      : result.cards.length >= CARDS_MAX ? 'LIMIT' : null
    if (code) {
      result.skipped++; result.errors.push({ row: row.row, code }); continue
    }
    if ([...f].length > FRONT_MAX || [...b].length > BACK_MAX) result.errors.push({ row: row.row, code: 'TRUNCATED' })
    result.cards.push(makeCard(randomId(), f, b)!)
  }
  return result
}

/** UTF-8 BOM helps spreadsheet apps recognize Thai text. All fields are quoted. */
export function exportDeckCsv(deck: ExportDeck): Blob {
  const quote = (text: string) => `"${text.replace(/"/g, '""')}"`
  return new Blob(['\uFEFF', [['หน้า', 'หลัง'], ...deck.cards.map((c) => [c.front, c.back])]
    .map((row) => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
}

export async function exportDeckXlsx(deck: ExportDeck): Promise<Blob> {
  const { Workbook } = (await import('exceljs')).default
  const workbook = new Workbook()
  const sheet = workbook.addWorksheet('Flashcards')
  sheet.addRows([['หน้า', 'หลัง'], ...deck.cards.map((c) => [c.front, c.back])])
  return new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

const example: ExportDeck = { cards: [{ front: 'สวัสดี', back: 'คำทักทาย' }, { front: 'ขอบคุณ', back: 'คำแสดงความขอบคุณ' }] }
export const templateCsv = (): Blob => exportDeckCsv(example)
export const templateXlsx = (): Promise<Blob> => exportDeckXlsx(example)
