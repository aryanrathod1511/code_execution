import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Queue } from 'bullmq';
import { redisConnection } from '../core/redis.client';
import { LANGUAGES } from '../config/languages.config';
import { WebSocketPacket } from '../types';
import { randomUUID } from 'crypto';
import { PubSubService } from '../services/pubsub.service';

const sandboxQueue = new Queue('sandbox-queue', { connection: redisConnection });

export function handleInteractiveConnection(ws: WebSocket, req: IncomingMessage): void {
  const clientId = `client_${randomUUID()}`;
  let isInitialized = false;

  const messageHandler = (channel: string, message: string) => {
    const outputChannel = PubSubService.getOutputChannel(clientId);
    const statusChannel = PubSubService.getStatusChannel(clientId);

    if (channel === outputChannel) {
      ws.send(message);
    } else if (channel === statusChannel) {
      if (message === 'exit') {
        ws.close();
      } else {
        ws.send(message);
      }
    }
  };

  ws.on('message', async (message: Buffer) => {
    try {
      const text = message.toString();

      if (!isInitialized) {
        const data: WebSocketPacket = JSON.parse(text);
        if (data.type !== 'init') {
          ws.send('System Error: Expected initialization packet\r\n');
          return ws.close();
        }

        isInitialized = true;
        const { language, code } = data;
        const langConfig = LANGUAGES[language];

        if (!langConfig) {
          ws.send(JSON.stringify({ type: 'error', message: `Unsupported language: ${language}` }));
          return ws.close();
        }

        ws.send('System: Queueing execution task...\r\n');

        // Subscribe to client-specific output and status channels
        await PubSubService.subscribe(clientId, ['output', 'status'], messageHandler);

        // Queue the execution task
        await sandboxQueue.add('execute', {
          clientId,
          language,
          code
        }, {
          removeOnComplete: true,
          removeOnFail: true
        });

      } else {
        try {
          const parsed = JSON.parse(text);
          if (parsed.type === 'input') {
            await PubSubService.publishInput(clientId, parsed.input || '');
          }
        } catch {
          // Fallback to raw text if not valid JSON
          await PubSubService.publishInput(clientId, text);
        }
      }
    } catch (err: any) {
      console.error('[WebSocket] Message processing error:', err);
      ws.send(`\r\n[System Error]: Failed to handle message. Details: ${err.message}\r\n`);
      ws.close();
    }
  });

  // Clean up subscriptions and tell worker to stop execution container on socket close
  ws.on('close', async () => {
    try {
      await PubSubService.unsubscribe(clientId, ['output', 'status'], messageHandler);
      await PubSubService.publishControl(clientId, 'disconnect');
    } catch (err) {
      console.error('[WebSocket] Clean-up error:', err);
    }
  });
}
