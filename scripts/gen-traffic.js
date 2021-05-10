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

async function trafficGen(host = 'http://localhost:1633', seed = 500, bytes = 17000) {
  const randomBytes = randomByteArray(bytes, seed)
  const bee = new Bee(host)
  const ref = await bee.uploadData(randomBytes)
  console.log(`Generated ${bytes} bytes traffic, the random data's root reference: ${ref}`)

  axios.get(host)
}

/**
 * Ping the given address whether it exists or not
 * 
 * It checks basically with a simple GET request
 * the given EP returns 200 status code.
 * @param url Designed accept Bee API URL 
 */
async function checkEndpointExist(url) {
  try {
    res = await axios.get(url)

    return res.status === 200
  } catch(e) {
    return false
  }
}

/**
 * Generate traffic on Bee node through the given host
 * 
 * bee.sh compatible. Those ports will be checked that the `bee.sh` could bind.
 * @param host Host that has open port to the Bee API. Default: 'localhost'
 * @param secure whether the connection is HTTPS. Default: false
 * @param beeShPorts the traffic generation will try to 
 */ 
async function genTrafficOnOpenPorts(host = 'localhost', secure = false, beeShPorts = true) {
  const protocol = `http${secure ? 's' : ''}` 
  let port = 1633
  let url = `${protocol}://${host}:${port}`
  while(await checkEndpointExist(url)) {
    console.log(`Generate Swarm Chunk traffic on ${url}...`)
    await trafficGen(url, new Date().getTime())
    if(!beeShPorts) break
    //increment port number for the next loop
    port += 10000
    url = `${protocol}://${host}:${port}`
  }
}

genTrafficOnOpenPorts()
