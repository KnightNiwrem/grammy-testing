import { createEmulationApi } from '../src/api/mod.ts';
import { SessionRegistry } from '../src/session_registry.ts';

Deno.test('POST /sessions creates a session and returns its API locations', async () => {
  const publicOrigin = 'http://emulator.example:9000';
  const api = createEmulationApi({
    sessions: new SessionRegistry(),
    publicOrigin,
  });

  const response = await api.request('/sessions', { method: 'POST' });
  const body: unknown = await response.json();

  if (response.status !== 201) {
    throw new Error(`Expected status 201, received ${response.status}`);
  }
  if (!isSessionResponse(body)) {
    throw new Error('Expected a session response with an ID and Bot API root');
  }

  const sessionPath = `/sessions/${body.id}`;
  if (response.headers.get('Location') !== sessionPath) {
    throw new Error('Expected Location to identify the created session');
  }
  if (body.botApiRoot !== `${publicOrigin}${sessionPath}/bot-api`) {
    throw new Error('Expected botApiRoot to identify the session Bot API');
  }
});

Deno.test('DELETE /sessions/:sessionId ends an active session', async () => {
  const api = createEmulationApi({
    sessions: new SessionRegistry(),
    publicOrigin: 'http://emulator.example:9000',
  });
  const createResponse = await api.request('/sessions', { method: 'POST' });
  const sessionPath = createResponse.headers.get('Location');
  if (sessionPath === null) {
    throw new Error('Expected the created session to have a Location');
  }

  const deleteResponse = await api.request(sessionPath, { method: 'DELETE' });
  if (deleteResponse.status !== 204) {
    throw new Error(`Expected status 204, received ${deleteResponse.status}`);
  }
});

function isSessionResponse(value: unknown): value is { id: string; botApiRoot: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { id, botApiRoot } = value as Record<string, unknown>;
  return typeof id === 'string' && id.length > 0 && typeof botApiRoot === 'string';
}
