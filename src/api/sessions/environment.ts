import type { EmulationSession } from '../../session_registry.ts';

export interface SessionRouteEnvironment {
  readonly Variables: {
    readonly emulationSession: EmulationSession;
  };
}
