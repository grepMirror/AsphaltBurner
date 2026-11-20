import http from 'node:http'
import { garmin } from './connectors/garmin.js'

// ponytail: one host proxy per connector, registered below.
// A new connector is a file in connectors/ plus one line in this list.
// MCP, or a store for sessions, is a new route module when it exists. Nothing here persists.

const connectors = [garmin]
const byName = new Map(connectors.map((connector) => [connector.name, connector]))
const port = Number(process.env.PORT || 3011)

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { ...CORS, 'content-type': type })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', 'http://localhost')
  if (req.method === 'GET' && url.pathname === '/health') {
    send(res, 200, JSON.stringify({ ok: true, connectors: connectors.map((connector) => connector.name) }))
    return
  }

  const match = url.pathname.match(/^\/connectors\/([^/]+)(\/.*)?$/)
  const connector = match ? byName.get(match[1]) : undefined
  if (!connector) {
    send(res, 404, JSON.stringify({ error: 'Unknown connector' }))
    return
  }

  const headers = {}
  if (req.headers.authorization) headers.authorization = req.headers.authorization
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks)

  try {
    const upstream = await fetch(connector.host + (match[2] || '/') + url.search, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' || body.length === 0 ? undefined : body,
    })
    const bytes = Buffer.from(await upstream.arrayBuffer())
    res.writeHead(upstream.status, {
      ...CORS,
      'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
    })
    res.end(bytes)
  } catch {
    send(res, 502, JSON.stringify({ error: 'Connector upstream failed' }))
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`backend listening on ${port} (${connectors.map((connector) => connector.name).join(', ')})`)
})
