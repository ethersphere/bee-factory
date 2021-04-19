const ERC20PresetMinterPauser = artifacts.require("ERC20PresetMinterPauser");
const SimpleSwapFactory = artifacts.require("SimpleSwapFactory");

module.exports = function (deployer) {
  deployer.deploy(ERC20PresetMinterPauser, "Swarm Token", "BZZ").then(() => {
    deployer.deploy(SimpleSwapFactory, ERC20PresetMinterPauser.address)
  });
};
