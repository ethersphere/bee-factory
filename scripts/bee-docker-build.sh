#!/bin/bash

dockerfile() {
    cat << DOCKERFILE > "$1"
FROM ethersphere/bee:$2

# Sample docker file
COPY --chown=bee:bee . /home/bee/.bee
DOCKERFILE
}

dockerbuild() {
  IMAGE_NAME=$(basename "$1")
  IMAGE_NAME="$4/$IMAGE_NAME"
  docker build "$1" --no-cache -f "$2" -t "$IMAGE_NAME:$3"
}

MY_PATH=$(dirname "$0")
MY_PATH=$( cd "$MY_PATH" && pwd )
BEE_DIRS=$(ls -d "$MY_PATH"/bee-data-dirs/*/)
BEE_VERSION=$("$MY_PATH/utils/env-variable-value.sh" BEE_VERSION)
BEE_IMAGE_PREFIX=$("$MY_PATH/utils/env-variable-value.sh" BEE_IMAGE_PREFIX)

# Make sure we the user has permission all the files
echo "Build Bee Docker images..."
echo "You may need to pass your password for sudo permission to give the right permission to the bee-data folders"
sudo chmod 777 -R "$MY_PATH/bee-data-dirs"

echo "Update common dockerfile"
dockerfile "$MY_PATH/bee-data-dirs/Dockerfile" "$BEE_VERSION"

# If the user has been set the COMMIT_VERSION_TAG env variable
# The image will be built with the tag that is the bee version string
COMMIT_VERSION_TAG="$("$MY_PATH/utils/env-variable-value.sh" COMMIT_VERSION_TAG)"
if [ "$COMMIT_VERSION_TAG" == "true" ] ; then
  # somehow the version command's output goes to the stderr
  BEE_VERSION=$(docker run --rm ethersphere/bee:$BEE_VERSION version 2>&1)
  "$MY_PATH/utils/build-image-tag.sh" set "$BEE_VERSION"
fi

echo "Build Dockerfiles"
for BEE_DIR in $BEE_DIRS
do
  echo "$BEE_DIR"
  dockerbuild "$BEE_DIR" "$MY_PATH/bee-data-dirs/Dockerfile" "$BEE_VERSION" "$BEE_IMAGE_PREFIX"
done

echo "Docker image builds were successful!"
