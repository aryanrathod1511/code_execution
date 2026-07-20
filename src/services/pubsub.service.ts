import { redisPublish, redisSubscribe } from '../core/redis.client';

export class PubSubService {
  /**
   * Channel name generator utilities
   */
  public static getInputChannel(clientId: string): string {
    return `sandbox:input:${clientId}`;
  }

  public static getOutputChannel(clientId: string): string {
    return `sandbox:output:${clientId}`;
  }

  public static getControlChannel(clientId: string): string {
    return `sandbox:control:${clientId}`;
  }

  public static getStatusChannel(clientId: string): string {
    return `sandbox:status:${clientId}`;
  }

  /**
   * Helper function to convert dynamic channel identifiers to their actual Redis channel string.
   */
  private static resolveChannelName(clientId: string, type: 'input' | 'output' | 'control' | 'status'): string {
    switch (type) {
      case 'input': return this.getInputChannel(clientId);
      case 'output': return this.getOutputChannel(clientId);
      case 'control': return this.getControlChannel(clientId);
      case 'status': return this.getStatusChannel(clientId);
    }
  }

  /**
   * Publishers
   */
  public static async publishOutput(clientId: string, data: string): Promise<number> {
    return redisPublish.publish(this.getOutputChannel(clientId), data);
  }

  public static async publishStatus(clientId: string, data: string): Promise<number> {
    return redisPublish.publish(this.getStatusChannel(clientId), data);
  }

  public static async publishControl(clientId: string, action: 'disconnect' | string): Promise<number> {
    return redisPublish.publish(this.getControlChannel(clientId), action);
  }

  public static async publishInput(clientId: string, input: string): Promise<number> {
    return redisPublish.publish(this.getInputChannel(clientId), input);
  }

  /**
   * Subscribers
   */
  public static async subscribe(
    clientId: string,
    channels: ('input' | 'output' | 'control' | 'status')[],
    handler: (channel: string, message: string) => void
  ): Promise<void> {
    const channelNames = channels.map((type) => this.resolveChannelName(clientId, type));
    redisSubscribe.on('message', handler);
    await redisSubscribe.subscribe(...channelNames);
  }

  public static async unsubscribe(
    clientId: string,
    channels: ('input' | 'output' | 'control' | 'status')[],
    handler: (channel: string, message: string) => void
  ): Promise<void> {
    const channelNames = channels.map((type) => this.resolveChannelName(clientId, type));
    redisSubscribe.off('message', handler);
    try {
      await redisSubscribe.unsubscribe(...channelNames);
    } catch (e) {
      // Ignore unsubscribe error (e.g. if already closed)
    }
  }
}
