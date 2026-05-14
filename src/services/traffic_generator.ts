import { BatchId, Bee, BZZ, Duration, Size } from '@ethersphere/bee-js';
import { BEE_NODES } from './../config';

const DEFAULT_CHEQUE_COUNT_TARGET = 10;

export async function generateTraffic(chequeCountTarget: number | undefined): Promise<void> {
  console.info('\nGenerating traffic...');
  const target = chequeCountTarget ?? DEFAULT_CHEQUE_COUNT_TARGET;
  const bee = new Bee(`http://localhost:${BEE_NODES[1].apiPort}`);

  console.info('\nBuying storage...');
  const batchId = await bee.buyStorage(Size.fromMegabytes(100), Duration.fromWeeks(2));

  await bee.depositBZZToChequebook(BZZ.fromDecimalString('10'));

  while (true) {
    const claimableChequeCount = await getClaimableChequeNumber(bee);
    if (claimableChequeCount >= target) {
      console.info(`Queen node has at least ${target} cheques, stopping traffic generation.`);
      break;
    }

    await uploadRandomData(bee, batchId);
    await bee.uploadData(batchId, crypto.getRandomValues(new Uint8Array(4096)));
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
  console.info('\nUpload random data...');
  await bee.uploadData(batchId, crypto.getRandomValues(new Uint8Array(4096)));
}
