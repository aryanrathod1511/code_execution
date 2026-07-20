import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import cors from 'cors';
import url from 'url';

import { handleInteractiveConnection } from './controllers/interactive.socket';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
// (Interactive operations are handled via WebSocket upgrade requests on /interactive)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server without direct port binding (delegated upgrade)
const wss = new WebSocket.Server({ noServer: true });

// Listen for HTTP upgrade events
server.on('upgrade', (request, socket, head) => {
  const parsedUrl = url.parse(request.url || '', true);
  const pathname = parsedUrl.pathname;

  if (pathname === '/interactive') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Bind WebSocket connection listener
wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  handleInteractiveConnection(ws, req);
});

// Start listening
server.listen(port, () => {
  console.log(`[Server] Code Executor API running on port ${port}`);
});
