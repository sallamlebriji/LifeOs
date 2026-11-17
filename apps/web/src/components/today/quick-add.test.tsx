import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { I18nProvider, translate } from '@/i18n/i18n';
import { MESSAGES } from '@/i18n/messages';
import { QuickAdd } from './sections';

function wrap(ui: ReactNode, locale: 'en' | 'fr' = 'en') {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider locale={locale}>{ui}</I18nProvider>
    </QueryClientProvider>,
  );
}

describe('QuickAdd', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the task for the shown date and clears the field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'x' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<QuickAdd plannedDate="2026-11-17" />);

    const input = screen.getByLabelText('Add task');
    await userEvent.type(input, 'Call the bank');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init.body)).toEqual({ title: 'Call the bank', plannedDate: '2026-11-17' });
    expect(input).toHaveValue('');
  });

  it('only offers the submit button once there is text', async () => {
    wrap(<QuickAdd plannedDate="2026-11-17" />);
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument();
  });

  it('shows the API error inline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Validation failed' }), { status: 400 })),
    );
    wrap(<QuickAdd plannedDate="2026-11-17" />);
    await userEvent.type(screen.getByLabelText('Add task'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Validation failed');
  });
});

describe('i18n', () => {
  it('has a French string for every English key', () => {
    expect(Object.keys(MESSAGES.fr).sort()).toEqual(Object.keys(MESSAGES.en).sort());
  });
  it('interpolates variables', () => {
    expect(translate('fr', 'greeting.morning', { name: 'Sallam' })).toBe('Bonjour, Sallam');
  });
});
