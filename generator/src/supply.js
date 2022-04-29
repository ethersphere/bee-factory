const ERC20PresetMinterPauser = artifacts.require("ERC20PresetMinterPauser");
const beeAddresses = require('../bee-overlay-addresses.json')

function getRawTokenAmount(amount, decimals = 18) {
  amount = web3.utils.toBN(amount)
  const rawAmount = amount.mul(web3.utils.toBN(10).pow(web3.utils.toBN(decimals)))
  return rawAmount
}

/** Supply given address with Ether */
async function supplyEther(recepientAddress, supplierAddress, etherAmount = "1") {
  const transaction = await web3.eth.sendTransaction({
    gasLimit: 6721975,
    gasPrice: web3.utils.toWei('10', 'gwei'),
    value: web3.utils.toWei(etherAmount),
    from: supplierAddress,
    to: recepientAddress
  })

  if(!transaction.status) {
    console.error('Supply Ether Error', transaction)
    throw new Error(`Error happened at supplying address ${recepientAddress} from account ${supplierAddress}`)
  }

  console.log(`Supplying address ${recepientAddress} with Ether from account ${supplierAddress} was successful! \n`
    + `\tGiven Ether Amount: ${etherAmount}\n`
    + `\tTransaction ID: ${transaction.transactionHash}`
  )
  console.log('-'.repeat(process.stdout.columns))
}

/** Supply given address with the given Token amount */
async function mintToken(recepientAddress, supplierAddress, tokenAddress, tokenAmount = "100") {
  const instance = await ERC20PresetMinterPauser.at(tokenAddress)
  const rawTokenAmount = getRawTokenAmount(tokenAmount)
  const transaction = await instance.mint(
    recepientAddress,
    rawTokenAmount,
    { 
      from: supplierAddress,
      gasLimit: 6721975,
    }
  )

  if(!transaction.receipt.status) {
    console.error('Supply Token Error', transaction)
    throw new Error(`Error happened at supplying address ${recepientAddress} from account ${supplierAddress}`)
  }

  console.log(`Supplying address ${recepientAddress} with Token from account ${supplierAddress} was successful! \n`
    + `\tGiven Token Amount: ${tokenAmount}\n`
    + `\tTransaction ID: ${transaction.tx}`,
  )
  console.log('-'.repeat(process.stdout.columns))
}

/** Supply ERC20 tokens to all configured Bee client overlay addresses */
async function supplyTokenForBees(supplierAddress, erc20ContractAddress) {
  const txPromises = []
  console.log(`Supply ERC20 tokens (${erc20ContractAddress}) to the configured Bee addresses`)
  console.log('='.repeat(process.stdout.columns))

  for(const beeAddress of beeAddresses) {
    txPromises.push(mintToken(beeAddress, supplierAddress, erc20ContractAddress))
  }
  return Promise.all(txPromises)
}

/** Supply ether to all configured Bee client overlay addresses */
async function supplyEtherForBees(supplierAddress) {
  const txPromises = []
  console.log('Supply Ether to the configured Bee addresses')
  console.log('='.repeat(process.stdout.columns))

  for(const beeAddress of beeAddresses) {
    txPromises.push(supplyEther(beeAddress, supplierAddress))
  }
  return Promise.all(txPromises)
}

module.exports = (async function(callback) {
  const accounts = await web3.eth.getAccounts()
  await supplyTokenForBees(accounts[0], ERC20PresetMinterPauser.address)
  await supplyEtherForBees(accounts[0])
  callback()
});