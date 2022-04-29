import Dockerode from 'dockerode'
import { ENV_ENV_PREFIX_KEY } from '../../src/command/start'
import { BatchId, BeeDebug } from '@ethersphere/bee-js'

export async function findContainer(docker: Dockerode, name: string): Promise<Dockerode.ContainerInspectInfo> {
  return docker.getContainer(`${process.env[ENV_ENV_PREFIX_KEY]}-${name}`).inspect()
}

export async function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(() => resolve(), ms))
}

export async function waitForUsablePostageStamp(beeDebug: BeeDebug, id: BatchId, timeout = 120_000): Promise<void> {
  const TIME_STEP = 1500
  for (let time = 0; time < timeout; time += TIME_STEP) {
    const stamp = await beeDebug.getPostageBatch(id)

    if (stamp.usable) {
      return
    }

    await sleep(TIME_STEP)
  }

  throw new Error('Timeout on waiting for postage stamp to become usable')
}
