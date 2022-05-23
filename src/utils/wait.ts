import fetch, { FetchError } from 'node-fetch'
import { sleep } from './index'
import { TimeoutError } from './error'
import { BeeDebug } from '@ethersphere/bee-js'
import { AllStatus } from './docker'

const AWAIT_SLEEP = 3_000

const BLOCKCHAIN_BODY_REQUEST = JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', id: 1 })
const EXPECTED_CHAIN_ID = '0xfb4'
const ALLOWED_ERRORS = ['ECONNREFUSED', 'ECONNRESET', 'UND_ERR_SOCKET']

function isAllowedError(e: FetchError): boolean {
  //@ts-ignore: Node 18 native fetch returns error where the underlying error is wrapped and placed in e.cause
  if (e.cause) {
    //@ts-ignore: Node 18 native fetch returns error where the underlying error is wrapped and placed in e.cause
    e = e.cause
  }

  if (e.code && ALLOWED_ERRORS.includes(e.code)) {
    return true
  }

  // Errors from Bee-js does not have the `FetchError` structure (eq. `code` property)
  // so we assert message itself.
  if (e.message.includes('socket hang up')) {
    return true
  }

  return ALLOWED_ERRORS.some(substring => e.message.includes(substring))
}

export async function waitForBlockchain(waitingIterations = 30): Promise<void> {
  for (let i = 0; i < waitingIterations; i++) {
    try {
      const request = await fetch('http://127.0.0.1:9545', {
        method: 'POST',
        body: BLOCKCHAIN_BODY_REQUEST,
        headers: { 'Content-Type': 'application/json' },
      })
      const response = (await request.json()) as { result: string }

      if (response.result === EXPECTED_CHAIN_ID) {
        return
      }
    } catch (e) {
      if (!isAllowedError(e as FetchError)) {
        throw e
      }
    }

    await sleep(AWAIT_SLEEP)
  }

  throw new TimeoutError('Waiting for blockchain container timed-out')
}

export async function waitForQueen(verifyQueenIsUp: () => Promise<boolean>, waitingIterations = 120): Promise<string> {
  const beeDebug = new BeeDebug('http://127.0.0.1:1635')

  for (let i = 0; i < waitingIterations; i++) {
    try {
      if (!(await verifyQueenIsUp())) {
        throw new Error('Queen node is not running!')
      }

      const addresses = await beeDebug.getNodeAddresses()

      if (addresses.underlay.length > 0) {
        const addr = addresses.underlay.find(addr => !addr.includes('127.0.0.1'))

        if (addr) {
          return addr
        }
      }
    } catch (e) {
      if (!isAllowedError(e as FetchError)) {
        throw e
      }
    }

    await sleep(AWAIT_SLEEP)
  }

  throw new TimeoutError('Waiting for queen container timed-out')
}

export async function waitForWorkers(
  workerCount: number,
  getStatus: () => Promise<AllStatus>,
  waitingIterations = 120,
): Promise<void> {
  const beeDebug = new BeeDebug('http://127.0.0.1:1635')

  const status = await getStatus()
  for (let i = 1; i <= workerCount; i++) {
    if (status[`worker${i}` as keyof AllStatus] !== 'running') {
      throw new Error('Some of the workers node is not running!')
    }
  }

  for (let i = 0; i < waitingIterations; i++) {
    try {
      const peers = await beeDebug.getPeers()

      if (peers.length >= workerCount) {
        return
      }
    } catch (e) {
      if (!isAllowedError(e as FetchError)) {
        throw e
      }
    }

    await sleep(AWAIT_SLEEP)
  }

  throw new TimeoutError('Waiting for worker nodes timed-out')
}
