// The real fetch client against a server on this machine: what a timeout, a
// closed door, a stream and a silent stream look like to the gateway.

import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  FetchClient,
  type HTTPRequest,
  NetworkError,
  edgeEncoded,
  edgeFirewall,
  edgeRefused,
  sendPastEdge,
} from './http'
import { recentActivity } from './recentActivity'

let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/answer') {
      response.writeHead(201, {
        'x-automation-failure-hint': 'SAND_BOX_BLOCKED',
      })
      response.end(`${request.method} ${request.headers['x-test'] ?? ''}`)
    } else if (request.url === '/slow') {
      setTimeout(() => response.end('late'), 1_000)
    } else if (request.url === '/events') {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write('data: one\n\n')
      setTimeout(() => response.end('data: two\n\n'), 50)
    } else if (request.url === '/silent') {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write('data: one\n\n')
    } else if (request.url === '/edge') {
      // A stand-in for Render's edge in front of the server: words that look like an attack get its HTML page;
      // a body in base64 passes, and the server reads it as written (`EncodedBodyMiddleware`).
      let body = ''
      request.on('data', (chunk) => {
        body += chunk
      })
      request.on('end', () => {
        if (request.headers['x-simeon-body'] !== 'base64') {
          if (body.includes('python3')) {
            response.writeHead(403, {
              'content-type': 'text/html; charset=utf-8',
            })
            response.end('<!DOCTYPE html><title>Blocked</title>')
          } else {
            response.writeHead(200, { 'content-type': 'application/json' })
            response.end(JSON.stringify({ read: body, encoded: false }))
          }
          return
        }
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(
          JSON.stringify({
            read: Buffer.from(body, 'base64').toString('utf8'),
            encoded: true,
            type: request.headers['x-simeon-content-type'],
            sentAs: request.headers['content-type'],
            authorization: request.headers.authorization,
          }),
        )
      })
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.closeAllConnections()
  server.close()
})

async function text(chunks: AsyncIterable<Uint8Array>): Promise<string> {
  let out = ''
  const decoder = new TextDecoder()
  for await (const chunk of chunks) out += decoder.decode(chunk)
  return out
}

