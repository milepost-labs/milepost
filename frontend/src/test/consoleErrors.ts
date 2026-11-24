/**
 * Fails a test that logs an unexpected console.error (#690).
 *
 * React reports render, act() and prop-type problems through console.error. A
 * test can pass while one of them is logged, and the line scrolls past in CI
 * where nobody reads it, though each is usually a real bug. src/test/setup.ts
 * installs the guard once for every test file. A test that logs an error on
 * purpose says so first:
 *
 *     expectConsoleError(/Loading chunk 123 failed/, 'the lazy route throws on purpose');
 *
 * The pattern is matched against the whole message, and the reason is required
 * so each opt-in says why. Opt-ins reset before every test. Output is still
 * printed, so an opted-in message stays visible in the test log.
 */

/** One console.error call, with its arguments joined into one string. */
function formatArguments(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      try {
        return JSON.stringify(arg) ?? String(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

let expected: RegExp[] = [];
let unexpected: string[] = [];

/**
 * Replaces console.error with a recorder that still prints. Called once, from
 * src/test/setup.ts, before any test runs.
 */
export function installConsoleErrorGuard(): void {
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const message = formatArguments(args);
    if (!expected.some((pattern) => pattern.test(message))) unexpected.push(message);
    original(...args);
  };
}

/**
 * Allows a console.error whose message matches `pattern` in the current test.
 * Call it in the test body, before the code that logs the error runs.
 */
export function expectConsoleError(pattern: RegExp, reason: string): void {
  if (reason.trim().length <= 10) {
    throw new Error(`expectConsoleError(${pattern}) needs a reason that says why the error is expected.`);
  }
  expected.push(pattern);
}

/** Clears the opt-ins and the record. Called before each test. */
export function resetConsoleErrorGuard(): void {
  expected = [];
  unexpected = [];
}

/**
 * The unexpected console.error messages logged since the last reset, and clears
 * them. Called after each test, which fails if this is not empty.
 */
export function takeUnexpectedConsoleErrors(): string[] {
  const messages = unexpected;
  unexpected = [];
  return messages;
}
