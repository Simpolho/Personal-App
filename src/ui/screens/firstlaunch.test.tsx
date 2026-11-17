import { screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { ensureTablesLoaded, type TableFile } from '../../data/tables';
import { resetDb } from '../../db/db';
import { createMeal } from '../../db/log';
import { renderAt, user } from '../../test/render';

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
});

const insa: TableFile = { version: '2026-11', source: 'insa', foods: [['insa:1', 'Arroz agulha cru', '100g', [358, 7.2, null, null, null, null, null, null], []]] };
const fakeFetch = (async (url: string) =>
  url.endsWith('insa.json') ? new Response(JSON.stringify(insa)) : new Response('', { status: 404 })) as typeof fetch;

test('a search typed while the food tables are still loading fills in once they arrive', async () => {
  const meal = await createMeal('2026-11-16');
  renderAt(`#/meal/${meal.id}/add`);
  await user.type(await screen.findByPlaceholderText('Search foods'), 'arroz');
  expect(await screen.findByText(/No foods found/)).toBeInTheDocument();
  await ensureTablesLoaded(fakeFetch);
  expect(await screen.findByText('Arroz agulha cru')).toBeInTheDocument();
});