describe('FetchClient', () => {
  const client = new FetchClient()

  it('reads a whole answer with its headers', async () => {
    const answer = await client.send({
      url: `${base}/answer`,
      method: 'POST',
      headers: { 'x-test': 'yes' },
      body: '{}',
    })
    expect(answer.status).toBe(201)
    expect(answer.text).toBe('POST yes')
    expect(answer.headers['x-automation-failure-hint']).toBe('SAND_BOX_BLOCKED')
  })

  it('says a call that took too long timed out', async () => {
    await expect(
      client.send({
        url: `${base}/slow`,
        method: 'GET',
        headers: {},
        timeoutSeconds: 0.1,
      }),
    ).rejects.toMatchObject({ kind: 'timedOut' })
  })

  it('says a closed door was unreachable', async () => {
    const closed = createServer()
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve))
    const port = (closed.address() as AddressInfo).port
    await new Promise((resolve) => closed.close(resolve))
    const error = await client
      .send({ url: `http://127.0.0.1:${port}/`, method: 'GET', headers: {} })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NetworkError)
    expect((error as NetworkError).kind).toBe('unreachable')
  })

  it('says a call ended here was cancelled', async () => {
    const ended = new AbortController()
    const call = client.send(
      { url: `${base}/slow`, method: 'GET', headers: {} },
      ended.signal,
    )
    ended.abort()
    await expect(call).rejects.toMatchObject({ kind: 'cancelled' })
  })

  it('reads a stream as it is written', async () => {
    const stream = await client.stream({
      url: `${base}/events`,
      method: 'GET',
      headers: {},
    })
    expect(stream.status).toBe(200)
    expect(await text(stream.body)).toBe('data: one\n\ndata: two\n\n')
  })

  it('ends a stream silent for too long', async () => {
    const stream = await client.stream({
      url: `${base}/silent`,
      method: 'GET',
      headers: {},
      timeoutSeconds: 0.2,
    })
    await expect(text(stream.body)).rejects.toMatchObject({ kind: 'timedOut' })
  })

  // 12 November 2026: a long message with commands in it said "Failed to send" on every resend.
  it('sends a body the edge refused once more in base64, read as it was written', async () => {
    const message = JSON.stringify({
      agentId: 'theo',
      text: "umask 077; APP=$(python3 -c \"import json;print(json.load(open('s.json'))['appId'])\") ✓",
    })
    const answer = await client.send({
      url: `${base}/edge`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer gw',
      },
      body: message,
    })
    expect(answer.status).toBe(200)
    expect(JSON.parse(answer.text)).toEqual({
      read: message,
      encoded: true,
      type: 'application/json',
      sentAs: 'text/plain',
      authorization: 'Bearer gw',
    })
    expect(
      recentActivity().some((line) =>
        line.endsWith(
          'edge refused POST /edge: sent again in base64, answered 200',
        ),
      ),
    ).toBe(true)
  })

  it('sends a body the edge lets through once, as it is', async () => {
    const answer = await client.send({
      url: `${base}/edge`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"text":"hello"}',
    })
    expect(JSON.parse(answer.text)).toEqual({
      read: '{"text":"hello"}',
      encoded: false,
    })
  })

  it('encodes nothing without a body, past the limit, or twice', () => {
    expect(
      edgeEncoded({ url: '/x', method: 'GET', headers: {} }),
    ).toBeUndefined()
    expect(
      edgeEncoded({
        url: '/x',
        method: 'POST',
        headers: {},
        body: new Uint8Array(edgeFirewall.largestResent + 1),
      }),
    ).toBeUndefined()
    const once = edgeEncoded({
      url: '/x',
      method: 'POST',
      headers: {},
      body: '{}',
    })
    expect(once?.headers).toMatchObject({
      'x-simeon-body': 'base64',
      'x-simeon-content-type': 'application/json',
      'content-type': 'text/plain',
    })
    expect(once && edgeEncoded(once)).toBeUndefined()
  })

  // In a browser the edge's page may lack the headers that let the window read it: fetch only fails.
  it('sends a body that could not reach the server once more in base64, and only a body', async () => {
    const sent: HTTPRequest[] = []
    const answer = await sendPastEdge(
      {
        url: 'https://api.test/x',
        method: 'POST',
        headers: {},
        body: '{"a":1}',
      },
      async (request) => {
        sent.push(request)
        if (sent.length === 1)
          throw new NetworkError('Failed to fetch', 'unreachable')
        return { status: 200, headers: {}, text: '{}' }
      },
    )
    expect(answer.status).toBe(200)
    expect(sent[1]?.headers['x-simeon-body']).toBe('base64')
    expect(atob(String(sent[1]?.body))).toBe('{"a":1}')

    const reads: HTTPRequest[] = []
    await expect(
      sendPastEdge(
        { url: 'https://api.test/x', method: 'GET', headers: {} },
        async (request) => {
          reads.push(request)
          throw new NetworkError('Failed to fetch', 'unreachable')
        },
      ),
    ).rejects.toMatchObject({ kind: 'unreachable' })
    expect(reads).toHaveLength(1)

    const timedOut: HTTPRequest[] = []
    await expect(
      sendPastEdge(
        { url: 'https://api.test/x', method: 'POST', headers: {}, body: '{}' },
        async (request) => {
          timedOut.push(request)
          throw new NetworkError('The request timed out.', 'timedOut')
        },
      ),
    ).rejects.toMatchObject({ kind: 'timedOut' })
    expect(timedOut).toHaveLength(1)
  })

  it('knows the edge’s page by its type or its first words, never a JSON refusal', () => {
    expect(
      edgeRefused({ status: 403, headers: { 'Content-Type': 'text/html' } }),
    ).toBe(true)
    expect(
      edgeRefused({
        status: 403,
        headers: {},
        text: '  <!DOCTYPE html><title>Blocked</title>',
      }),
    ).toBe(true)
    expect(
      edgeRefused({
        status: 403,
        headers: { 'content-type': 'application/json' },
        text: '{"error":"no"}',
      }),
    ).toBe(false)
    expect(
      edgeRefused({ status: 502, headers: { 'content-type': 'text/html' } }),
    ).toBe(false)
  })
})
