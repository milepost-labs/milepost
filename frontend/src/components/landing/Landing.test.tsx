import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoadDemo } from './RoadDemo';
import { HowItWorks } from './HowItWorks';
import { PaymentModes } from './PaymentModes';
import { Sectors } from './Sectors';
import { Home } from '../../pages/Home';
import {
  FOOTER_GROUPS,
  HOW_STEPS,
  LANDING_MODES,
  SECTORS,
  boardSquares,
} from '../../pages/homeContent';
import { MODES_BY_STRENGTH } from '../../lib/modes';

const announce = vi.hoisted(() => vi.fn());
vi.mock('../../context/useAnnouncer', () => ({ useAnnouncer: () => announce }));

// The index is not what these tests are about; LiveIndex has its own.
vi.mock('../../lib/indexer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/indexer')>()),
  fetchMeta: vi.fn(() => new Promise(() => {})),
  fetchProgrammes: vi.fn(() => new Promise(() => {})),
}));

beforeEach(() => {
  announce.mockClear();
});

describe('RoadDemo', () => {
  it('starts with everything locked and releases exactly one tranche per confirmation', () => {
    render(<RoadDemo />);

    expect(screen.getByText(/1,500 USDC is awarded and locked\. Nothing moves until the registrar confirms/)).toBeTruthy();
    expect(document.querySelectorAll('.lp-tranche [data-s="released"]')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm term 1 as the registrar' }));

    // One tranche of ten squares, and only that one.
    expect(document.querySelectorAll('.lp-tranche [data-s="released"]')).toHaveLength(10);
    expect(document.querySelectorAll('.lp-tranche [data-s="locked"]')).toHaveLength(20);
    expect(screen.getByText(/Term 1 confirmed by the registrar\. 500 USDC released to the school\. 1,000 USDC stays locked\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm term 2 as the registrar' })).toBeTruthy();
  });

  it('announces each confirmation once, and says nothing by itself', () => {
    render(<RoadDemo />);
    expect(announce).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Confirm term 1/ }));
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0][0]).toMatch(/500 USDC released to the school/);
  });

  it('stops when all three are released, and starts over on request', () => {
    render(<RoadDemo />);
    for (const n of [1, 2, 3]) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`Confirm term ${n}`) }));
    }

    const done = screen.getByRole('button', { name: 'All three tranches released' }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    expect(screen.getByText(/All 1,500 USDC released, each tranche backed by its own signed proof\./)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(document.querySelectorAll('.lp-tranche [data-s="released"]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Confirm term 1 as the registrar' })).toBeTruthy();
  });

  it('is labelled an example', () => {
    render(<RoadDemo />);
    expect(screen.getByText(/^Example:/)).toBeTruthy();
  });
});

describe('HowItWorks', () => {
  it('marks exactly the three steps where money moves', () => {
    render(<HowItWorks />);
    expect(HOW_STEPS.filter((step) => step.money).map((step) => step.title)).toEqual([
      'Contribute',
      'Release',
      'Spend',
    ]);
    expect(screen.getByText('Money in')).toBeTruthy();
    expect(screen.getByText('Money moves')).toBeTruthy();
    expect(screen.getByText('Money out')).toBeTruthy();
  });

  it('always draws forty squares, whatever the step', () => {
    for (const step of HOW_STEPS) expect(boardSquares(step.board)).toHaveLength(40);
  });

  it('changes the board with the chosen step, and announces what happened to the money once', () => {
    render(<HowItWorks />);
    expect(screen.getByText('10,000 USDC contributed.')).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Release' }));

    expect(screen.getByText('2,437 released')).toBeTruthy();
    expect(document.querySelectorAll('.lp-board__grid [data-s="released"]')).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Release' }).getAttribute('aria-pressed')).toBe('true');
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0][0]).toMatch(/^Release\. The proof unlocks one tranche\./);

    // Pressing the step already shown says nothing more.
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('turns everything unpaid refundable once the window closes', () => {
    render(<HowItWorks />);
    fireEvent.click(screen.getByRole('button', { name: 'After the window' }));
    expect(document.querySelectorAll('.lp-board__grid [data-s="refundable"]')).toHaveLength(30);
    expect(document.querySelectorAll('.lp-board__grid [data-s="locked"]')).toHaveLength(0);
  });

  it('brings no live region of its own: the shared announcer speaks', () => {
    const { container } = render(<HowItWorks />);
    expect(container.querySelector('[aria-live]')).toBeNull();
  });
});

