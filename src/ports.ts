import net from 'net';

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
  });
}

// Catches loopback-only listeners that a wildcard bind with SO_REUSEADDR can miss on macOS.
function hasListener(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(1_000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function isPortBusy(port: number): Promise<boolean> {
  return (await hasListener(port)) || !(await canListen(port));
}

export async function assertPortsFree(ports: number[]): Promise<void> {
  const busy = (await Promise.all(ports.map(async (port) => ((await isPortBusy(port)) ? port : null))))
    .filter((port): port is number => port !== null);

  if (busy.length > 0) {
    throw new Error(
      `Host port(s) already in use: ${busy.join(', ')}. ` +
      'Stop whatever is using them, or shift all ports with --port-offset (or BEE_FACTORY_PORT_OFFSET).'
    );
  }
}
