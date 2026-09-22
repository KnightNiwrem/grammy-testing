import type { EmulationSession } from '../../types/emulation_session.ts';

interface SessionRouteVariables {
  readonly emulationSession: EmulationSession;
}

export interface SessionRouteContextTypes {
  readonly Variables: SessionRouteVariables;
}
