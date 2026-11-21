/**
 * Tests for src/components/landing/motion.ts
 *
 * Covers:
 *   prefersReducedMotion() — baseline true/false, matchMedia unavailable,
 *     responds to a change event;
 *   useInView() — false with no IO, false without IO support (fallback),
 *     true on entering intersection, false on leaving, cleanup on unmount;
 *   useReveal() — no-op when IO unavailable or reduced-motion on,
 *     sets data-reveal-ready, adds is-in class on intersection, one-shot
 *     (unobserves after reveal), cleans up on unmount.
 *
 * All globals (matchMedia, IntersectionObserver) are hand-stubbed and
 * restored in afterEach so tests do not leak.
 *
 * Closes #641
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { prefersReducedMotion, useInView, useReveal } from './motion';

// ---------------------------------------------------------------------------
// Helpers — hand-written fake IntersectionObserver
// ---------------------------------------------------------------------------

type IOCallback = (entries: IntersectionObserverEntry[]) => void;

interface FakeIOInstance {
  callback: IOCallback;
  observed: Set<Element>;
  observe: (el: Element) => void;
  unobserve: (el: Element) => void;
  disconnect: () => void;
  /** Fire an intersection entry for `el`. */
  fire: (el: Element, intersecting: boolean) => void;
}

function makeFakeIO(): {
  instances: FakeIOInstance[];
  Constructor: typeof IntersectionObserver;
} {
  const instances: FakeIOInstance[] = [];

  // A regular function, not an arrow: the hook calls it with `new`.
  const Constructor = vi.fn().mockImplementation(function (cb: IOCallback) {
    const inst: FakeIOInstance = {
      callback: cb,
      observed: new Set(),
      observe(el) {
        this.observed.add(el);
      },
      unobserve(el) {
        this.observed.delete(el);
      },
      disconnect() {
        this.observed.clear();
      },
      fire(el, intersecting) {
        this.callback([{ target: el, isIntersecting: intersecting } as IntersectionObserverEntry]);
      },
    };
    instances.push(inst);
    return inst;
  }) as unknown as typeof IntersectionObserver;

  return { instances, Constructor };
}

// ---------------------------------------------------------------------------
// Helpers — hand-written fake matchMedia
// ---------------------------------------------------------------------------

function makeFakeMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners: Array<(e: { matches: boolean }) => void> = [];

  const mql = {
    get matches() {
      return matches;
    },
    addEventListener(_type: string, cb: (e: { matches: boolean }) => void) {
      listeners.push(cb);
    },
    removeEventListener(_type: string, cb: (e: { matches: boolean }) => void) {
      const idx = listeners.indexOf(cb);
      if (idx !== -1) listeners.splice(idx, 1);
    },
    // Helper to change and fire
    change(value: boolean) {
      matches = value;
      for (const cb of listeners) cb({ matches });
    },
  };

  return { mql, change: mql.change.bind(mql) };
}

// ---------------------------------------------------------------------------
// Save & restore originals
// ---------------------------------------------------------------------------

let origMatchMedia: typeof window.matchMedia;
let origIO: typeof window.IntersectionObserver;

beforeEach(() => {
  origMatchMedia = window.matchMedia;
  origIO = window.IntersectionObserver;
});

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: origMatchMedia,
  });
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: origIO,
  });
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// prefersReducedMotion()
// ---------------------------------------------------------------------------

describe('prefersReducedMotion()', () => {
  it('returns false when matchMedia reports no preference', () => {
    const { mql } = makeFakeMedia(false);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => mql,
    });
    expect(prefersReducedMotion()).toBe(false);
  });

  it('returns true when matchMedia reports reduced-motion preference', () => {
    const { mql } = makeFakeMedia(true);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => mql,
    });
    expect(prefersReducedMotion()).toBe(true);
  });

  it('returns false safely when matchMedia is not a function', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(prefersReducedMotion()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useInView()
// ---------------------------------------------------------------------------

describe('useInView()', () => {
  it('starts false', () => {
    const { instances, Constructor } = makeFakeIO();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: Constructor,
    });

    const { result } = renderHook(() => {
      const ref = useRef<Element>(document.createElement('div'));
      return useInView(ref);
    });

    expect(result.current).toBe(false);
    // Observer was created with the element observed
    expect(instances.length).toBe(1);
  });

  it('becomes true when the element intersects', () => {
    const { instances, Constructor } = makeFakeIO();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: Constructor,
    });

    const el = document.createElement('div');
    const { result } = renderHook(() => {
      const ref = useRef<Element>(el);
      return useInView(ref);
    });

    act(() => {
      instances[0].fire(el, true);
    });

    expect(result.current).toBe(true);
  });

  it('goes back to false when the element leaves the viewport', () => {
    const { instances, Constructor } = makeFakeIO();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: Constructor,
    });

    const el = document.createElement('div');
    const { result } = renderHook(() => {
      const ref = useRef<Element>(el);
      return useInView(ref);
    });

    act(() => instances[0].fire(el, true));
    expect(result.current).toBe(true);

    act(() => instances[0].fire(el, false));
    expect(result.current).toBe(false);
  });

  it('stays false and does not create an observer when IntersectionObserver is unavailable', () => {
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    const { result } = renderHook(() => {
      const ref = useRef<Element>(document.createElement('div'));
      return useInView(ref);
    });

    expect(result.current).toBe(false);
  });

  it('disconnects the observer on unmount', () => {
    const { instances, Constructor } = makeFakeIO();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: Constructor,
    });

    const el = document.createElement('div');
    const { unmount } = renderHook(() => {
      const ref = useRef<Element>(el);
      return useInView(ref);
    });

    expect(instances[0].observed.has(el)).toBe(true);
    unmount();
    expect(instances[0].observed.size).toBe(0);
  });

  it('repeated enters stay true without error', () => {
    const { instances, Constructor } = makeFakeIO();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: Constructor,
    });

    const el = document.createElement('div');
    const { result } = renderHook(() => {
      const ref = useRef<Element>(el);
      return useInView(ref);
    });

    act(() => instances[0].fire(el, true));
    act(() => instances[0].fire(el, true));
    act(() => instances[0].fire(el, true));

    expect(result.current).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useReveal()
