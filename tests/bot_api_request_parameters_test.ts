import {
  type BotApiRequestParametersDecoding,
  decodeBotApiRequestParameters,
} from '../src/api/sessions/bot_api/request_parameters.ts';

const METHOD_URL = 'http://emulator.example/bot123:token/getUpdates';

Deno.test('decodeBotApiRequestParameters reads the query string without a body', async () => {
  const decoding = await decodeBotApiRequestParameters(
    new Request(`${METHOD_URL}?offset=2&allowed_updates=%5B%22message%22%5D`),
  );

  assertDecodedParameters(decoding, { offset: '2', allowed_updates: '["message"]' });
});

Deno.test('decodeBotApiRequestParameters decodes every supported body encoding alike', async () => {
  const expectedParameters = { offset: '2', allowed_updates: '["message"]' };
  const multipartBody = new FormData();
  multipartBody.set('offset', '2');
  multipartBody.set('allowed_updates', '["message"]');

  const decodings = [
    await decodeBotApiRequestParameters(
      new Request(METHOD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset: 2, allowed_updates: ['message'] }),
      }),
    ),
    await decodeBotApiRequestParameters(
      new Request(METHOD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ offset: '2', allowed_updates: '["message"]' }),
      }),
    ),
    await decodeBotApiRequestParameters(
      new Request(METHOD_URL, {
        method: 'POST',
        body: new URLSearchParams(expectedParameters),
      }),
    ),
    await decodeBotApiRequestParameters(
      new Request(METHOD_URL, { method: 'POST', body: multipartBody }),
    ),
  ];

  for (const decoding of decodings) {
    assertDecodedParameters(decoding, expectedParameters);
  }
});

Deno.test('decodeBotApiRequestParameters prefers query-string parameters to body ones', async () => {
  const decoding = await decodeBotApiRequestParameters(
    new Request(`${METHOD_URL}?offset=5`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset: 2, limit: 1 }),
    }),
  );

  assertDecodedParameters(decoding, { offset: '5', limit: '1' });
});

Deno.test('decodeBotApiRequestParameters rejects bodies it cannot decode', async () => {
  const fileUploadBody = new FormData();
  fileUploadBody.set('document', new File(['content'], 'document.txt'));
  const undecodableRequests = [
    new Request(METHOD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    }),
    new Request(METHOD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '[2]',
    }),
    new Request(METHOD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'offset=2',
    }),
    new Request(METHOD_URL, { method: 'POST', body: fileUploadBody }),
  ];

  for (const request of undecodableRequests) {
    const decoding = await decodeBotApiRequestParameters(request);
    if (decoding.decoded || !decoding.description.startsWith('Bad Request: ')) {
      throw new Error(
        `Expected a ${request.headers.get('Content-Type')} body to be rejected as a bad request`,
      );
    }
  }
});

function assertDecodedParameters(
  decoding: BotApiRequestParametersDecoding,
  expectedParameters: Readonly<Record<string, string>>,
): void {
  if (!decoding.decoded) {
    throw new Error(`Expected parameters to decode, received "${decoding.description}"`);
  }
  if (JSON.stringify(decoding.parameters) !== JSON.stringify(expectedParameters)) {
    throw new Error(
      `Expected ${JSON.stringify(expectedParameters)}, received ${
        JSON.stringify(decoding.parameters)
      }`,
    );
  }
}
