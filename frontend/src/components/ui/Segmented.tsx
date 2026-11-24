import type { ReactNode } from 'react';
import './ui.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** A small count beside the label, as on the directory's phase filter. */
  count?: number;
}

export interface SegmentedProps<T extends string> {
  /** Names the group for screen readers, e.g. "Filter by phase". */
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * A row of mutually exclusive choices in one sunken track: a filter, or a
 * switch between views of the same page. Each option is a toggle button, so
 * the chosen one is announced as pressed.
 */
export function Segmented<T extends string>({ label, options, value, onChange, className = '' }: SegmentedProps<T>) {
  return (
    <div className={`ui-segmented ${className}`.trim()} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="ui-segmented__option"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span className="ui-segmented__count numeric">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
