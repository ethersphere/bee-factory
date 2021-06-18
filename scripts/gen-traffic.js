const axios = require('axios').default;
const { Bee, BeeDebug } = require('@ethersphere/bee-js');

const SLEEP_BETWEEN_UPLOADS_MS = 500
const POSTAGE_STAMPS_AMOUNT = '10000'
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

/**
 * 
 * Generates cheques on the given Bee API EP
 * 
 * The hosts parameter has to be assimetric in the API;DEBUG_API paired string
 * because on the API EP the data will be generated, so the cheques should be 
 * 
 * @param {string[]} hosts API;DEBUG_API URL strings of the target Bee (e.g. http://localhost:1633;http://localhost:1635)
 * @param {number} minCheques 
 */
async function genTrafficLoop(hosts, minCheques) {
  const promises = hosts.map(async (host) => {
    const [ beeApiUrl,  beeDebugApiUrl ] = host.split(';')
    const bee = new Bee(beeApiUrl)
    const beeDebug = new BeeDebug(beeDebugApiUrl)

    console.log(`Create postage stamp on ${beeApiUrl}...`)
    const postageBatchId = await bee.createPostageBatch(POSTAGE_STAMPS_AMOUNT, POSTAGE_STAMPS_DEPTH)
    console.log(`Generated ${postageBatchId} postage stamp on ${host}...`)

    return {bee, beeDebug, postageBatchId}
  })

  const bees = await Promise.all(promises)

  while(true) {
    await genTrafficOnOpenPorts(bees)
    
    if(!isNaN(minCheques)) {
      const beesUncashedCheques = []
      for(const bee of bees) {
        const beeDebug = bee.beeDebug
        const { lastcheques } = await beeDebug.getLastCheques()
        const incomingCheques = lastcheques.filter(cheque => !!cheque.lastreceived)

        const uncashedCheques = []
        const lastCashOutPromises = incomingCheques.map(({ peer }) => beeDebug.getLastCashoutAction(peer))
        const lastCashOuts = await Promise.all(lastCashOutPromises)
        for(const [index, lastCashOut] of lastCashOuts.entries()) {
          if(lastCashOut.uncashedAmount > 0) {
            uncashedCheques.push(incomingCheques[index])
          }
        }
        
        beesUncashedCheques.push(uncashedCheques)
      }

      if(beesUncashedCheques.every(uncashedCheques => uncashedCheques.length >= minCheques)) {
        console.log(`Generated at least ${minCheques} for every node on the given Debug API endpoints`,)
        break
      } else {
        console.log(`There is not enough uncashed cheques on Bee node(s)`, beesUncashedCheques.map(beeCheques => beeCheques.length))
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
if(hosts.length === 0) {
  hosts = [ 'http://localhost:1633;http://localhost:11635' ]
}

genTrafficLoop(hosts, minCheques)
