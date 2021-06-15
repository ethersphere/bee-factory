const PostageStamp = artifacts.require("PostageStamp");

module.exports = (async function(callback) {
  const accounts = await web3.eth.getAccounts()
  const instance = await PostageStamp.deployed()
  try {
    console.log('sender account', accounts[0])
    await instance.createBatch('0x26234a2ad3ba8b398a762f279b792cfacd536a3f', 1, 16, 10, web3.utils.asciiToHex(Math.random() + ''), false)
    console.log(instance.address)
    callback()
  } catch(e) {
    console.error(e)
  }
});
