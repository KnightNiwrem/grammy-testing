import type { EmulationSession } from '../types/emulation_session.ts';

export class SessionRepository {
  readonly #sessions = new Map<string, EmulationSession>();

  add(session: EmulationSession): boolean {
    if (this.#sessions.has(session.id)) {
      return false;
    }
    this.#sessions.set(session.id, session);
    return true;
  }

  deleteById(sessionId: string): boolean {
    return this.#sessions.delete(sessionId);
  }

  getById(sessionId: string): EmulationSession | undefined {
    return this.#sessions.get(sessionId);
  }
}
