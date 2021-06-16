#!/bin/bash
usage() {
    cat << USAGE >&2
USAGE:
    $ build-environment.sh [PARAMETERS]
PARAMETERS:
    --build-base-bee                    The base bee image will be built from source code
    --base-bee-commit-hash=string       the source code commit hash of the base bee; Default: HEAD; Dependency: --build-base-bee
USAGE
    exit 1
}

echoerr() {
     >&2 echo "$@"
}

build_bee() {
    # Clone source code
    BEE_SOURCE_PATH=$MY_PATH/../bee
    if [ -d "$BEE_SOURCE_PATH" ] ; then
        rm -rf "$BEE_SOURCE_PATH"
    fi
    mkdir "$BEE_SOURCE_PATH" && cd "$BEE_SOURCE_PATH" || exit 1
    git init
    git remote add origin https://github.com/ethersphere/bee.git
    git fetch origin --depth=1 "$COMMIT_HASH"
    git reset --hard FETCH_HEAD
    # Build bee and make docker image
    export BEE_VERSION=${COMMIT_HASH::7}-commit
    make binary
    echo "Bee image will be built with version: $BEE_VERSION"
    docker build . -t ethersphere/bee:$BEE_VERSION
    cd "$MY_PATH" || exit 1
    # Set build image tag so that other terminal session can retrieve
    "$MY_PATH/utils/build-image-tag.sh" set "$BEE_VERSION"
}

MY_PATH=$(dirname "$0")
MY_PATH=$( cd "$MY_PATH" && pwd )
COMMIT_HASH=HEAD
BUILD_BASE_BEE=false

# handle passed options
while [ $# -gt 0 ]
do
    case "$1" in
        --build-base-bee)
        BUILD_BASE_BEE=true
        shift 1
        ;;
        --base-bee-commit-hash=*)
        COMMIT_HASH="${1#*=}"
        shift 1
        ;;
        *)
        echoerr "Unknown argument: $1"
        usage
        ;;
    esac
done

if $BUILD_BASE_BEE ; then 
    build_bee
fi

"$MY_PATH/network.sh"
"$MY_PATH/blockchain.sh"
npm run migrate:contracts
npm run supply
"$MY_PATH/blockchain-docker-build.sh"
"$MY_PATH/bee-docker-build.sh"

echo "Successfully build bee environment. Please set BEE_VERSION variable to $BEE_VERSION to run the built environment"
