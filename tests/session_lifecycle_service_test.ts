import { createEmulationSession } from '../src/composition/emulation_session.ts';
import { SessionRepository } from '../src/repositories/session.ts';
import { SessionLifecycleService } from '../src/services/session_lifecycle.ts';

Deno.test('SessionLifecycleService creates, retrieves, and ends an active session', () => {
  const sessionRepository = new SessionRepository();
  sessionRepository.add(createEmulationSession('existing-session'));
  const generatedSessionIds = ['existing-session', 'new-session'];
  const createdSessionIds: string[] = [];
  const sessionLifecycle = new SessionLifecycleService({
    sessionRepository,
    createEmulationSession: (sessionId) => {
      createdSessionIds.push(sessionId);
      return createEmulationSession(sessionId);
    },
    generateSessionId: () => {
      const sessionId = generatedSessionIds.shift();
      if (sessionId === undefined) {
        throw new Error('Expected another generated session ID');
      }
      return sessionId;
    },
  });

  const session = sessionLifecycle.createSession();
  if (session.id !== 'new-session') {
    throw new Error('Expected session creation to retry after an ID collision');
  }
  if (createdSessionIds.length !== 1 || createdSessionIds[0] !== session.id) {
    throw new Error('Expected only the unique session ID to be composed');
  }
  if (sessionLifecycle.getSessionById(session.id) !== session) {
    throw new Error('Expected the active session to be retrievable');
  }
  if (!sessionLifecycle.endSession(session.id)) {
    throw new Error('Expected the active session to end');
  }
  if (sessionLifecycle.getSessionById(session.id) !== undefined) {
    throw new Error('Expected the ended session not to be retrievable');
  }
});

Deno.test('SessionLifecycleService ends a session once, after it can no longer be found', () => {
  const sessionIdsFoundWhileEnding: (string | undefined)[] = [];
  const sessionLifecycle: SessionLifecycleService = new SessionLifecycleService({
    sessionRepository: new SessionRepository(),
    createEmulationSession: (sessionId) => ({
      ...createEmulationSession(sessionId),
      end: () => {
        sessionIdsFoundWhileEnding.push(sessionLifecycle.getSessionById(sessionId)?.id);
      },
    }),
    generateSessionId: () => 'ending-session',
  });
  const session = sessionLifecycle.createSession();

  if (!sessionLifecycle.endSession(session.id)) {
    throw new Error('Expected the active session to end');
  }
  if (sessionLifecycle.endSession(session.id)) {
    throw new Error('Expected an ended session not to end again');
  }
  if (sessionIdsFoundWhileEnding.length !== 1 || sessionIdsFoundWhileEnding[0] !== undefined) {
    throw new Error('Expected the session to end exactly once, after it was unregistered');
  }
});

Deno.test('SessionLifecycleService rejects a factory result with the wrong ID', () => {
  const sessionLifecycle = new SessionLifecycleService({
    sessionRepository: new SessionRepository(),
    createEmulationSession: () => createEmulationSession('unexpected-session'),
    generateSessionId: () => 'requested-session',
  });

  try {
    sessionLifecycle.createSession();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'Session factory returned ID unexpected-session for requested ID requested-session'
    ) {
      return;
    }
    throw error;
  }

  throw new Error('Expected session creation to reject a mismatched factory result');
});

Deno.test('SessionLifecycleService limits retries for duplicate generated IDs', () => {
  const sessionRepository = new SessionRepository();
  sessionRepository.add(createEmulationSession('existing-session'));
  let generationAttempts = 0;
  const sessionLifecycle = new SessionLifecycleService({
    sessionRepository,
    createEmulationSession: () => {
      throw new Error('Expected duplicate IDs to be rejected before session composition');
    },
    generateSessionId: () => {
      generationAttempts++;
      return 'existing-session';
    },
  });

  try {
    sessionLifecycle.createSession();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Unable to generate a unique session ID after 10 attempts' &&
      generationAttempts === 10
    ) {
      return;
    }
    throw error;
  }

  throw new Error('Expected session creation to stop after its retry limit');
});
