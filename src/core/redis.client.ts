import Redis from 'ioredis';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined;

console.log(`[RedisClient] Connecting to Redis at ${redisHost}:${redisPort}`);

// Redis connection options
const connectionOptions: any = {
  host: redisHost,
  port: redisPort,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
};

// Automatically enable TLS for secure cloud hosting (e.g. Upstash) or if explicitly requested
if (redisHost.includes('upstash.io') || process.env.REDIS_TLS === 'true') {
  connectionOptions.tls = {
    rejectUnauthorized: false
  };
}

export const redisConnection = new Redis(connectionOptions);
export const redisPublish = new Redis(connectionOptions);
export const redisSubscribe = new Redis(connectionOptions);
