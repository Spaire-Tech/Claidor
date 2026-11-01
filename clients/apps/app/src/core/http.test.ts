// The real fetch client against a server on this machine: what a timeout, a
// closed door, a stream and a silent stream look like to the gateway.

import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FetchClient, NetworkError } from './http'

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
})
