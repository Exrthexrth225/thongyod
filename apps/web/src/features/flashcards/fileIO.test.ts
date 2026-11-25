import { describe, expect, it } from 'vitest'
import { CARDS_MAX } from './logic'
import { exportDeckCsv, exportDeckXlsx, parseDeckFile, templateCsv, templateXlsx } from './fileIO'

const file = (text: string, name = 'ศัพท์.csv') => new File([text], name)
const pairs = (cards: { front: string; back: string }[]) => cards.map(({ front, back }) => [front, back])

describe('flashcard file imports', () => {
  it('reads BOM, reordered Thai headers, quoted commas, escaped quotes and multiline fields', async () => {
    const result = await parseDeckFile(file('\uFEFFหลัง,หน้า\r\n"a,b","พูด ""ดี"""\r\n"two\nlines",หน้า\r\n\r\n'))
    expect(result.title).toBe('ศัพท์')
    expect(pairs(result.cards)).toEqual([['พูด "ดี"', 'a,b'], ['หน้า', 'two\nlines']])
    expect(result.errors).toEqual([])
    expect(new Set(result.cards.map((c) => c.id)).size).toBe(2)
  })

  it('reads tabs and reordered English headers without a BOM', async () => {
    const result = await parseDeckFile(file('\nBACK\tfront\nหลัง\tหน้า\n', 'deck.csv'))
    expect(pairs(result.cards)).toEqual([['หน้า', 'หลัง']])
  })

  it('reports physical line numbers after multiline fields and retains valid rows', async () => {
    const result = await parseDeckFile(file('front,back\n"two\nlines",ok\nmissing,\n"bad"extra,no\nvalid,row\n"unterminated'))
    expect(result.errors).toEqual([4, 5, 7].map((row) => ({ row, code: 'INVALID_ROW' })))
    expect(result.skipped).toBe(3)
    expect(result.cards).toHaveLength(2)
  })

  it('truncates Unicode text and reports every excess card', async () => {
    const rows = Array.from({ length: CARDS_MAX + 2 }, () => 'หน้า,หลัง')
    rows[0] = `${'😀'.repeat(81)},${'ก'.repeat(201)}`
    const result = await parseDeckFile(file(`front,back\n${rows.join('\n')}`))
    expect(result.cards).toHaveLength(CARDS_MAX)
    expect([...result.cards[0].front]).toHaveLength(80)
    expect([...result.cards[0].back]).toHaveLength(200)
    expect(result.skipped).toBe(2)
    expect(result.errors).toEqual([{ row: 2, code: 'TRUNCATED' }, { row: 302, code: 'LIMIT' }, { row: 303, code: 'LIMIT' }])
  })

  it.each(['', 'front,front\na,b', 'front,back,extra\na,b,c'])('rejects invalid headers: %s', async (text) => {
    expect((await parseDeckFile(file(text))).errors[0].code).toBe('INVALID_HEADER')
  })

  it('returns structured errors for unsupported, unreadable and corrupt files', async () => {
    for (const input of [file('a', 'x.pdf'), file('bad zip', 'x.xlsx'), new File([new Uint8Array([255])], 'x.csv')]) {
      expect((await parseDeckFile(input)).errors).toEqual([{ row: 0, code: 'INVALID_FILE' }])
    }
  })

  it('uses only the first XLSX sheet, retaining worksheet row numbers', async () => {
    const { Workbook } = (await import('exceljs')).default
    const book = new Workbook()
    const sheet = book.addWorksheet('First')
    sheet.getRow(2).values = ['back', 'front']
    sheet.getRow(4).values = ['answer', 'question']
    sheet.getRow(6).values = ['', 'missing']
    book.addWorksheet('Ignored').addRows([['front', 'back'], ['no', 'no']])
    const result = await parseDeckFile(new File([new Uint8Array(await book.xlsx.writeBuffer())], 'deck.xlsx'))
    expect(pairs(result.cards)).toEqual([['question', 'answer']])
    expect(result.errors).toEqual([{ row: 6, code: 'INVALID_ROW' }])
  })
})

describe('flashcard exports', () => {
  const deck = { cards: [{ front: 'ไทย,"quote"', back: 'หลาย\nบรรทัด' }, { front: '=text', back: '😀' }] }
  it('round trips CSV without losing quotes, newlines or Thai', async () => {
    const blob = exportDeckCsv(deck)
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 3))).toEqual([239, 187, 191])
    expect(pairs((await parseDeckFile(new File([blob], 'deck.csv'))).cards)).toEqual(pairs(deck.cards))
  })
  it('round trips XLSX as literal text', async () => {
    const blob = await exportDeckXlsx(deck)
    expect(pairs((await parseDeckFile(new File([blob], 'deck.xlsx'))).cards)).toEqual(pairs(deck.cards))
  })
  it('provides both templates with two Thai example rows', async () => {
    for (const [blob, name] of [[templateCsv(), 'sample.csv'], [await templateXlsx(), 'sample.xlsx']] as const) {
      const result = await parseDeckFile(new File([blob], name))
      expect(result.cards).toHaveLength(2)
      expect(result.cards[0].front).toBe('สวัสดี')
      expect(result.errors).toEqual([])
    }
  })
})
