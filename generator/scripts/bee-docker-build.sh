#!/bin/bash

set -o errexit
set -o pipefail

dockerfile() {
    cat << DOCKERFILE > "$1"
FROM ethersphere/bee:$2

# Sample docker file
COPY --chown=bee:bee . /home/bee/.bee
DOCKERFILE
}

dockerbuild() {
  BLOCKCHAIN_VERSION=$("$MY_PATH/utils/env-variable-value.sh" BLOCKCHAIN_VERSION)
  PLATFORM_FLAG=""

  if [ -n "$BEE_PLATFORM" ]; then
    PLATFORM_FLAG="--platform=$BEE_PLATFORM"
  fi

  if [ -n "$PUSH_IMAGES" ]; then
    # Multiplatform build needs to push the images right away as docker buildx does not output images loaded into
    # docker itself, or it can do that but only for one platform.
      PLATFORM_FLAG+=" --push"
  fi

  IMAGE_NAME=$(basename "$1")
  IMAGE_NAME="$4/$IMAGE_NAME"
  docker build "$1" --no-cache -f "$2" -t "$IMAGE_NAME:$3" $PLATFORM_FLAG --label "org.ethswarm.beefactory.blockchain-version=$BLOCKCHAIN_VERSION"
}

MY_PATH=$(dirname "$0")
MY_PATH=$( cd "$MY_PATH" && pwd )
BEE_DIRS=$(ls -d "$MY_PATH"/bee-data-dirs/*/)
BEE_VERSION=$("$MY_PATH/utils/env-variable-value.sh" BEE_VERSION)
BEE_IMAGE_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_IMAGE_PREFIX)
STATE_COMMIT=$("$MY_PATH/utils/env-variable-value.sh" STATE_COMMIT)
OFFICIAL_BEE_IMAGE="ethersphere/bee:$BEE_VERSION"

# Make sure we the user has permission all the files
echo "Build Bee Docker images..."
echo "Update common dockerfile"
dockerfile "$MY_PATH/bee-data-dirs/Dockerfile" "$BEE_VERSION"

### BEE_VERSION ALTERNATIONS START

# If the user has been set the COMMIT_VERSION_TAG env variable
# The image will be built with the tag that is the bee version string
COMMIT_VERSION_TAG="$("$MY_PATH/utils/env-variable-value.sh" COMMIT_VERSION_TAG)"
if [ "$COMMIT_VERSION_TAG" == "true" ] ; then
  echo "Image version tag will be extracted from the bee version command from image $OFFICIAL_BEE_IMAGE"
  docker pull $OFFICIAL_BEE_IMAGE
  # somehow the version command's output goes to the stderr
  BEE_VERSION=$(docker run --rm $OFFICIAL_BEE_IMAGE version 2>&1)
  echo "Extracted Bee version: $BEE_VERSION"
  "$MY_PATH/utils/build-image-tag.sh" set "$BEE_VERSION"
fi

if [ "$STATE_COMMIT" == 'false'  ] ; then
  echo "The bee image will be built without their state"
  BEE_VERSION+="-stateless"
  "$MY_PATH/utils/build-image-tag.sh" set "$BEE_VERSION"
  echo "Stateless Bee version: $BEE_VERSION"
fi

### BEE_VERSION ALERNATIONS END

echo "Build Dockerfiles"
for BEE_DIR in $BEE_DIRS
do
  echo "Build Bee version $BEE_VERSION on $BEE_DIR"
  dockerbuild "$BEE_DIR" "$MY_PATH/bee-data-dirs/Dockerfile" "$BEE_VERSION" "$BEE_IMAGE_PREFIX"
done

echo "Docker image builds were successful!"
