const axios = require('axios').default;
const Bee = require('@ethersphere/bee-js').Bee;

const SLEEP_BETWEEN_UPLOADS_MS = 100
const POSTAGE_STAMPS_AMOUNT = BigInt(10000)
const POSTAGE_STAMPS_DEPTH = 20

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

async function trafficGen(bee, postageBatchId, seed = 500, bytes = 1024 * 4 * 400) {
  const randomBytes = randomByteArray(bytes, seed)
  const ref = await bee.uploadData(postageBatchId, randomBytes)
  console.log(`Generated ${bytes} bytes traffic, the random data's root reference: ${ref}`)
}

/**
 * Generate traffic on Bee node(s)
 * 
 * @param bees Array of Bee instances and postage batches where the random generated data will be sent to.
 */ 
async function genTrafficOnOpenPorts(bees) {
  const promises = bees.map(({bee, postageBatchId}) => {
    console.log(`Generate Swarm Chunk traffic on ${bee.url}...`)
    return trafficGen(bee, postageBatchId, new Date().getTime())
  })
  await Promise.all(promises)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function genTrafficLoop(hosts) {
  const promisses = hosts.map(async (host) => {
    const bee = new Bee(host)

    console.log(`Generating postage stamps on ${host}...`)
    const postageBatchId = await bee.createPostageBatch(POSTAGE_STAMPS_AMOUNT, POSTAGE_STAMPS_DEPTH)
    console.log(`Generated ${postageBatchId} postage stamp on ${host}...`)

    return {bee, postageBatchId}
  })

  const bees = await Promise.all(promisses)

  while(true) {
    await genTrafficOnOpenPorts(bees)
  
    await sleep(SLEEP_BETWEEN_UPLOADS_MS)
  }
}

const inputArray = process.argv.slice(2)
const hosts = inputArray.length > 0 ? inputArray : [ 'http://localhost:1633' ]
genTrafficLoop(hosts)
