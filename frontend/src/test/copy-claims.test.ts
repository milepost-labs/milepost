import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copy must not promise what the app cannot do.
 *
 * Three screens once carried a promise the code did not keep: passkey sign-in,
 * covered network fees and a full refund. On a product that moves money, a
 * false promise is worse than a missing feature, and it is easy to reinstate
 * by accident — a headline that reads well, a card nobody updated. So this
 * test reads the source and fails when one comes back.
 *
 * "passkey" is allowed only inside an explicit not-yet sentence: Stellar's
 * smart-wallet future is worth explaining, but every mention must say the app
 * does not offer it yet. "fees are covered" and "full refund" have no honest
 * use here at all. Test files are skipped because this one has to name the
 * phrases to forbid them.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const IGNORED = [/\.test\.tsx?$/, /^test[\\/]/];

/** Negation that makes a sentence an explicit "not yet" rather than a promise. */
const NOT_YET = /(?:\bnot\b|\bnever\b|\bno\b|\bn'?t\b|\bunavailable\b)/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const FILES = sourceFiles(SRC).filter((file) => {
  const rel = relative(SRC, file);
  return !IGNORED.some((pattern) => pattern.test(rel));
});

/** A line can hold several sentences; each mention is judged in its own. */
function sentences(line: string): string[] {
  return line.split(/(?<=[.!?])\s+/);
}

function offendingFiles(pattern: RegExp): string[] {
  return FILES.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((file) =>
    relative(SRC, file),
  );
}

describe('copy claims', () => {
  it('never promises a full refund', () => {
    expect(
      offendingFiles(/full refund/i),
      'Refunds are proportional to each contribution, after the protocol fee. Say that instead.',
    ).toEqual([]);
  });

  it('never says network fees are covered', () => {
    expect(
      offendingFiles(/fees? (?:are|is|were) covered/i),
      'The user pays network fees in XLM; the app does not sponsor them yet.',
    ).toEqual([]);
  });

  it('mentions passkeys only inside an explicit not-yet sentence', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .forEach((line, index) => {
          if (!/passkey/i.test(line)) return;
          for (const sentence of sentences(line)) {
            if (/passkey/i.test(sentence) && !NOT_YET.test(sentence)) {
              offenders.push(`${relative(SRC, file)}:${index + 1}: ${sentence.trim()}`);
            }
          }
        });
    }
    expect(
      offenders,
      'Sign-in is Freighter only. Only say "passkey" where the same sentence says the app does not offer it yet.',
    ).toEqual([]);
  });
});
