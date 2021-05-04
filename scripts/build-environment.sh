#!/bin/bash
MY_PATH=$(dirname "$0")
MY_PATH=$( cd "$MY_PATH" && pwd )

"$MY_PATH/network.sh"
"$MY_PATH/blockchain.sh"
npm run migrate:chequebook
npm run supply
"$MY_PATH/blockchain-docker-build.sh"
"$MY_PATH/bee-docker-build.sh"
