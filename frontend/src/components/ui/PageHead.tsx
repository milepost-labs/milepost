import type { ReactNode } from 'react';
import './ui.css';

export interface PageHeadProps {
  /** The section the page belongs to, in small caps above the title. */
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  /** Sits opposite the title: the page's one main action. */
  action?: ReactNode;
}

/** The top of every app page: section, title, a sentence, and one action. */
export function PageHead({ eyebrow, title, children, action }: PageHeadProps) {
  return (
    <header className="ui-page-head">
      <div className="ui-page-head__text">
        {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
        <h1 className="ui-page-head__title">{title}</h1>
        {children && <div className="ui-page-head__lead">{children}</div>}
      </div>
      {action && <div className="ui-page-head__action">{action}</div>}
    </header>
  );
}
