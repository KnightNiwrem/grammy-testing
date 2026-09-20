import type { EmulationSession } from '../../session_registry.ts';

interface SessionRouteVariables {
  readonly emulationSession: EmulationSession;
}

export interface SessionRouteContextTypes {
  readonly Variables: SessionRouteVariables;
}
