import { expect, test } from 'vitest';

import { removeSessionFromState, removeSessionsFromState } from './coworkDeleteState';

const createState = () => ({
  sessions: [{ id: 'one' }, { id: 'two' }],
  unreadSessionIds: ['one', 'two'],
  currentSessionId: 'one',
  currentSession: { id: 'one' },
  isStreaming: true,
  draftSelectedTextSnippets: {
    one: [{ id: 'snippet-one' }],
    two: [{ id: 'snippet-two' }],
  },
});

test('removeSessionFromState removes selected text draft snippets', () => {
  const state = createState();

  removeSessionFromState(state, 'one');

  expect(state.draftSelectedTextSnippets).toEqual({
    two: [{ id: 'snippet-two' }],
  });
});

test('removeSessionsFromState removes selected text draft snippets', () => {
  const state = createState();

  removeSessionsFromState(state, ['one', 'two']);

  expect(state.draftSelectedTextSnippets).toEqual({});
});
