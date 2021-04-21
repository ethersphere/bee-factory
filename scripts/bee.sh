#!/bin/bash

echoerr() { if [[ $QUIET -ne 1 ]] ; then echo "$@" 1>&2; fi }

usage() {
    cat << USAGE >&2
USAGE:
    $ bee.sh [COMMAND] [PARAMETERS]
COMMANDS:
    start                       create Bee cluster with the given parameters
    stop                        stop Bee cluster
PARAMETERS:
    --ephemeral                 create ephemeral container for bee-client. Data won't be persisted.
    --workers=number            all Bee nodes in the test environment. Default is 4.
    --port-maps=number          map ports of the cluster nodes to the hosting machine in the following manner:
                                1. 1633:1635
                                2. 11633:11635
                                3. 21633:21635 (...)
                                number represents the nodes number to map from. Default is 4.
    --password=string           password for Bee client(s).
    --version=x.y.z             used version of Bee client.
USAGE
    exit 1
}

stop() {
    echo "Stop following containers:"
    docker container stop $QUEEN_CONTAINER_NAME;
    WORKER_NAMES=`docker container ls -f name="$WORKER_CONTAINER_NAME*" --format "{{.Names}}"`
    for WORKER_NAME in $WORKER_NAMES; do
        docker container stop "$WORKER_NAME"
    done

    trap - SIGINT
    exit 0;
}

fetch_queen_underlay_addr() {
    if [[ ! -z "$QUEEN_UNDERLAY_ADDRESS" ]] ; then return; fi

    while : ; do
        QUEEN_UNDERLAY_ADDRESS=$(curl -s localhost:1635/addresses | python -mjson.tool 2>&1 | grep "/ip4/" | awk '!/127.0.0.1/' | xargs)
        if [[ -z "$QUEEN_UNDERLAY_ADDRESS" ]] ; then
            echo "Waiting for the Queen initialization..."
            sleep 5
        else
            break;
        fi
    done
}

log_queen() {
    trap stop SIGINT
    docker logs --tail 25 -f $QUEEN_CONTAINER_NAME
}

# Init variables
EPHEMERAL=false
WORKERS=4
QUEEN_CONTAINER_NAME="swarm-test-queen"
WORKER_CONTAINER_NAME="swarm-test-worker"
QUEEN_CONTAINER_IN_DOCKER=`docker container ls -qaf name=$QUEEN_CONTAINER_NAME`
BEE_VERSION="0.5.3"
BEE_IMAGE="ethersphere/bee:$BEE_VERSION"
BEE_PASSWORD="password"
QUEEN_BOOTNODE=""
PORT_MAPS=2
NETWORK="swarm-test-network"
SWAP=true
SWAP_FACTORY_ADDRESS="0x5b1869D9A4C187F2EAa108f3062412ecf0526b24"
INIT_ROOT_DATA_DIR="$(pwd)/bee-data-dirs"

# Decide script action
case "$1" in
    start)
    shift 1
    ;;
    stop)
    stop
    ;;
    *)
    echoerr "Unknown command: $1"
    usage
    ;;
esac

# Alter variables from flags
while [ $# -gt 0 ]
do
    case "$1" in
        --ephemeral)
        EPHEMERAL=true
        shift 1
        ;;
        --workers=*)
        WORKERS=${1#*=}
        shift 1
        ;;
        --password=*)
        BEE_PASSWORD="${1#*=}"
        shift 1
        ;;
        --version=*)
        BEE_VERSION="${1#*=}"
        BEE_IMAGE="ethersphere/bee:$BEE_VERSION"
        shift 1
        ;;
        --port-maps=*)
        PORT_MAPS="${1#*=}"
        shift 1
        ;;
        --help)
        usage
        ;;
        *)
        echoerr "Unknown argument: $1"
        usage
        ;;
    esac
done

if $EPHEMERAL ; then
    EXTRA_DOCKER_PARAMS=" --rm"
fi

# Start Bee Queen
if [ -z "$QUEEN_CONTAINER_IN_DOCKER" ] || $EPHEMERAL ; then
    EXTRA_QUEEN_PARAMS=""
    if [ $PORT_MAPS -ge 1 ] ; then
        EXTRA_QUEEN_PARAMS=" -p 127.0.0.1:1633-1635:1633-1635"
    fi

    echo "start Bee Queen process"
    docker run \
      -d \
      --network=$NETWORK \
      --name $QUEEN_CONTAINER_NAME \
      -v $INIT_ROOT_DATA_DIR/$QUEEN_CONTAINER_NAME:/home/bee/.bee \
      $EXTRA_DOCKER_PARAMS \
      $EXTRA_QUEEN_PARAMS \
      $BEE_IMAGE \
        start \
        --password $BEE_PASSWORD \
        --bootnode=$QUEEN_BOOTNODE \
        --debug-api-enable \
        --verbosity=4 \
        --swap-enable=$SWAP \
        --swap-endpoint="http://swarm-test-blockchain:9545" \
        --swap-factory-address=$SWAP_FACTORY_ADDRESS \
        --welcome-message="You have found the queen of the beehive..." \
        --cors-allowed-origins="*"
else
    docker start "$QUEEN_CONTAINER_IN_DOCKER"
fi

# Start Bee workers
for i in $(seq 1 1 $WORKERS); do
    WORKER_NAME="$WORKER_CONTAINER_NAME-$i"
    WORKER_CONTAINER_IN_DOCKER=`docker container ls -qaf name=$WORKER_NAME`
    if [ -z "$WORKER_CONTAINER_IN_DOCKER" ] || $EPHEMERAL ; then
        # fetch queen underlay address
        fetch_queen_underlay_addr

        # construct additional params
        EXTRA_WORKER_PARAMS=""
        if [ $PORT_MAPS -gt $i ] ; then
            PORT_START=$((1633+(10000*$i)))
            PORT_END=$(($PORT_START + 2))
            EXTRA_WORKER_PARAMS=" -p 127.0.0.1:$PORT_START-$PORT_END:1633-1635"
        fi

        # run docker container
        echo "start Bee worker $i process"
        docker run \
        -d \
        --network=$NETWORK \
        --name $WORKER_NAME \
        -v $INIT_ROOT_DATA_DIR/$WORKER_NAME:/home/bee/.bee \
        $EXTRA_DOCKER_PARAMS \
        $EXTRA_WORKER_PARAMS \
        $BEE_IMAGE \
          start \
          --password $BEE_PASSWORD \
          --bootnode="$QUEEN_UNDERLAY_ADDRESS" \
          --debug-api-enable \
          --swap-enable=$SWAP \
          --swap-endpoint="http://swarm-test-blockchain:9545" \
          --swap-factory-address=$SWAP_FACTORY_ADDRESS \
          --welcome-message="I'm just Bee worker ${i} in the beehive." \
          --cors-allowed-origins="*"
  else
        docker start "$WORKER_CONTAINER_IN_DOCKER"
  fi
done

# log Bee Queen
log_queen
