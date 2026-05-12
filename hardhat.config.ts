import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        // storage-incentives contracts (PostageStamp, PriceOracle, StakeRegistry, Redistribution, BzzToken)
        version: "0.8.19",
        settings: { optimizer: { enabled: true, runs: 200 } }
      },
      {
        // swap-swear-and-swindle contracts (ERC20SimpleSwap, SimpleSwapFactory)
        version: "0.7.6",
        settings: { optimizer: { enabled: true, runs: 200 } }
      }
    ]
  },
  paths: {
    sources: "./contracts",
    artifacts: "./hardhat-artifacts"
  }
};

export default config;
