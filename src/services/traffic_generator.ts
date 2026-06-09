import { BatchId, Bee, BeeRequestOptions, Duration, Size } from '@ethersphere/bee-js';
import { BEE_NODES } from './../config';

const REQUEST_OPTIONS: BeeRequestOptions = { timeout: 30_000 };
const TRAFFIC_TIMEOUT_MS = 10 * 60_000; // 10 minutes
const PEER_WAIT_TIMEOUT_MS = 2 * 60_000; // 2 minutes

export async function generateTraffic(): Promise<void> {
  const work = async () => {
    const uploaderBee = new Bee(`http://localhost:${BEE_NODES[1].apiPort}`);
    const chequeMonitorBee = new Bee(`http://localhost:${BEE_NODES[2].apiPort}`);

    await waitForSpecificPeer(BEE_NODES[1].apiPort, BEE_NODES[2].apiPort, PEER_WAIT_TIMEOUT_MS);

    const batchId = await uploaderBee.buyStorage(Size.fromGigabytes(1), Duration.fromWeeks(2), undefined, REQUEST_OPTIONS);

    while (true) {
      const claimableChequeCount = await getClaimableChequeNumber(chequeMonitorBee);
      if (claimableChequeCount >= 1) {
        break;
      }

      for (let i = 0; i < 1000; i++) {
        await uploadRandomData(uploaderBee, batchId);
      }
    }
  };

  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`generateTraffic timed out after ${TRAFFIC_TIMEOUT_MS / 1000}s — node 1 never issued a cheque to node 2`)), TRAFFIC_TIMEOUT_MS);
  });

  try {
    return await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function waitForSpecificPeer(uploaderPort: number, peerPort: number, timeoutMs: number): Promise<void> {
  const uploaderBee = new Bee(`http://localhost:${uploaderPort}`);
  const peerBee = new Bee(`http://localhost:${peerPort}`);

  const { overlay } = await peerBee.getNodeAddresses(REQUEST_OPTIONS);
  const overlayHex = overlay.toHex();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const peers = await uploaderBee.getPeers(REQUEST_OPTIONS);
    if (peers.some(p => p.address === overlayHex)) return;
    await new Promise(r => setTimeout(r, 2_000));
  }
  throw new Error(`node 1 did not connect to node 2 within ${timeoutMs / 1000}s`);
}

async function getClaimableChequeNumber(bee: Bee): Promise<number> {
  const { lastcheques } = await bee.getLastCheques(REQUEST_OPTIONS);
  let count = 0;

  for (const cheque of lastcheques) {
    if (cheque.lastreceived === null) {
      continue;
    }
    count++;
  }

  return count;
}

async function uploadRandomData(bee: Bee, batchId: BatchId): Promise<void> {
  await bee.uploadData(batchId, crypto.getRandomValues(new Uint8Array(4096)), undefined, REQUEST_OPTIONS);
}
