import { useEffect, useState, type RefObject } from 'react';

/** True when the reader has asked for less motion. Safe where `matchMedia` is missing. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Whether the element is on screen. Used to run a demo only while someone can
 * see it. Reports false where `IntersectionObserver` does not exist.
 */
export function useInView(ref: RefObject<Element | null>, threshold = 0.3): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => setInView(entry.isIntersecting)),
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, threshold]);

  return inView;
}

/**
 * Reveals `[data-reveal]` elements inside the container as they scroll into
 * view. The hidden state only applies once the container is marked ready, so
 * the page reads normally without scripting, without an observer, and for
 * anyone who asked for less motion.
 */
export function useReveal(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;

    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }),
      { threshold: 0.15 },
    );
    root.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
    root.setAttribute('data-reveal-ready', '');

    return () => {
      observer.disconnect();
      root.removeAttribute('data-reveal-ready');
    };
  }, [ref]);
}
