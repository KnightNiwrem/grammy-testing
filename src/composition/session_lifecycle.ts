import { SessionRepository } from '../repositories/session.ts';
import { SessionLifecycleService } from '../services/session_lifecycle.ts';
import { createEmulationSession } from './emulation_session.ts';

export function createSessionLifecycleService(): SessionLifecycleService {
  return new SessionLifecycleService({
    sessionRepository: new SessionRepository(),
    createEmulationSession,
    generateSessionId: () => crypto.randomUUID(),
  });
}
