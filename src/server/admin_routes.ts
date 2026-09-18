/**
 * Routes the admin API through which a test creates and destroys sessions and declares the
 * entities that exist inside them. All bodies and responses are JSON.
 */
import type {
  AdminErrorResponse,
  ChatResponse,
  CreateBotRequest,
  CreateBotResponse,
  CreateChatRequest,
  CreateSessionResponse,
  CreateUserRequest,
  CreateUserResponse,
  ListMessagesResponse,
} from '../shared/admin_protocol.ts';
import { ADMIN_PATH_PREFIX, buildSessionApiRoot } from '../shared/admin_protocol.ts';
import {
  type ChatRecord,
  type Session,
  type SessionStore,
  SessionValidationError,
} from './session_store.ts';

class AdminRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'AdminRequestError';
  }
}

type AdminRoute = (
  store: SessionStore,
  request: Request,
  params: Record<string, string | undefined>,
) => Promise<Response> | Response;

const adminRoutes: ReadonlyArray<{ method: string; pattern: URLPattern; handle: AdminRoute }> = [
  { method: 'POST', pattern: adminPattern('/sessions'), handle: createSession },
  { method: 'DELETE', pattern: adminPattern('/sessions/:sessionId'), handle: deleteSession },
  { method: 'POST', pattern: adminPattern('/sessions/:sessionId/bots'), handle: createBot },
  { method: 'POST', pattern: adminPattern('/sessions/:sessionId/users'), handle: createUser },
  { method: 'POST', pattern: adminPattern('/sessions/:sessionId/chats'), handle: createChat },
  {
    method: 'GET',
    pattern: adminPattern('/sessions/:sessionId/chats/:chatId/messages'),
    handle: listMessages,
  },
];

function adminPattern(pathname: string): URLPattern {
  return new URLPattern({ pathname: `${ADMIN_PATH_PREFIX}${pathname}` });
}

export async function handleAdminRequest(store: SessionStore, request: Request): Promise<Response> {
  try {
    for (const route of adminRoutes) {
      const match = route.pattern.exec(request.url);
      if (match === null) continue;
      if (route.method !== request.method) {
        throw new AdminRequestError(
          405,
          `${request.method} is not allowed on ${match.pathname.input}`,
        );
      }
      return await route.handle(store, request, match.pathname.groups);
    }
    throw new AdminRequestError(404, `no admin route matches ${new URL(request.url).pathname}`);
  } catch (error) {
    if (error instanceof AdminRequestError) return errorResponse(error.status, error.message);
    if (error instanceof SessionValidationError) return errorResponse(400, error.message);
    console.error('Unhandled error while serving admin request', error);
    return errorResponse(500, 'internal server error');
  }
}

function createSession(store: SessionStore, request: Request): Response {
  const session = store.create();
  const body: CreateSessionResponse = {
    sessionId: session.id,
    apiRoot: buildSessionApiRoot(new URL(request.url).origin, session.id),
  };
  return Response.json(body, { status: 201 });
}

function deleteSession(
  store: SessionStore,
  _request: Request,
  params: Record<string, string | undefined>,
): Response {
  requireSession(store, params.sessionId);
  store.delete(params.sessionId ?? '');
  return new Response(null, { status: 204 });
}

async function createBot(
  store: SessionStore,
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const session = requireSession(store, params.sessionId);
  const body = await readJsonObject(request);
  const definition: CreateBotRequest = {
    username: requireString(body, 'username'),
    first_name: requireString(body, 'first_name'),
  };
  const bot = session.createBot(definition);
  const response: CreateBotResponse = { token: bot.token, user: bot.user };
  return Response.json(response, { status: 201 });
}

async function createUser(
  store: SessionStore,
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const session = requireSession(store, params.sessionId);
  const body = await readJsonObject(request);
  const definition: CreateUserRequest = {
    id: optionalInteger(body, 'id'),
    first_name: requireString(body, 'first_name'),
    last_name: optionalString(body, 'last_name'),
    username: optionalString(body, 'username'),
  };
  const response: CreateUserResponse = session.createUser(definition);
  return Response.json(response, { status: 201 });
}

async function createChat(
  store: SessionStore,
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  const session = requireSession(store, params.sessionId);
  const body = await readJsonObject(request);
  const type = requireString(body, 'type');
  if (type !== 'private') {
    throw new AdminRequestError(400, `chat type '${type}' is not supported; only 'private' is`);
  }
  const definition: CreateChatRequest = {
    type,
    user_id: requireInteger(body, 'user_id'),
    member_ids: requireIntegerArray(body, 'member_ids'),
  };
  const chat = session.createPrivateChat({
    userId: definition.user_id,
    memberIds: definition.member_ids,
  });
  return Response.json(toChatResponse(chat), { status: 201 });
}

function listMessages(
  store: SessionStore,
  request: Request,
  params: Record<string, string | undefined>,
): Response {
  const session = requireSession(store, params.sessionId);
  const chat = requireChat(session, params.chatId);
  const fromIdParam = new URL(request.url).searchParams.get('from_id');
  let messages = chat.messages;
  if (fromIdParam !== null) {
    const fromId = Number(fromIdParam);
    if (!Number.isSafeInteger(fromId)) {
      throw new AdminRequestError(400, `from_id must be an integer, got '${fromIdParam}'`);
    }
    messages = messages.filter((message) => message.from?.id === fromId);
  }
  const response: ListMessagesResponse = messages;
  return Response.json(response);
}

function toChatResponse(record: ChatRecord): ChatResponse {
  return { chat: record.chat, member_ids: [...record.memberIds] };
}

function errorResponse(status: number, error: string): Response {
  const body: AdminErrorResponse = { error };
  return Response.json(body, { status });
}

function requireSession(store: SessionStore, sessionId: string | undefined): Session {
  const session = sessionId === undefined ? undefined : store.get(sessionId);
  if (session === undefined) {
    throw new AdminRequestError(404, `session '${sessionId}' does not exist`);
  }
  return session;
}

function requireChat(session: Session, chatIdParam: string | undefined): ChatRecord {
  const chatId = Number(chatIdParam);
  const chat = Number.isSafeInteger(chatId) ? session.chats.get(chatId) : undefined;
  if (chat === undefined) throw new AdminRequestError(404, `chat '${chatIdParam}' does not exist`);
  return chat;
}

type JsonObject = Record<string, unknown>;

async function readJsonObject(request: Request): Promise<JsonObject> {
  const body: unknown = await request.json().catch(() => {
    throw new AdminRequestError(400, 'request body must be valid JSON');
  });
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AdminRequestError(400, 'request body must be a JSON object');
  }
  return body as JsonObject;
}

function requireString(body: JsonObject, field: string): string {
  const value = optionalString(body, field);
  if (value === undefined) throw new AdminRequestError(400, `'${field}' is required`);
  return value;
}

function optionalString(body: JsonObject, field: string): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdminRequestError(400, `'${field}' must be a non-empty string`);
  }
  return value;
}

function requireInteger(body: JsonObject, field: string): number {
  const value = optionalInteger(body, field);
  if (value === undefined) throw new AdminRequestError(400, `'${field}' is required`);
  return value;
}

function optionalInteger(body: JsonObject, field: string): number | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value)) {
    throw new AdminRequestError(400, `'${field}' must be an integer`);
  }
  return value as number;
}

function requireIntegerArray(body: JsonObject, field: string): number[] {
  const value = body[field];
  if (!Array.isArray(value) || !value.every((item) => Number.isSafeInteger(item))) {
    throw new AdminRequestError(400, `'${field}' must be an array of integers`);
  }
  return value as number[];
}