describe('PaymentModes', () => {
  it('lists the four modes strongest first, in the order the rest of the app uses', () => {
    render(<PaymentModes />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(MODES_BY_STRENGTH);
    expect(LANDING_MODES.map((mode) => mode.name)).toEqual(MODES_BY_STRENGTH);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/1 of 4 · Strongest guarantee/)).toBeTruthy();
  });

  it('moves with the arrow keys, wraps, and keeps one tab stop', () => {
    render(<PaymentModes />);
    const tabs = screen.getAllByRole('tab');

    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(tabs[3].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs[3]);
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);

    fireEvent.keyDown(tabs[3], { key: 'Home' });
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('does not present Restricted as a sound guarantee, and says where nothing is checked', () => {
    render(<PaymentModes />);
    fireEvent.click(screen.getByRole('tab', { name: 'Restricted' }));

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText(/Weaker than it looks/)).toBeTruthy();
    expect(within(panel).getByText(/A misconfigured wallet quietly becomes unrestricted\./)).toBeTruthy();
    expect(within(panel).getByText('no check here')).toBeTruthy();
    expect(within(panel).getByText(/Guarantee strength 2 of 4/)).toBeTruthy();
  });
});

describe('Sectors', () => {
  it('rewrites the sentence for the chosen sector and lists all six in the table', () => {
    render(<Sectors />);
    expect(screen.getAllByRole('row')).toHaveLength(SECTORS.length + 1);

    fireEvent.click(screen.getByRole('button', { name: 'Health stipends' }));

    expect(screen.getByRole('button', { name: 'Health stipends' }).getAttribute('aria-pressed')).toBe('true');
    const sentence = document.querySelector('.lp-sentence');
    expect(sentence?.textContent).toBe(
      'The district clinic confirms the shifts worked this month, and the health worker gets paid.',
    );
    // Once someone has chosen, later changes are announced.
    expect(sentence?.getAttribute('aria-live')).toBe('polite');
  });
});

describe('Home', () => {
  const renderHome = () =>
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

  it('has one h1 with the headline, and sends "Launch app" to the directory', async () => {
    await act(async () => {
      renderHome();
    });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Money moves at each milepost. And only there.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Launch app' }).getAttribute('href')).toBe('/directory');
    expect(screen.getByRole('link', { name: 'Browse programmes' }).getAttribute('href')).toBe('/directory');
  });

  it('gives the header a target for every section link', async () => {
    await act(async () => {
      renderHome();
    });
    for (const id of ['how', 'modes', 'limits', 'developers']) {
      expect(document.getElementById(id), `#${id}`).toBeTruthy();
    }
  });

  it('never claims what the brand forbids, and says testnet and pre-audit', async () => {
    let container: HTMLElement;
    await act(async () => {
      container = renderHome().container;
    });
    const text = container!.textContent ?? '';
    expect(text).not.toMatch(/passkey|face id|no xlm needed|@milepost\/sdk/i);
    expect(text).toMatch(/Stellar testnet · pre-audit · not for real funds/);
    // Cash-out is on the page only as roadmap.
    expect(screen.getByText('Roadmap · not available')).toBeTruthy();
    expect(text).toMatch(/doesn't connect to any anchor yet/);
  });

  it('links every footer entry', async () => {
    await act(async () => {
      renderHome();
    });
    for (const group of FOOTER_GROUPS) {
      const nav = screen.getByRole('navigation', { name: group.heading });
      expect(within(nav).getAllByRole('link')).toHaveLength(group.links.length);
    }
  });
});