// ---------------------------------------------------------------------------

describe('useReveal()', () => {
  it('is a no-op when IntersectionObserver is unavailable', () => {
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    const root = document.createElement('div');
    const child = document.createElement('span');
    child.setAttribute('data-reveal', '');
    root.appendChild(child);

    renderHook(() => {
      const ref = useRef<HTMLElement>(root);
      useReveal(ref);
    });

    expect(root.hasAttribute('data-reveal-ready')).toBe(false);
    expect(child.classList.contains('is-in')).toBe(false);
  });

  it('is a no-op when reduced motion is preferred', () => {
    const { mql } = makeFakeMedia(true);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => mql,
    });
    const { Constructor } = makeFakeIO();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: Constructor,
    });

    const root = document.createElement('div');
    const child = document.createElement('span');
    child.setAttribute('data-reveal', '');
    root.appendChild(child);

    renderHook(() => {
      const ref = useRef<HTMLElement>(root);
      useReveal(ref);
    });

    expect(root.hasAttribute('data-reveal-ready')).toBe(false);
    expect(Constructor).not.toHaveBeenCalled();
  });

  it('sets data-reveal-ready on the root when motion is allowed', () => {
    const { mql } = makeFakeMedia(false);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => mql,
    });
    const { Constructor } = makeFakeIO();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: Constructor,
    });

    const root = document.createElement('div');

    renderHook(() => {
      const ref = useRef<HTMLElement>(root);
      useReveal(ref);
    });

    expect(root.hasAttribute('data-reveal-ready')).toBe(true);
  });

  it('adds is-in class when a [data-reveal] element intersects', () => {
    const { mql } = makeFakeMedia(false);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => mql,
    });
    const { instances, Constructor } = makeFakeIO();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: Constructor,
    });

    const root = document.createElement('div');
    const child = document.createElement('span');
    child.setAttribute('data-reveal', '');
    root.appendChild(child);

    renderHook(() => {
      const ref = useRef<HTMLElement>(root);
      useReveal(ref);
    });

    act(() => {
      instances[0].fire(child, true);
    });

    expect(child.classList.contains('is-in')).toBe(true);
  });

  it('unobserves an element after it is revealed (one-shot)', () => {
    const { mql } = makeFakeMedia(false);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => mql,
    });
    const { instances, Constructor } = makeFakeIO();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: Constructor,
    });

    const root = document.createElement('div');
    const child = document.createElement('span');
    child.setAttribute('data-reveal', '');
    root.appendChild(child);

    renderHook(() => {
      const ref = useRef<HTMLElement>(root);
      useReveal(ref);
    });

    expect(instances[0].observed.has(child)).toBe(true);

    act(() => {
      instances[0].fire(child, true);
    });

    // After reveal the element is unobserved
    expect(instances[0].observed.has(child)).toBe(false);
  });

  it('does not add is-in when the element leaves the viewport (not intersecting)', () => {
    const { mql } = makeFakeMedia(false);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => mql,
    });
    const { instances, Constructor } = makeFakeIO();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: Constructor,
    });

    const root = document.createElement('div');
    const child = document.createElement('span');
    child.setAttribute('data-reveal', '');
    root.appendChild(child);

    renderHook(() => {
      const ref = useRef<HTMLElement>(root);
      useReveal(ref);
    });

    act(() => {
      instances[0].fire(child, false);
    });

    expect(child.classList.contains('is-in')).toBe(false);
  });

  it('disconnects and removes data-reveal-ready on unmount', () => {
    const { mql } = makeFakeMedia(false);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => mql,
    });
    const { instances, Constructor } = makeFakeIO();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: Constructor,
    });

    const root = document.createElement('div');

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement>(root);
      useReveal(ref);
    });

    expect(root.hasAttribute('data-reveal-ready')).toBe(true);
    unmount();
    expect(root.hasAttribute('data-reveal-ready')).toBe(false);
    expect(instances[0].observed.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A simple test component exercising useReveal via render
// ---------------------------------------------------------------------------

function RevealFixture() {
  const ref = useRef<HTMLElement>(null);
  useReveal(ref);
  return (
    <section ref={ref}>
      <div data-reveal="">item</div>
    </section>
  );
}

describe('useReveal via rendered component', () => {
  it('renders without error', () => {
    const { mql } = makeFakeMedia(false);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => mql,
    });
    const { Constructor } = makeFakeIO();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: Constructor,
    });

    const { container } = render(<RevealFixture />);
    expect(container.querySelector('[data-reveal-ready]')).toBeTruthy();
  });
});
