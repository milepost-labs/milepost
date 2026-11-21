import { describe, expect, it, vi } from 'vitest';
import { escapeCsvField, csvRow, awardsToCsv, downloadFile, numericCell } from './csv';
import { FIXTURE_AWARDS } from '../fixtures/programmeFixtures';

describe('escapeCsvField', () => {
  it('returns plain values unchanged', () => {
    expect(escapeCsvField('hello')).toBe('hello');
    expect(escapeCsvField('Programme 2026')).toBe('Programme 2026');
  });

  it('wraps fields with commas in quotes', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
  });

  it('doubles existing quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps fields with newlines', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  describe('formula neutralization (OWASP defense)', () => {
    it('neutralizes = as first character', () => {
      expect(escapeCsvField('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    });

    it('neutralizes + as first character', () => {
      expect(escapeCsvField('+12345')).toBe("'+12345");
    });

    it('neutralizes - as first character for text cells', () => {
      expect(escapeCsvField('-cmd|/C calc')).toBe("'-cmd|/C calc");
    });

    it('neutralizes @ as first character', () => {
      expect(escapeCsvField('@SUM(1+1)')).toBe("'@SUM(1+1)");
    });

    it('neutralizes tab (\\t) as first character', () => {
      expect(escapeCsvField('\tcalc')).toBe("'\tcalc");
    });

    it('neutralizes carriage return (\\r) as first character and quotes it', () => {
      // \r is neutralized to '\r... which then triggers RFC 4180 quoting because it contains \r
      expect(escapeCsvField('\rcalc')).toBe("\"'\rcalc\"");
    });

    it('neutralizes and quotes a cell that needs both', () => {
      // Starts with = and contains a comma -> quotes around the neutralized string
      expect(escapeCsvField('=SUM(A1,B1)')).toBe("\"'=SUM(A1,B1)\"");
      // Starts with @ and contains quotes -> quotes doubled and wrapped
      expect(escapeCsvField('@lookup("x")')).toBe("\"'@lookup(\"\"x\"\")\"");
      // Starts with + and contains newline
      expect(escapeCsvField('+cmd\narg')).toBe("\"'+cmd\narg\"");
    });
  });

  describe('numeric vs text handling', () => {
    it('leaves amounts (including negative numbers) unchanged when marked numeric', () => {
      expect(escapeCsvField(numericCell('-5'))).toBe('-5');
      expect(escapeCsvField(numericCell('-100.50'))).toBe('-100.50');
      expect(escapeCsvField(numericCell(42))).toBe('42');
      expect(escapeCsvField(numericCell(-42))).toBe('-42');
      expect(escapeCsvField('-5', { numeric: true })).toBe('-5');
      expect(escapeCsvField({ value: '-5', numeric: true })).toBe('-5');
      expect(escapeCsvField({ value: '-10.5', raw: true })).toBe('-10.5');
    });

    it('distinguishes numeric-marked versus text-typed "-5"', () => {
      // Text cell defaults to safe: neutralized with single quote
      expect(escapeCsvField('-5')).toBe("'-5'");
      // Explicit numeric cell remains untouched
      expect(escapeCsvField(numericCell('-5'))).toBe('-5');
    });
  });

  describe('empty, null, and undefined handling', () => {
    it('handles empty string', () => {
      expect(escapeCsvField('')).toBe('');
    });

    it('handles null and undefined', () => {
      expect(escapeCsvField(null)).toBe('');
      expect(escapeCsvField(undefined)).toBe('');
      expect(escapeCsvField({ value: null })).toBe('');
      expect(escapeCsvField({ value: undefined, numeric: true })).toBe('');
    });
  });
});

describe('csvRow', () => {
  it('joins fields with commas', () => {
    expect(csvRow(['a', 'b', 'c'])).toBe('a,b,c');
  });

  it('escapes individual fields', () => {
    expect(csvRow(['plain', 'has,comma'])).toBe('plain,"has,comma"');
  });

  it('neutralizes formula cells in a row while leaving numeric cells untouched', () => {
    const row = csvRow(['=malicious', numericCell('-50.00'), 'normal']);
    expect(row).toBe("'=malicious,-50.00,normal");
  });
});

describe('awardsToCsv', () => {
  it('includes a header row and advisory notice', () => {
    const csv = awardsToCsv(FIXTURE_AWARDS, '2026-09-15T12:00:00Z');
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Recipient');
    expect(lines[1]).toContain('advisory public index');
    expect(lines[1]).toContain('2026-09-15T12:00:00Z');
  });

  it('exports both stroops and formatted units as numeric', () => {
    const csv = awardsToCsv(FIXTURE_AWARDS, '2026-09-15T12:00:00Z');
    const lines = csv.split('\n');
    const firstAward = lines[2];
    expect(firstAward).toContain('140000000000');
    expect(firstAward).toContain('14000');
  });

  it('handles awards with zero released', () => {
    const csv = awardsToCsv(FIXTURE_AWARDS, '2026-09-15T12:00:00Z');
    const lines = csv.split('\n');
    const zeroAward = lines[4];
    expect(zeroAward).toContain('0');
  });

  it('escapes commas in recipient addresses', () => {
    const awards = [
      {
        ...FIXTURE_AWARDS[0],
        recipient: 'GTEST,COMMA',
      },
    ];
    const csv = awardsToCsv(awards, '2026-09-15T12:00:00Z');
    const lines = csv.split('\n');
    expect(lines[2]).toContain('"GTEST,COMMA"');
  });

  it('neutralizes malicious formula characters in recipient and payee fields', () => {
    const maliciousAwards = [
      {
        ...FIXTURE_AWARDS[0],
        recipient: '=1+1',
        payee: '@EVIL_PAYEE',
      },
      {
        ...FIXTURE_AWARDS[0],
        recipient: '+CMD_INJECT',
        payee: '-MINUS_PAYEE',
      },
    ];
    const csv = awardsToCsv(maliciousAwards, '2026-09-15T12:00:00Z');
    const lines = csv.split('\n');
    expect(lines[2]).not.toContain(',=1+1,');
    expect(lines[2]).toContain("'=1+1");
    expect(lines[2]).toContain("'@EVIL_PAYEE");
    expect(lines[3]).toContain("'+CMD_INJECT");
    expect(lines[3]).toContain("'-MINUS_PAYEE");
  });
});

describe('downloadFile', () => {
  it('creates an object URL, clicks a temporary anchor with filename and mime type, and revokes the URL', async () => {
    const mockUrl = 'blob:http://localhost/mock-blob-uuid';
    const createObjectURLSpy = vi.fn().mockReturnValue(mockUrl);
    const revokeObjectURLSpy = vi.fn();

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    });

    let appendedElement: HTMLAnchorElement | null = null;
    let clicked = false;

    const originalAppendChild = document.body.appendChild.bind(document.body);
    const originalRemoveChild = document.body.removeChild.bind(document.body);

    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      appendedElement = node as HTMLAnchorElement;
      appendedElement.click = () => {
        clicked = true;
      };
      return node;
    });

    const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => {
      return node;
    });

    const content = 'Recipient,Amount\n\'=evil,100';
    downloadFile(content, 'test-export.csv', 'text/csv;charset=utf-8;');

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const [blobArg] = createObjectURLSpy.mock.calls[0] as [Blob];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe('text/csv;charset=utf-8;');
    expect(await blobArg.text()).toBe(content);

    expect(appendSpy).toHaveBeenCalled();
    expect(appendedElement).not.toBeNull();
    expect(appendedElement?.href).toBe(mockUrl);
    expect(appendedElement?.download).toBe('test-export.csv');
    expect(clicked).toBe(true);

    expect(removeSpy).toHaveBeenCalledWith(appendedElement);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(mockUrl);

    appendSpy.mockRestore();
    removeSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
