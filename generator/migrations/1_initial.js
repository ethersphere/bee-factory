const ERC20PresetMinterPauser = artifacts.require('ERC20PresetMinterPauser')
const FS = require('fs')
const Path = require('path')

const NETWORK_ID = 4020

function prefixedAddressParamToByteCode(address) {
  // the first 2 chars removal removes 0x prefix
  return address.substring(2).toLowerCase().padStart(64, '0')
}

function intToByteCode(intParam) {
  return Number(intParam).toString(16).padStart(64, '0')
}

function getSimpleSwapFactoryBin(tokenAddress) {
  const binPath = Path.join(__dirname, '..', 'contracts', 'SimpleSwapFactory.bytecode')
  const bin = FS.readFileSync(binPath, 'utf8').toString().trim()
  tokenAddress = prefixedAddressParamToByteCode(tokenAddress)
  //add tokenaddress for param to the end of the bytecode
  return bin + tokenAddress
}

function getPostageStampBin(tokenAddress) {
  const binPath = Path.join(__dirname, '..', 'contracts', 'PostageStamp.bytecode')
  const bin = FS.readFileSync(binPath, 'utf8').toString().trim()
  tokenAddress = prefixedAddressParamToByteCode(tokenAddress)
  //add tokenaddress for param to the end of the bytecode
  return bin + tokenAddress
}

function getPriceOracleBin(price, chequeValueDeduction) {
  const binPath = Path.join(__dirname, '..', 'contracts', 'PriceOracle.bytecode')
  const bin = FS.readFileSync(binPath, 'utf8').toString().trim()
  const priceAbi = intToByteCode(price)
  const chequeValueAbi = intToByteCode(chequeValueDeduction)
  //add tokenaddress for param to the end of the bytecode
  return bin + priceAbi + chequeValueAbi
}

function getStakeRegistryBin(tokenAddress) {
  const binPath = Path.join(__dirname, '..', 'contracts', 'StakeRegistry.bytecode')
  const bin = FS.readFileSync(binPath, 'utf8').toString().trim()
  tokenAddress = prefixedAddressParamToByteCode(tokenAddress)
  const networkIdAbi = intToByteCode(NETWORK_ID)
  //add tokenaddress and encoded network ID for param to the end of the bytecode
  return bin + tokenAddress + networkIdAbi
}

function getRedistributionBin(stakingAddress, postageContractAddress) {
  const binPath = Path.join(__dirname, '..', 'contracts', 'Redistribution.bytecode')
  const bin = FS.readFileSync(binPath, 'utf8').toString().trim()
  stakingAddress = prefixedAddressParamToByteCode(stakingAddress)
  postageContractAddress = prefixedAddressParamToByteCode(postageContractAddress)
  //add staking address and postage address for param to the end of the bytecode
  return bin + stakingAddress + postageContractAddress
}

/** Returns back contract hash */
async function createContract(contractName, data, creatorAccount, configName) {
  const transaction = await web3.eth.sendTransaction({
    data: data,
    gasLimit: 6721975,
    gasPrice: web3.utils.toWei('10', 'gwei'),
    from: creatorAccount,
  })

  if (!transaction.status) {
    console.error(`${contractName} contract creation Error`, error)
    throw new Error(`Error happened at creating ${contractName} contract creation`)
  }
  console.log(
    `${contractName} contract creation was successful!\n` +
      `\tTransaction ID: ${transaction.transactionHash}\n` +
      `\tContract ID: ${transaction.contractAddress}`,
  )
  console.log(`::CONTRACT:${configName}:${transaction.contractAddress}\n`)

  return transaction.contractAddress
}

module.exports = function (deployer, network, accounts) {
  const creatorAccount = accounts[0]

  deployer.deploy(ERC20PresetMinterPauser, 'Swarm Token', 'BZZ').then(async () => {
    await createContract('PriceOracle', getPriceOracleBin(100000, 100), creatorAccount, 'price-oracle-address')
    await createContract(
      'SimpleSwapFactory',
      getSimpleSwapFactoryBin(ERC20PresetMinterPauser.address),
      creatorAccount,
      'swap-factory-address',
    )

    const postageStampAddress = await createContract(
      'PostageStamp',
      getPostageStampBin(ERC20PresetMinterPauser.address),
      creatorAccount,
      'postage-stamp-address',
    )

    const stakeRegistryAddress = await createContract(
      'StakeRegistry',
      getStakeRegistryBin(ERC20PresetMinterPauser.address, accounts[0]),
      creatorAccount,
      'staking-address',
    )

    await createContract(
      'Redistribution',
      getRedistributionBin(stakeRegistryAddress, postageStampAddress),
      creatorAccount,
      'redistribution-address',
    )
  })
}
