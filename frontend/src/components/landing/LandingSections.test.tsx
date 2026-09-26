import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoleEntryCards } from './RoleEntryCards';
import { ProblemSection } from './ProblemSection';
import { PROBLEM_HEADING, PROBLEM_QUESTIONS, ROLE_ENTRIES } from '../../pages/homeContent';

describe('RoleEntryCards (issue #254)', () => {
  it('renders one link per role, each pointing at its route', () => {
    render(
      <MemoryRouter>
        <RoleEntryCards />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(ROLE_ENTRIES.length);

    for (const entry of ROLE_ENTRIES) {
      const link = screen.getByRole('link', { name: new RegExp(entry.want, 'i') });
      expect(link.getAttribute('href')).toBe(entry.path);
    }
  });

  it('names the section for assistive technology', () => {
    render(
      <MemoryRouter>
        <RoleEntryCards />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: 'What brings you here?' }),
    ).toBeDefined();
  });
});

describe('ProblemSection (issue #255)', () => {
  it('states the problem and numbers the three questions in order', () => {
    render(<ProblemSection />);

    expect(screen.getByText('The problem')).toBeDefined();
    expect(screen.getByRole('heading', { name: PROBLEM_HEADING })).toBeDefined();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(PROBLEM_QUESTIONS.length);

    PROBLEM_QUESTIONS.forEach((question, index) => {
      expect(within(items[index]).getByText(question.n)).toBeDefined();
      expect(within(items[index]).getByText(question.question)).toBeDefined();
    });
  });
});
