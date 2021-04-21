const ERC20PresetMinterPauser = artifacts.require("ERC20PresetMinterPauser");
const FS = require('fs')
const Path = require('path')

function getSimpleSwapFactoryBin(tokenAddress) {
  const simpleSwapFactoryBinPath = Path.join(__dirname, '..', 'contracts', 'SimpleSwapFactory.bytecode')
  const baseBin = FS.readFileSync(simpleSwapFactoryBinPath, 'utf8').toString()
  //remove 0x prefix
  tokenAddress = tokenAddress.substring(2).toLowerCase().padStart(64, '0')
  //add tokenaddress for param to the end of the bytecode
  return baseBin + tokenAddress
}

async function createSimpleSwapFactoryContract(erc20ContractAddress, creatorAccount) {
  const transaction = await web3.eth.sendTransaction({
    data: getSimpleSwapFactoryBin(erc20ContractAddress),
    gasLimit: 6721975,
    gasPrice: web3.utils.toWei('10', 'gwei'),
    from: creatorAccount
  })

  if(!transaction.status) {
    console.error('SimpleSwapFactory contract creation Error', error)
    throw new Error('Error happened at creating SimpleSwapFactory contract creation')
  }
  console.log(`SimpleSwapFactory contract creation was successful!\n`
    + `\tTransaction ID: ${transaction.transactionHash}\n`
    + `\tContract ID: ${transaction.contractAddress}`)
}

module.exports = function (deployer, network, accounts) {
  deployer.deploy(ERC20PresetMinterPauser, "Swarm Token", "BZZ").then(async () => {
    await createSimpleSwapFactoryContract(ERC20PresetMinterPauser.address, accounts[0])
  });
};
