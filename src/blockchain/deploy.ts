import * as path from 'path';
import * as fs from 'fs';
import { ethers } from 'ethers';
import { DEPLOYER_KEY, CHAIN_ID } from '../config';

export interface ContractAddresses {
  bzzToken: string;
  postageStamp: string;
  postageStampStartBlock: number;
  priceOracle: string;
  stakeRegistry: string;
  redistribution: string;
  swapFactory: string;
  swapPriceOracle: string;
}

interface Artifact {
  contractName: string;
  abi: ethers.InterfaceAbi;
  bytecode: string;
}

function loadArtifact(name: string): Artifact {
  // Artifacts are in src/contracts/artifacts/ at source time, but in
  // dist/../src/contracts/artifacts/ after compilation.  We probe both.
  const candidates = [
    path.join(__dirname, '..', 'contracts', 'artifacts', `${name}.json`),
    path.join(__dirname, '..', '..', 'src', 'contracts', 'artifacts', `${name}.json`),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as Artifact;
    }
  }

  throw new Error(`Artifact not found for contract: ${name}. Searched:\n  ${candidates.join('\n  ')}`);
}

async function deploy(
  signer: ethers.Signer,
  name: string,
  ...args: unknown[]
): Promise<{ contract: ethers.BaseContract; blockNumber: number }> {
  const artifact = loadArtifact(name);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy(...args);
  const receipt = await contract.deploymentTransaction()!.wait();
  return { contract, blockNumber: receipt!.blockNumber };
}

export async function deployContracts(
  provider: ethers.JsonRpcProvider
): Promise<ContractAddresses> {
  // NonceManager tracks nonces locally so back-to-back deploys don't all
  // fetch the same stale nonce from the provider's block-polling cache.
  const deployer = new ethers.NonceManager(new ethers.Wallet(DEPLOYER_KEY, provider));
  const deployerAddress = await (deployer.signer as ethers.Wallet).getAddress();

  // 1. BZZ Token — name, symbol, initialSupply (we mint per-node later)
  const { contract: bzzToken } = await deploy(deployer, 'BzzToken', 'Bee', 'BZZ', 0n);
  const bzzTokenAddress = await bzzToken.getAddress();

  // 2. PostageStamp(bzzToken, minimumBucketDepth=16)
  const { contract: postageStamp, blockNumber: postageStampStartBlock } = await deploy(deployer, 'PostageStamp', bzzTokenAddress, 16);
  const postageStampAddress = await postageStamp.getAddress();

  // 3. PriceOracle(postageStamp)
  const { contract: priceOracle } = await deploy(deployer, 'PriceOracle', postageStampAddress);
  const priceOracleAddress = await priceOracle.getAddress();

  // 4. StakeRegistry(bzzToken, networkId, oracleContract)
  const { contract: stakeRegistry } = await deploy(deployer, 'StakeRegistry', bzzTokenAddress, CHAIN_ID, priceOracleAddress);
  const stakeRegistryAddress = await stakeRegistry.getAddress();

  // 5. Redistribution(staking, postageContract, oracleContract)
  const { contract: redistribution } = await deploy(
    deployer,
    'Redistribution',
    stakeRegistryAddress,
    postageStampAddress,
    priceOracleAddress
  );
  const redistributionAddress = await redistribution.getAddress();

  // 6. SimpleSwapFactory(bzzToken)
  const { contract: swapFactory } = await deploy(deployer, 'SimpleSwapFactory', bzzTokenAddress);
  const swapFactoryAddress = await swapFactory.getAddress();

  // 7. SwapPriceOracle (stub — Bee doesn't call this directly)
  const { contract: swapPriceOracle } = await deploy(deployer, 'SwapPriceOracle');
  const swapPriceOracleAddress = await swapPriceOracle.getAddress();

  // ── Post-deployment role grants ──────────────────────────────────────────
  // All contracts use OZ AccessControl. Role bytes are keccak256(name).
  const PRICE_ORACLE_ROLE  = ethers.keccak256(ethers.toUtf8Bytes('PRICE_ORACLE_ROLE'));
  const REDISTRIBUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes('REDISTRIBUTOR_ROLE'));
  const PRICE_UPDATER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('PRICE_UPDATER_ROLE'));

  const grantAbi = ['function grantRole(bytes32 role, address account) external'];

  const ps = new ethers.Contract(postageStampAddress, grantAbi, deployer);
  const sr = new ethers.Contract(stakeRegistryAddress, grantAbi, deployer);
  const po = new ethers.Contract(priceOracleAddress, grantAbi, deployer);

  // PriceOracle → PRICE_ORACLE_ROLE on PostageStamp (so it can call setPrice)
  await (await ps.grantRole(PRICE_ORACLE_ROLE, priceOracleAddress)).wait();
  // Redistribution → REDISTRIBUTOR_ROLE on PostageStamp
  await (await ps.grantRole(REDISTRIBUTOR_ROLE, redistributionAddress)).wait();
  // Redistribution → REDISTRIBUTOR_ROLE on StakeRegistry
  await (await sr.grantRole(REDISTRIBUTOR_ROLE, redistributionAddress)).wait();
  // Deployer → PRICE_UPDATER_ROLE on PriceOracle so we can seed a price
  await (await po.grantRole(PRICE_UPDATER_ROLE, deployerAddress)).wait();

  // Seed an initial price so Bee nodes can read a non-zero price immediately
  const priceOracleFull = new ethers.Contract(
    priceOracleAddress,
    ['function setPrice(uint32 _price) external returns (bool)'],
    deployer
  );
  await (await priceOracleFull.setPrice(24000)).wait();

  return {
    bzzToken: bzzTokenAddress,
    postageStamp: postageStampAddress,
    postageStampStartBlock,
    priceOracle: priceOracleAddress,
    stakeRegistry: stakeRegistryAddress,
    redistribution: redistributionAddress,
    swapFactory: swapFactoryAddress,
    swapPriceOracle: swapPriceOracleAddress,
  };
}
