#!/bin/bash
# Store/get the tag of the Docker image that will be built

store_custom_tag() {
  echo "$1" > "$MY_PATH/$COMMIT_VERSION_TAG_FILENAME"
}

# Echos the image tag which is defined by the environment or has been extracted from the Bee version command
get_tag() {
  COMMIT_VERSION_TAG=$("$MY_PATH/env-variable-value.sh" COMMIT_VERSION_TAG)
  if [ "$COMMIT_VERSION_TAG" == 'true' ] ; then
    # retrieve from the output of previous store action
    cat "$MY_PATH/$COMMIT_VERSION_TAG_FILENAME"
  else
    BEE_VERSION=$("$MY_PATH/env-variable-value.sh" BEE_VERSION)
    echo "$BEE_VERSION"
  fi
}

MY_PATH=$(dirname "$0")
MY_PATH=$( cd "$MY_PATH" && pwd )
COMMIT_VERSION_TAG_FILENAME=".commit-version-tag"

if [ "$1" == "set" ] ; then
  store_custom_tag "$2"
elif [ "$1" == "get" ] ; then
  get_tag
fi
