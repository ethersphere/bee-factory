const { BeeDebug } = require('@ethersphere/bee-js')

// This is a small utility that connects to given node and retrieve its API versions
// It outputs them to STDOUT in Github Actions format

async function setApiVersions (node) {
  console.log('Getting API versions from node ', node)

  const debug = new BeeDebug(node)
  const versions = await debug.getHealth()

  console.log('API version: ', versions.apiVersion)
  console.log('Debug API version: ', versions.debugApiVersion)

  console.log('::set-output name=api-version::', versions.apiVersion)
  console.log('::set-output name=debug-api-version::', versions.debugApiVersion)
}

setApiVersions(process.argv[2]).catch(err => {
  console.error('There was an error: ', err)
  process.exit(1)
})
