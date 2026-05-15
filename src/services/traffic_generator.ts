import { BatchId, Bee, Duration, Size } from '@ethersphere/bee-js';
import { BEE_NODES } from './../config';


export async function generateTraffic(): Promise<void> {
  const uploaderBee = new Bee(`http://localhost:${BEE_NODES[1].apiPort}`);
  const chequeMonitorBee = new Bee(`http://localhost:${BEE_NODES[2].apiPort}`);

  const batchId = await uploaderBee.buyStorage(Size.fromGigabytes(1), Duration.fromWeeks(2));

  while (true) {
    const claimableChequeCount = await getClaimableChequeNumber(chequeMonitorBee);
    if (claimableChequeCount >= 1) {
      break;
    }

    for (let i = 0; i < 1000; i++) {
      await uploadRandomData(uploaderBee, batchId);
    }
  }
}

async function getClaimableChequeNumber(bee: Bee): Promise<number> {
  const { lastcheques } = await bee.getLastCheques()
  let count = 0;

  for (const cheque of lastcheques) {
    if (cheque.lastreceived === null) {
      continue
    }
    count++
  }

  return count
}

async function uploadRandomData(bee: Bee, batchId: BatchId): Promise<void> {
  await bee.uploadData(batchId, crypto.getRandomValues(new Uint8Array(4096)));
}
