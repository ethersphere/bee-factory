#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const CONTRACTS_TO_COPY = [
  'BzzToken',
  'PostageStamp',
  'PriceOracle',
  'StakeRegistry',
  'Redistribution',
  'SimpleSwapFactory',
  'SwapPriceOracle',
];

const hardhatArtifactsDir = path.join(__dirname, '..', 'hardhat-artifacts', 'contracts');
const destDir = path.join(__dirname, '..', 'src', 'contracts', 'artifacts');

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

let copiedCount = 0;
let errorCount = 0;

for (const contractName of CONTRACTS_TO_COPY) {
  const srcFile = path.join(hardhatArtifactsDir, `${contractName}.sol`, `${contractName}.json`);

  if (!fs.existsSync(srcFile)) {
    console.error(`ERROR: Artifact not found: ${srcFile}`);
    errorCount++;
    continue;
  }

  const raw = fs.readFileSync(srcFile, 'utf8');
  const artifact = JSON.parse(raw);

  // Extract only what we need: contractName, abi, bytecode
  const slim = {
    contractName: artifact.contractName,
    abi: artifact.abi,
    bytecode: artifact.bytecode,
  };

  const destFile = path.join(destDir, `${contractName}.json`);
  fs.writeFileSync(destFile, JSON.stringify(slim, null, 2));
  console.log(`Copied artifact: ${contractName} -> ${destFile}`);
  copiedCount++;
}

if (errorCount > 0) {
  console.error(`\nFailed to copy ${errorCount} artifact(s).`);
  process.exit(1);
} else {
  console.log(`\nSuccessfully copied ${copiedCount} artifact(s) to ${destDir}`);
}
