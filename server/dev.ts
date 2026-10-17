import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createApiHandler } from './api.ts';
import { createFileStorage } from './storage.ts';

const handler = createApiHandler({
  storage: createFileStorage('.local/data'),
  development: true,
  password: process.env.DASHBOARD_PASSWORD || 'viagem-local',
});

const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host || 'localhost:8787';
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((entry) => headers.append(key, entry));
      else if (value !== undefined) headers.set(key, value);
    }
    const method = req.method || 'GET';
    const request = new Request(`http://${host}${req.url || '/'}`, {
      method,
      headers,
      ...(method !== 'GET' && method !== 'HEAD' ? { body: Readable.toWeb(req) as ReadableStream, duplex: 'half' } : {}),
    } as RequestInit);
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Não foi possível processar a solicitação local.' }));
  }
});
server.listen(8787, '127.0.0.1', () => console.log('API local iniciada na porta 8787.'));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
