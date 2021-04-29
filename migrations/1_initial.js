const ERC20PresetMinterPauser = artifacts.require("ERC20PresetMinterPauser");
const FS = require('fs')
const Path = require('path')

function prefixedAddressParamToByteCode(address) {
  // the first 2 chars removal removes 0x prefix
  return address.substring(2).toLowerCase().padStart(64, '0')
}

function getSimpleSwapFactoryBin(tokenAddress) {
  const binPath = Path.join(__dirname, '..', 'contracts', 'SimpleSwapFactory.bytecode')
  const bin = FS.readFileSync(binPath, 'utf8').toString()
  tokenAddress = prefixedAddressParamToByteCode(tokenAddress)
  //add tokenaddress for param to the end of the bytecode
  return bin + tokenAddress
}

function getPostageStampBin(tokenAddress) {
  const binPath = Path.join(__dirname, '..', 'contracts', 'PostageStamp.bytecode')
  const bin = FS.readFileSync(binPath, 'utf8').toString()
  tokenAddress = prefixedAddressParamToByteCode(tokenAddress)
  //add tokenaddress for param to the end of the bytecode
  return bin + tokenAddress
}

function getPriceOracleBin(postageStampAddress) {
  const binPath = Path.join(__dirname, '..', 'contracts', 'PriceOracle.bytecode')
  const bin = FS.readFileSync(binPath, 'utf8').toString()
  postageStampAddress = prefixedAddressParamToByteCode(postageStampAddress)
  //add postageStampAddress for param to the end of the bytecode
  return bin + postageStampAddress
}

/** Returns back contract hash */
async function createContract(contractName, data, creatorAccount) {
  const transaction = await web3.eth.sendTransaction({
    data: data,
    gasLimit: 6721975,
    gasPrice: web3.utils.toWei('10', 'gwei'),
    from: creatorAccount
  })

  if(!transaction.status) {
    console.error(`${contractName} contract creation Error`, error)
    throw new Error(`Error happened at creating ${contractName} contract creation`)
  }
  console.log(`${contractName} contract creation was successful!\n`
    + `\tTransaction ID: ${transaction.transactionHash}\n`
    + `\tContract ID: ${transaction.contractAddress}`)
  
  return transaction.contractAddress
}

async function createSimpleSwapFactoryContract(erc20ContractAddress, creatorAccount) {
  return createContract('SimpleSwapFactory', getSimpleSwapFactoryBin(erc20ContractAddress), creatorAccount)
}

async function createPostageStampContract(erc20ContractAddress, creatorAccount) {
  return createContract('PostageStamp', getPostageStampBin(erc20ContractAddress), creatorAccount)
}

async function createPriceOracleContract(postageStampContractAddress, creatorAccount) {
  return createContract('PriceOracle', getPriceOracleBin(postageStampContractAddress), creatorAccount)
}

module.exports = function (deployer, network, accounts) {
  deployer.deploy(ERC20PresetMinterPauser, "Swarm Token", "BZZ").then(async () => {
    await createSimpleSwapFactoryContract(ERC20PresetMinterPauser.address, accounts[0])
    const postageStampAddress = await createPostageStampContract(ERC20PresetMinterPauser.address, accounts[0])
    await createPriceOracleContract(postageStampAddress, accounts[0])
  });
};
