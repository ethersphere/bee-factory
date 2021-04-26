#!/bin/bash
echo "Removing 'localstore' and 'statestore' folders from Bee datadirs..."

MY_PATH=`dirname "$0"`
MY_PATH=`( cd "$MY_PATH" && pwd )`
BEE_DIRS=`ls $MY_PATH/bee-data-dirs`
for BEE_DIR in $BEE_DIRS
do
  echo "$BEE_DIR"
  BEE_DIR_PATH="$MY_PATH/bee-data-dirs/$BEE_DIR"
  sudo rm -rf "$BEE_DIR_PATH/localstore"
  sudo rm -rf "$BEE_DIR_PATH/statestore"
done
