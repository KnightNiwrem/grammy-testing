/**
 * Standalone entry point of the Telegram Bot API emulation server.
 * Listens on `PORT` (default 8081) and serves the admin API and every session's emulated Bot API.
 */
import { createEmulationServerHandler } from './server/handler.ts';

const DEFAULT_PORT = 8081;

const port = readPort(Deno.env.get('PORT'));
Deno.serve({ port }, createEmulationServerHandler());

function readPort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got '${value}'`);
  }
  return port;
}
