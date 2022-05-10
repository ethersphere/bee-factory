const { Bee, BeeDebug } = require('@ethersphere/bee-js')

class BeePair {
  /**
   * @param {BeeDebug} chequeReceiverBeeDebug
   * @param {Bee} uploaderBee
   * @param {BeeDebug} uploaderBeeDebug
   * @param {string} uploaderStamp
   */
  constructor(chequeReceiverBeeDebug, uploaderBee, uploaderBeeDebug, uploaderStamp) {
    this.chequeReceiverBeeDebug = chequeReceiverBeeDebug
    this.uploaderBee = uploaderBee
    this.uploaderBeeDebug = uploaderBeeDebug
    this.uploaderStamp = uploaderStamp
  }
}

const SLEEP_BETWEEN_UPLOADS_MS = 1000
const POSTAGE_STAMPS_AMOUNT = '10000'
const POSTAGE_STAMPS_DEPTH = 32

/**
 * Lehmer random number generator with seed (minstd_rand in C++11)
 * !!! Very fast but not well distributed pseudo-random function !!!
 *
 * @param seed Seed for the pseudo-random generator
 */
function lrng(seed) {
  return () => ((2 ** 31 - 1) & (seed = Math.imul(48271, seed))) / 2 ** 31
}

/**
 * Utility function for generating random Buffer
 * !!! IT IS NOT CRYPTO SAFE !!!
 * For that use `crypto.randomBytes()`
 *
 * @param length Number of bytes to generate
 * @param seed Seed for the pseudo-random generator
 */
function randomByteArray(length, seed = 500) {
  const rand = lrng(seed)
  const buf = new Uint8Array(length)

  for (let i = 0; i < length; ++i) {
    buf[i] = (rand() * 0xff) << 0
  }

  return buf
}

/**
 * @param {BeePair} beePair
 */
async function uploadRandomBytes(beePair, seed = 500, bytes = 1024 * 4 * 400) {
  const randomBytes = randomByteArray(bytes, seed)
  const reference = await beePair.uploaderBee.uploadData(beePair.uploaderStamp, randomBytes)
  console.log(`${beePair.uploaderBee.url} uploaded ${bytes} bytes to ${reference}`)
}

const DEFAULT_POLLING_FREQUENCY = 1_000
const DEFAULT_STAMP_USABLE_TIMEOUT = 120_000
async function waitUntilStampUsable(batchId, beeDebug, options = {}) {
  const timeout = options?.timeout || DEFAULT_STAMP_USABLE_TIMEOUT
  const pollingFrequency = options?.pollingFrequency || DEFAULT_POLLING_FREQUENCY

  for (let i = 0; i < timeout; i += pollingFrequency) {
    const stamp = await beeDebug.getPostageBatch(batchId)

    if (stamp.usable) return stamp
    await sleep(pollingFrequency)
  }

  throw new Error('Wait until stamp usable timeout has been reached')
}

/**
 * Generate traffic on Bee node(s)
 *
 * @param {BeePair[]} beePairs
 */
async function genTrafficOnOpenPorts(beePairs) {
  const promises = beePairs.map(beePair => {
    return uploadRandomBytes(beePair, Date.now())
  })
  await Promise.all(promises)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 *
 * Generates cheques on the given Bee API EP
 *
 * The hosts parameter has to be assimetric in the API;DEBUG_API paired string
 * because on the API EP the data will be generated, so the cheques should be
 *
 * @param {string[]} hosts API;DEBUG_API URL strings of the target Bee (e.g. http://localhost:1635;http://localhost:11633;http://localhost:11635)
 * @param {number} minCheques
 */
async function genTrafficLoop(hosts, minCheques) {
  const promises = hosts.map(async host => {
    const [chequeReceiverBeeDebugUrl, uploaderBeeUrl, uploaderBeeDebugUrl] = host.split(';')
    const chequeReceiverBeeDebug = new BeeDebug(chequeReceiverBeeDebugUrl)
    const uploaderBee = new Bee(uploaderBeeUrl)
    const uploaderBeeDebug = new BeeDebug(uploaderBeeDebugUrl)

    console.log(`Creating postage stamp on ${uploaderBeeDebugUrl}...`)
    const postageBatchId = await uploaderBeeDebug.createPostageBatch(POSTAGE_STAMPS_AMOUNT, POSTAGE_STAMPS_DEPTH)
    console.log(`Generated ${postageBatchId} postage stamp on ${uploaderBeeDebugUrl}. Waiting until it is usable.`)

    await waitUntilStampUsable(postageBatchId, uploaderBeeDebug)
    console.log('Postage stamp usable.')

    return new BeePair(chequeReceiverBeeDebug, uploaderBee, uploaderBeeDebug, postageBatchId)
  })

  const bees = await Promise.all(promises)

  while (true) {
    await genTrafficOnOpenPorts(bees)

    if (!isNaN(minCheques)) {
      const beesUncashedCheques = []
      for (const beePair of bees) {
        const { chequeReceiverBeeDebug } = beePair
        const { lastcheques } = await chequeReceiverBeeDebug.getLastCheques()
        const incomingCheques = lastcheques.filter(cheque => !!cheque.lastreceived)

        const uncashedCheques = []
        const lastCashOutPromises = incomingCheques.map(({ peer }) => chequeReceiverBeeDebug.getLastCashoutAction(peer))
        const lastCashOuts = await Promise.all(lastCashOutPromises)
        for (const [index, lastCashOut] of lastCashOuts.entries()) {
          if (BigInt(lastCashOut.uncashedAmount) > 0) {
            uncashedCheques.push(incomingCheques[index])
          }
        }

        beesUncashedCheques.push(uncashedCheques)
      }
      if (beesUncashedCheques.every(uncashedCheques => uncashedCheques.length >= minCheques)) {
        console.log(`Generated at least ${minCheques} for every node on the given Debug API endpoints`)
        process.exit()
      } else {
        console.log(
          `There is not enough uncashed cheques on Bee node(s)`,
          beesUncashedCheques.map(beeCheques => beeCheques.length),
        )
      }
    }

    await sleep(SLEEP_BETWEEN_UPLOADS_MS)
  }
}

let inputArray = process.argv.slice(2)
// if there is no related input to the minimum required cheques count,
// then the traffic generation will go infinitely
let minCheques = parseInt(inputArray[0])
let hosts = inputArray.slice(1)
if (hosts.length === 0) {
  hosts = ['http://localhost:1635;http://localhost:11633;http://localhost:11635']
}

genTrafficLoop(hosts, minCheques)
