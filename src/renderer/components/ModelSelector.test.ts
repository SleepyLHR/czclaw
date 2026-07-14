import { expect, test } from 'vitest';

import { resolveDropdownListMaxHeight, resolveHoverCardTop } from './ModelSelector';

test('keeps model hover card above the viewport bottom', () => {
  expect(resolveHoverCardTop(790, 260, 900)).toBe(632);
});

test('keeps model hover card below the viewport top margin', () => {
  expect(resolveHoverCardTop(-20, 120, 900)).toBe(8);
});

test('does not move a fully visible model hover card', () => {
  expect(resolveHoverCardTop(240, 180, 900)).toBe(240);
});

test('pins model hover card to the margin when it is taller than the viewport', () => {
  expect(resolveHoverCardTop(160, 1000, 900)).toBe(8);
});

test('caps the model list at its default height when space allows', () => {
  expect(resolveDropdownListMaxHeight(600, true, true)).toBe(288);
});

test('shrinks the model list so group tabs and footer stay visible in short windows', () => {
  // 341px available minus tabs (49) + footer (33) + borders (2)
  expect(resolveDropdownListMaxHeight(341, true, true)).toBe(257);
});

test('keeps at least three model rows visible when space is extremely tight', () => {
  expect(resolveDropdownListMaxHeight(50, true, true)).toBe(116);
});

test('uses the full available space when tabs and footer are hidden', () => {
  expect(resolveDropdownListMaxHeight(200, false, false)).toBe(198);
});
