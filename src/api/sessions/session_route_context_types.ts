import type { EmulationSession } from '../../repositories/session.ts';

interface SessionRouteVariables {
  readonly emulationSession: EmulationSession;
}

export interface SessionRouteContextTypes {
  readonly Variables: SessionRouteVariables;
}
