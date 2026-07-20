import { Container } from 'dockerode';
import tar from 'tar-stream';
import { docker } from './docker.client';
import { LanguageConfig } from '../types';
import { hostConfig } from '../config/hostConfig';
import { PubSubService } from '../services/pubsub.service';

export class SandboxService {
  /**
   * Spawns an isolated sandbox container based on the language configuration.
   * Caps memory at 128MB, CPU allocation at 0.5 cores, disables networking, and auto-removes on stop.
   */
  public static async createContainer(config: LanguageConfig): Promise<Container> {
    const container = await docker.createContainer({
      Image: config.image,
      Cmd: ['tail', '-f', '/dev/null'], // Keep container running
      Tty: true,
      HostConfig: hostConfig,
    });

    await container.start();
    return container;
  }

  /**
   * Writes files into the container's '/tmp' directory by uploading a tar buffer.
   */
  public static async uploadFile(container: Container, content: string, filename: string): Promise<void> {
    const pack = tar.pack();
    pack.entry({ name: filename }, content);
    pack.finalize();

    await container.putArchive(pack, { path: '/tmp' });
    return;
  }

  /**
   * Runs a non-interactive command inside the container using TTY.
   * Enforces execution timeouts.
   */
  public static async runCommand(
    container: Container,
    cmdArray: string[],
    timeoutMs: number = 5000
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const exec = await container.exec({
      Cmd: cmdArray,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true
    });

    const stream = await exec.start({ hijack: true });

    let output = '';
    stream.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf-8');
    });

    return new Promise((resolve) => {
      let finished = false;

      const timeout = setTimeout(async () => {
        if (finished) return;
        finished = true;
        try {
          await container.stop({ t: 0 });
        } catch (e) {
          // Container might already be stopped/dead
        }
        resolve({
          exitCode: 124,
          stdout: output,
          stderr: `\n[Timeout Error]: Execution timed out after ${timeoutMs / 1000} seconds.`
        });
      }, timeoutMs);

      stream.on('end', () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);

        // Short sleep to ensure stream buffers are fully flushed before reading exit code
        setTimeout(async () => {
          try {
            const inspectData = await exec.inspect();
            resolve({
              exitCode: inspectData.ExitCode ?? -1,
              stdout: output,
              stderr: ''
            });
          } catch (err: any) {
            resolve({
              exitCode: -1,
              stdout: output,
              stderr: `\n[System Error]: Failed to inspect execution result. Details: ${err.message}`
            });
          }
        }, 50);
      });
    });
  }

  /**
   * Orchestrates the entire lifecycle of an interactive sandbox execution session.
   */
  public static async runInteractiveSession(
    clientId: string,
    config: LanguageConfig,
    code: string
  ): Promise<void> {
    let container: Container | null = null;
    let execStream: any = null;
    let finished = false;
    let executionTimeout: NodeJS.Timeout | null = null;

    const cleanup = async () => {
      if (finished) return;
      finished = true;

      console.log(`[SandboxService] Cleaning up resources for client: ${clientId}`);

      if (executionTimeout) {
        clearTimeout(executionTimeout);
      }

      // Stop listening to Redis input/control channels
      await PubSubService.unsubscribe(clientId, ['input', 'control'], inputHandler);

      // Stop container immediately
      if (container) {
        try {
          await container.stop({ t: 0 });
        } catch (e) {}
      }

      // Inform the Gateway to terminate the client connection
      try {
        await PubSubService.publishStatus(clientId, 'exit');
      } catch (e) {}
    };

    const inputHandler = (channel: string, message: string) => {
      const inputChannel = PubSubService.getInputChannel(clientId);
      const controlChannel = PubSubService.getControlChannel(clientId);

      if (channel === inputChannel) {
        if (execStream && execStream.writable) {
          execStream.write(message);
        }
      } else if (channel === controlChannel) {
        if (message === 'disconnect') {
          cleanup();
        }
      }
    };

    return new Promise<void>(async (resolve) => {
      try {
        // Setup input/control subscriptions
        await PubSubService.subscribe(clientId, ['input', 'control'], inputHandler);

        // 1. Create sandbox container
        await PubSubService.publishStatus(clientId, 'System: Initializing sandbox environment...\r\n');
        container = await SandboxService.createContainer(config);

        // 2. Upload source code
        await SandboxService.uploadFile(container, code, config.filename);

        // 3. Compile if necessary
        if (config.compileCmd) {
          await PubSubService.publishStatus(clientId, 'System: Compiling program...\r\n');
          const compileResult = await SandboxService.runCommand(container, config.compileCmd, 10000);

          if (compileResult.exitCode !== 0) {
            await PubSubService.publishOutput(
              clientId,
              `\r\nCompiler Error:\r\n${compileResult.stderr || compileResult.stdout}\r\n`
            );
            await cleanup();
            return resolve();
          }
        }

        await PubSubService.publishStatus(
          clientId,
          'System: Running executable in interactive terminal...\r\n\r\n'
        );

        // 4. Exec the run command with TTY enabled
        const exec = await container.exec({
          Cmd: config.runCmd,
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true
        });

        // 5. Start interactive execution with a safety runtime timeout
        const timeoutLimit = 30000; // 30 seconds limit
        executionTimeout = setTimeout(async () => {
          console.log(`[SandboxService] Execution timeout reached for client: ${clientId}`);
          try {
            await PubSubService.publishOutput(
              clientId,
              `\r\n[System Error]: Interactive execution timed out after ${timeoutLimit / 1000} seconds.\r\n`
            );
          } catch (e) {}
          await cleanup();
          resolve();
        }, timeoutLimit);

        execStream = await exec.start({ hijack: true, stdin: true });

        // Forward stdout/stderr from process straight back to Redis output channel
        execStream.on('data', async (chunk: Buffer) => {
          try {
            await PubSubService.publishOutput(clientId, chunk.toString('utf-8'));
          } catch (err) {
            console.error(`[SandboxService] Failed to publish stream output for ${clientId}:`, err);
          }
        });

        execStream.on('end', async () => {
          await cleanup();
          resolve();
        });

        execStream.on('error', async (err: Error) => {
          try {
            await PubSubService.publishOutput(clientId, `\r\n[Sandbox Error]: ${err.message}\r\n`);
          } catch (e) {}
          await cleanup();
          resolve();
        });

      } catch (err: any) {
        console.error(`[SandboxService] Error during execution pipeline for ${clientId}:`, err);
        try {
          await PubSubService.publishOutput(clientId, `\r\n[System Error]: Execution pipeline failed: ${err.message}\r\n`);
        } catch (e) {}
        await cleanup();
        resolve();
      }
    });
  }
}
