import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { buildFinancialSnapshot, monthTotals, categoryChanges, netWorth } from '../../src/ai/snapshot.js';

// The AI CFO relies on these figures being right: the model is told to quote
// them, never to calculate. Values below are worked out by hand from the fixture.
const data = JSON.parse(fs.readFileSync(new URL('../fixtures/feature-validation-data.json', import.meta.url), 'utf8'));

test.describe('AI snapshot figures', () => {
  test('month totals', () => {
    const t = monthTotals(data, '2026-03');
    expect(t.income).toBe(5500);
    expect(t.expenses).toBeCloseTo(2221.99, 2);
    expect(t.net).toBeCloseTo(3278.01, 2);
    expect(Math.round(t.savingsRate)).toBe(60);
  });

  test('category changes vs last month and earlier average', () => {
    const groceries = categoryChanges(data, '2026-03').find(c => c.cat === 'Groceries');
    expect(groceries.amount).toBe(370);
    expect(groceries.lastMonth).toBe(320);
    expect(Math.round(groceries.vsLastMonthPct)).toBe(16);
    expect(groceries.avg3).toBe(335);
    expect(groceries.avgMonths).toBe(2);
  });

  test('net worth uses assets, accounts and liabilities', () => {
    expect(netWorth(data)).toEqual({ assets: 8000, liabilities: 11500, netWorth: -3500 });
  });

  test('snapshot text carries the key figures the model must quote', () => {
    const s = buildFinancialSnapshot(data, { monthKey: '2026-03', today: '2026-06-01' });
    expect(s).toContain('Income: $5,500.00');
    expect(s).toContain('Spending: $2,221.99');
    expect(s).toContain('Savings rate: 60%');
    expect(s).toContain('Groceries: $370.00');
    expect(s).toContain('up $50.00 (+16%) from $320.00 last month');
    expect(s).toContain('Spending vs last month: up $255.00 (+13%) from $1,966.99 in February 2026');
    expect(s).toContain('Personal Care: $45.00 (2% of spending); same as last month');
    expect(s).toContain('Emergency runway: 3.9 months');
    expect(s).toContain('22.99% APR, about $67.05/month in interest');
    expect(s).toContain('Net worth: -$3,500.00');
  });

  test('compact snapshot stays small for little models', () => {
    const s = buildFinancialSnapshot(data, { monthKey: '2026-03', compact: true });
    expect(s.length).toBeLessThan(4000);
  });

  test('empty ledger produces a safe message', () => {
    expect(buildFinancialSnapshot({ months: {}, order: [], settings: {} })).toContain('Financial snapshot');
    expect(buildFinancialSnapshot(null)).toContain('No financial data');
  });
});
