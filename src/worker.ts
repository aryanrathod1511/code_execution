import { Worker } from 'bullmq';
import { redisConnection } from './core/redis.client';
import { SandboxService } from './core/sandbox.service';
import { LANGUAGES } from './config/languages.config';
import { PubSubService } from './services/pubsub.service';

console.log('[Worker] Starting background execution worker...');

const worker = new Worker(
  'sandbox-queue',
  async (job) => {
    const { clientId, language, code } = job.data;
    console.log(`[Worker] Processing execution job for client: ${clientId}, language: ${language}`);

    const langConfig = LANGUAGES[language];
    if (!langConfig) {
      const errorMsg = `System Error: Unsupported language: ${language}`;
      await PubSubService.publishStatus(clientId, errorMsg);
      await PubSubService.publishStatus(clientId, 'exit');
      return;
    }

    // Delegate the execution pipeline to the SandboxService
    await SandboxService.runInteractiveSession(clientId, langConfig, code);
  },
  {
    connection: redisConnection,
    concurrency: Number(process.env.CONCURRENCY),
  }
);

worker.on('error', (err) => {
  console.error('[Worker] Global worker error:', err);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed with error:`, err);
});
