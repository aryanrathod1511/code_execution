import Docker from 'dockerode';

const isWin = process.platform === 'win32';
const socketPath = isWin ? '//./pipe/docker_engine' : '/var/run/docker.sock';

console.log(`[DockerClient] Initializing connection via ${isWin ? 'Windows Named Pipe' : 'Unix Socket'}: ${socketPath}`);

export const docker = new Docker({ socketPath });
