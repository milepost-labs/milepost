import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Accessibility checks for a write sheet in one of its steps (#696).
 *
 * The route suite in accessibility.test.tsx sees every page only at rest, so a
 * sheet's focus trap, labelling and live status are never checked there. Each
 * sheet's tests open it, walk it through its steps (form, confirm, pending,
 * done, failed) and call these at every step.
 *
 * The sheet is portalled to the end of <body>, so axe runs on the whole
 * document, not on the render container.
 */

/**
 * A per-test timeout for tests that walk a sheet: axe runs over the whole
 * document once per step, which takes far longer than vitest's 5s default.
 */
export const SHEET_TEST_TIMEOUT = 60_000;

/** The open sheet. Fails if there is none, or more than one. */
export function openSheet(): HTMLElement {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
  expect(dialogs.length, 'expected exactly one open sheet').toBe(1);
  return dialogs[0];
}

/**
 * No serious or critical axe violation with the sheet open, and the sheet is a
 * labelled modal dialog. `step` names the step in the failure message.
 */
export async function expectSheetAccessible(step: string): Promise<void> {
  const sheet = openSheet();
  expect(sheet.getAttribute('aria-modal'), `${step}: sheet is not aria-modal`).toBe('true');
  const labelId = sheet.getAttribute('aria-labelledby');
  const label = labelId ? document.getElementById(labelId)?.textContent?.trim() : '';
  expect(label, `${step}: sheet has no accessible name`).toBeTruthy();

  const results = await axe.run(document.body);
  const violations = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  const report = [
    `${violations.length} serious/critical violation(s) with the sheet "${label}" open, ${step} step:`,
    ...violations.map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ');
      return `  - ${violation.id} [${violation.impact}]: ${violation.help} (${targets})`;
    }),
  ].join('\n');
  expect(violations, report).toEqual([]);
}

/** Focus is inside the open sheet. */
export function expectFocusInSheet(step: string): void {
  const sheet = openSheet();
  expect(
    sheet.contains(document.activeElement),
    `${step}: focus is on ${describe(document.activeElement)}, outside the sheet`,
  ).toBe(true);
}

/** Focus went back to what opened the sheet. */
export function expectFocusReturnedTo(opener: HTMLElement): void {
  expect(
    document.activeElement,
    `focus is on ${describe(document.activeElement)}, not back on the opener ${describe(opener)}`,
  ).toBe(opener);
}

/**
 * Click an opener as a person would: focus lands on it first, so the sheet
 * has somewhere to send focus back to.
 */
export function focusAndClick(opener: HTMLElement, click: (element: HTMLElement) => void): void {
  opener.focus();
  click(opener);
}

function describe(element: Element | null): string {
  if (!element) return 'nothing';
  const name = element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 40) ?? '';
  return `<${element.tagName.toLowerCase()}>${name ? ` "${name}"` : ''}`;
}
