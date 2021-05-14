const axios = require('axios').default;
const Bee = require('@ethersphere/bee-js').Bee;

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

async function trafficGen(host = 'http://localhost:1633', seed = 500, bytes = 1024 * 4 * 400) {
  const randomBytes = randomByteArray(bytes, seed)
  const bee = new Bee(host)
  const ref = await bee.uploadData(randomBytes)
  console.log(`Generated ${bytes} bytes traffic, the random data's root reference: ${ref}`)
}

/**
 * Generate traffic on Bee node(s)
 * 
 * @param beeApiUrls Bee API URLs where the random generated data will be sent to.
 */ 
async function genTrafficOnOpenPorts(beeApiUrls) {
  for(const url of beeApiUrls) {
    console.log(`Generate Swarm Chunk traffic on ${url}...`)
    await trafficGen(url, new Date().getTime())
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function genTrafficLoop(hosts) {
  while(true) {
    const sleepMs = 1000

    genTrafficOnOpenPorts(hosts)
  
    await sleep(sleepMs)
  }
}

const inputArray = process.argv.slice(2)
const hosts = inputArray.length > 0 ? inputArray : [ 'http://localhost:1633' ]
genTrafficLoop(hosts)
