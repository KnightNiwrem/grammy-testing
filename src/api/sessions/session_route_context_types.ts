import type { EmulationSession } from '../../emulation_session.ts';

interface SessionRouteVariables {
  readonly emulationSession: EmulationSession;
}

export interface SessionRouteContextTypes {
  readonly Variables: SessionRouteVariables;
}
