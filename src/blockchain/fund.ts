import { ethers } from 'ethers';
import {
  DEPLOYER_KEY,
  BEE_NODE_KEYS,
  ETH_FUND_AMOUNT,
  BZZ_FUND_AMOUNT,
} from '../config';

const BZZ_DECIMALS = 16;

// Minimal BZZ token ABI – only what we need here
const BZZ_ABI = [
  'function mint(address to, uint256 amount) external',
  'function balanceOf(address) view returns (uint256)',
];

export async function fundNodes(
  provider: ethers.JsonRpcProvider,
  bzzTokenAddress: string
): Promise<void> {
  const deployer = new ethers.NonceManager(new ethers.Wallet(DEPLOYER_KEY, provider));
  const bzzToken = new ethers.Contract(bzzTokenAddress, BZZ_ABI, deployer);

  const ethAmount = ethers.parseEther(ETH_FUND_AMOUNT);
  const bzzAmount = ethers.parseUnits(BZZ_FUND_AMOUNT, BZZ_DECIMALS);

  for (const key of BEE_NODE_KEYS) {
    const wallet = new ethers.Wallet(key);
    const address = wallet.address;

    // Fund with ETH
    const ethTx = await deployer.sendTransaction({
      to: address,
      value: ethAmount,
    });
    await ethTx.wait();

    // Mint BZZ tokens
    const bzzTx = await bzzToken.mint(address, bzzAmount);
    await bzzTx.wait();
  }
}
