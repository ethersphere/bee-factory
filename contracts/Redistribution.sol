// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.19;
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./Util/TransformedChunkProof.sol";
import "./Util/ChunkProof.sol";
import "./Util/Signatures.sol";
import "./interface/IPostageStamp.sol";

interface IPriceOracle {
    function adjustPrice(uint16 redundancy) external returns (bool);
}

interface IStakeRegistry {
    struct Stake {
        bytes32 overlay;
        uint256 stakeAmount;
        uint256 lastUpdatedBlockNumber;
    }

    function freezeDeposit(address _owner, uint256 _time) external;

    function lastUpdatedBlockNumberOfAddress(address _owner) external view returns (uint256);

    function overlayOfAddress(address _owner) external view returns (bytes32);

    function heightOfAddress(address _owner) external view returns (uint8);

    function nodeEffectiveStake(address _owner) external view returns (uint256);
}

/**
 * @title Redistribution contract
 * @author The Swarm Authors
 * @dev Implements a Schelling Co-ordination game to form consensus around the Reserve Commitment hash. This takes
 * place in three phases: _commit_, _reveal_ and _claim_.
 */

contract Redistribution is AccessControl, Pausable {
    // ----------------------------- Type declarations ------------------------------

    struct Commit {
        bytes32 overlay;
        address owner;
        bool revealed;
        uint8 height;
        uint256 stake;
        bytes32 obfuscatedHash;
        uint256 revealIndex;
    }

    struct Reveal {
        bytes32 overlay;
        address owner;
        uint8 depth;
        uint256 stake;
        uint256 stakeDensity;
        bytes32 hash;
    }

    struct ChunkInclusionProof {
        bytes32[] proofSegments;
        bytes32 proveSegment;
        bytes32[] proofSegments2;
        bytes32 proveSegment2;
        uint64 chunkSpan;
        bytes32[] proofSegments3;
        PostageProof postageProof;
        SOCProof[] socProof;
    }

    struct SOCProof {
        address signer;
        bytes signature;
        bytes32 identifier;
        bytes32 chunkAddr;
    }

    struct PostageProof {
        bytes signature;
        bytes32 postageId;
        uint64 index;
        uint64 timeStamp;
    }

    // The address of the linked PostageStamp contract.
    IPostageStamp public PostageContract;
    // The address of the linked PriceOracle contract.
    IPriceOracle public OracleContract;
    // The address of the linked Staking contract.
    IStakeRegistry public Stakes;

    // Commits for the current round.
    Commit[] public currentCommits;
    // Reveals for the current round.
    Reveal[] public currentReveals;

    // The current anchor that being processed for the reveal and claim phases of the round.
    bytes32 private currentRevealRoundAnchor;

    // The current random value from which we will random.
    bytes32 private seed;

    // The number of the currently active round phases.
    uint64 public currentCommitRound;
    uint64 public currentRevealRound;
    uint64 public currentClaimRound;

    // Settings for slashing and freezing
    uint8 private penaltyMultiplierDisagreement = 1;
    uint8 private penaltyMultiplierNonRevealed = 2;
    uint8 private penaltyRandomFactor = 100;

    // alpha=0.097612 beta=0.0716570 k=16
    uint256 private sampleMaxValue = 1284401000000000000000000000000000000000000000000000000000000000000000000;

    // The reveal of the winner of the last round.
    Reveal public winner;

    // The length of a round in blocks.
    uint256 private constant ROUND_LENGTH = 152;

    // Maximum value of the keccack256 hash.
    bytes32 private constant MAX_H = 0x00000000000000000000000000000000ffffffffffffffffffffffffffffffff;

    // ----------------------------- Events ------------------------------

    event WinnerSelected(Reveal winner);
    event TruthSelected(bytes32 hash, uint8 depth);
    event CountCommits(uint256 _count);
    event CountReveals(uint256 _count);
    event Committed(uint256 roundNumber, bytes32 overlay, uint8 height);
    event ChunkCount(uint256 validChunkCount);
    event CurrentRevealAnchor(uint256 roundNumber, bytes32 anchor);
    event PriceAdjustmentSkipped(uint16 redundancyCount);
    event WithdrawFailed(address owner);
    event Revealed(
        uint256 roundNumber,
        bytes32 overlay,
        uint256 stake,
        uint256 stakeDensity,
        bytes32 reserveCommitment,
        uint8 depth
    );
    event transformedChunkAddressFromInclusionProof(uint256 indexInRC, bytes32 chunkAddress);

    // ----------------------------- Errors ------------------------------

    error NotCommitPhase();
    error NoCommitsReceived();
    error PhaseLastBlock();
    error CommitRoundOver();
    error CommitRoundNotStarted();
    error NotMatchingOwner();
    error MustStake2Rounds();
    error NotStaked();
    error WrongPhase();
    error AlreadyCommitted();
    error NotRevealPhase();
    error OutOfDepthReveal(bytes32);
    error OutOfDepthClaim(uint8);
    error OutOfDepth();
    error AlreadyRevealed();
    error NoMatchingCommit();
    error NotClaimPhase();
    error NoReveals();
    error FirstRevealDone();
    error AlreadyClaimed();
    error NotAdmin();
    error OnlyPauser();
    error SocVerificationFailed(bytes32);
    error SocCalcNotMatching(bytes32);
    error IndexOutsideSet(bytes32);
    error SigRecoveryFailed(bytes32);
    error BatchDoesNotExist(bytes32);
    error BucketDiffers(bytes32);
    error InclusionProofFailed(uint8, bytes32);
    error RandomElementCheckFailed();
    error LastElementCheckFailed();
    error ReserveCheckFailed(bytes32 trALast);

    // ----------------------------- CONSTRUCTOR ------------------------------

    /**
     * @param staking the address of the linked Staking contract.
     * @param postageContract the address of the linked PostageStamp contract.
     * @param oracleContract the address of the linked PriceOracle contract.
     */
    constructor(address staking, address postageContract, address oracleContract) {
        Stakes = IStakeRegistry(staking);
        PostageContract = IPostageStamp(postageContract);
        OracleContract = IPriceOracle(oracleContract);
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    ////////////////////////////////////////
    //           STATE CHANGING           //
    ////////////////////////////////////////

    function commit(bytes32 _obfuscatedHash, uint64 _roundNumber) external whenNotPaused {
        uint64 cr = currentRound();
        bytes32 _overlay = Stakes.overlayOfAddress(msg.sender);
        uint256 _stake = Stakes.nodeEffectiveStake(msg.sender);
        uint256 _lastUpdate = Stakes.lastUpdatedBlockNumberOfAddress(msg.sender);
        uint8 _height = Stakes.heightOfAddress(msg.sender);

        if (_lastUpdate == 0) {
            revert NotStaked();
        }

        if (_lastUpdate >= block.number - 2 * ROUND_LENGTH) {
            revert MustStake2Rounds();
        }

        if (cr > _roundNumber) {
            revert CommitRoundOver();
        }

        if (cr < _roundNumber) {
            revert CommitRoundNotStarted();
        }

        if (!currentPhaseCommit()) {
            revert NotCommitPhase();
        }

        if (block.number % ROUND_LENGTH == (ROUND_LENGTH / 4) - 1) {
            revert PhaseLastBlock();
        }

        if (cr != currentCommitRound) {
            delete currentCommits;
            currentCommitRound = cr;
        }

        uint256 commitsArrayLength = currentCommits.length;

        for (uint256 i = 0; i < commitsArrayLength; ) {
            if (currentCommits[i].overlay == _overlay) {
                revert AlreadyCommitted();
            }

            unchecked {
                ++i;
            }
        }

        currentCommits.push(
            Commit({
                overlay: _overlay,
                owner: msg.sender,
                revealed: false,
                height: _height,
                stake: _stake,
                obfuscatedHash: _obfuscatedHash,
                revealIndex: 0
            })
        );

        emit Committed(_roundNumber, _overlay, _height);
    }

    function reveal(uint8 _depth, bytes32 _hash, bytes32 _revealNonce) external whenNotPaused {
        uint64 cr = currentRound();
        bytes32 _overlay = Stakes.overlayOfAddress(msg.sender);

        if (cr != currentCommitRound) {
            revert NoCommitsReceived();
        }

        if (!currentPhaseReveal()) {
            revert NotRevealPhase();
        }

        if (_depth < currentMinimumDepth()) {
            revert OutOfDepth();
        }

        if (cr != currentRevealRound) {
            currentRevealRoundAnchor = currentRoundAnchor();
            delete currentReveals;
            currentRevealRound = cr;
            emit CurrentRevealAnchor(cr, currentRevealRoundAnchor);
            updateRandomness();
        }

        bytes32 obfuscatedHash = wrapCommit(_overlay, _depth, _hash, _revealNonce);
        uint256 id = findCommit(_overlay, obfuscatedHash);
        Commit memory revealedCommit = currentCommits[id];
        uint8 depthResponsibility = _depth - revealedCommit.height;

        if (!inProximity(revealedCommit.overlay, currentRevealRoundAnchor, depthResponsibility)) {
            revert OutOfDepthReveal(currentRevealRoundAnchor);
        }
        if (revealedCommit.revealed) {
            revert AlreadyRevealed();
        }

        currentCommits[id].revealed = true;
        currentCommits[id].revealIndex = currentReveals.length;

        currentReveals.push(
            Reveal({
                overlay: revealedCommit.overlay,
                owner: revealedCommit.owner,
                depth: _depth,
                stake: revealedCommit.stake,
                stakeDensity: revealedCommit.stake * uint256(2 ** depthResponsibility),
                hash: _hash
            })
        );

        emit Revealed(
            cr,
            revealedCommit.overlay,
            revealedCommit.stake,
            revealedCommit.stake * uint256(2 ** depthResponsibility),
            _hash,
            _depth
        );
    }

    function claim(
        ChunkInclusionProof calldata entryProof1,
        ChunkInclusionProof calldata entryProof2,
        ChunkInclusionProof calldata entryProofLast
    ) external whenNotPaused {
        winnerSelection();

        Reveal memory winnerSelected = winner;
        uint256 indexInRC1;
        uint256 indexInRC2;
        bytes32 _currentRevealRoundAnchor = currentRevealRoundAnchor;
        bytes32 _seed = seed;

        indexInRC1 = uint256(_seed) % 15;
        indexInRC2 = uint256(_seed) % 14;
        if (indexInRC2 >= indexInRC1) {
            indexInRC2++;
        }

        if (!inProximity(entryProofLast.proveSegment, _currentRevealRoundAnchor, winnerSelected.depth)) {
            revert OutOfDepthClaim(3);
        }

        inclusionFunction(entryProofLast, 30);
        stampFunction(entryProofLast);
        socFunction(entryProofLast);

        if (!inProximity(entryProof1.proveSegment, _currentRevealRoundAnchor, winnerSelected.depth)) {
            revert OutOfDepthClaim(2);
        }

        inclusionFunction(entryProof1, indexInRC1 * 2);
        stampFunction(entryProof1);
        socFunction(entryProof1);

        if (!inProximity(entryProof2.proveSegment, _currentRevealRoundAnchor, winnerSelected.depth)) {
            revert OutOfDepthClaim(1);
        }

        inclusionFunction(entryProof2, indexInRC2 * 2);
        stampFunction(entryProof2);
        socFunction(entryProof2);

        checkOrder(
            indexInRC1,
            indexInRC2,
            entryProof1.proofSegments[0],
            entryProof2.proofSegments[0],
            entryProofLast.proofSegments[0]
        );

        estimateSize(entryProofLast.proofSegments[0]);

        (bool success, ) = address(PostageContract).call(
            abi.encodeWithSignature("withdraw(address)", winnerSelected.owner)
        );
        if (!success) {
            emit WithdrawFailed(winnerSelected.owner);
        }

        emit WinnerSelected(winnerSelected);
        emit ChunkCount(PostageContract.validChunkCount());
    }

    function winnerSelection() internal {
        uint64 cr = currentRound();

        if (!currentPhaseClaim()) {
            revert NotClaimPhase();
        }

        if (cr != currentRevealRound) {
            revert NoReveals();
        }

        if (cr <= currentClaimRound) {
            revert AlreadyClaimed();
        }

        uint256 currentWinnerSelectionSum = 0;
        uint256 redundancyCount = 0;
        bytes32 randomNumber;
        uint256 randomNumberTrunc;

        bytes32 truthRevealedHash;
        uint8 truthRevealedDepth;
        uint256 currentCommitsLength = currentCommits.length;

        emit CountCommits(currentCommitsLength);
        emit CountReveals(currentReveals.length);

        (truthRevealedHash, truthRevealedDepth) = getCurrentTruth();
        emit TruthSelected(truthRevealedHash, truthRevealedDepth);
        string memory winnerSelectionAnchor = currentWinnerSelectionAnchor();

        for (uint256 i = 0; i < currentCommitsLength; ) {
            Commit memory currentCommit = currentCommits[i];
            uint256 revIndex = currentCommit.revealIndex;
            Reveal memory currentReveal = currentReveals[revIndex];

            if (
                currentCommit.revealed &&
                truthRevealedHash == currentReveal.hash &&
                truthRevealedDepth == currentReveal.depth
            ) {
                currentWinnerSelectionSum += currentReveal.stakeDensity;
                randomNumber = keccak256(abi.encodePacked(winnerSelectionAnchor, redundancyCount));
                randomNumberTrunc = uint256(randomNumber & MAX_H);

                if (randomNumberTrunc * currentWinnerSelectionSum < currentReveal.stakeDensity * (uint256(MAX_H) + 1)) {
                    winner = currentReveal;
                }

                redundancyCount++;
            }

            if (
                currentCommit.revealed &&
                (truthRevealedHash != currentReveal.hash || truthRevealedDepth != currentReveal.depth) &&
                (block.prevrandao % 100 < penaltyRandomFactor)
            ) {
                Stakes.freezeDeposit(
                    currentReveal.owner,
                    penaltyMultiplierDisagreement * ROUND_LENGTH * uint256(2 ** truthRevealedDepth)
                );
            }

            if (!currentCommit.revealed) {
                Stakes.freezeDeposit(
                    currentCommit.owner,
                    penaltyMultiplierNonRevealed * ROUND_LENGTH * uint256(2 ** truthRevealedDepth)
                );
            }
            unchecked {
                ++i;
            }
        }

        bool success = OracleContract.adjustPrice(uint16(redundancyCount));
        if (!success) {
            emit PriceAdjustmentSkipped(uint16(redundancyCount));
        }
        currentClaimRound = cr;
    }

    function inclusionFunction(ChunkInclusionProof calldata entryProof, uint256 indexInRC) internal {
        uint256 randomChunkSegmentIndex = uint256(seed) % 128;
        bytes32 calculatedTransformedAddr = TransformedBMTChunk.transformedChunkAddressFromInclusionProof(
            entryProof.proofSegments3,
            entryProof.proveSegment2,
            randomChunkSegmentIndex,
            entryProof.chunkSpan,
            currentRevealRoundAnchor
        );

        emit transformedChunkAddressFromInclusionProof(indexInRC, calculatedTransformedAddr);

        if (
            winner.hash !=
            BMTChunk.chunkAddressFromInclusionProof(
                entryProof.proofSegments,
                entryProof.proveSegment,
                indexInRC,
                32 * 32
            )
        ) {
            revert InclusionProofFailed(1, calculatedTransformedAddr);
        }

        if (entryProof.proofSegments2[0] != entryProof.proofSegments3[0]) {
            revert InclusionProofFailed(2, calculatedTransformedAddr);
        }

        bytes32 originalAddress = entryProof.socProof.length > 0
            ? entryProof.socProof[0].chunkAddr
            : entryProof.proveSegment;

        if (
            originalAddress !=
            BMTChunk.chunkAddressFromInclusionProof(
                entryProof.proofSegments2,
                entryProof.proveSegment2,
                randomChunkSegmentIndex,
                entryProof.chunkSpan
            )
        ) {
            revert InclusionProofFailed(3, calculatedTransformedAddr);
        }

        if (entryProof.socProof.length > 0) {
            calculatedTransformedAddr = keccak256(
                abi.encode(
                    entryProof.proveSegment,
                    calculatedTransformedAddr
                )
            );
        }

        if (entryProof.proofSegments[0] != calculatedTransformedAddr) {
            revert InclusionProofFailed(4, calculatedTransformedAddr);
        }
    }

    function setFreezingParams(
        uint8 _penaltyMultiplierDisagreement,
        uint8 _penaltyMultiplierNonRevealed,
        uint8 _penaltyRandomFactor
    ) external {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert NotAdmin();
        }

        penaltyMultiplierDisagreement = _penaltyMultiplierDisagreement;
        penaltyMultiplierNonRevealed = _penaltyMultiplierNonRevealed;
        penaltyRandomFactor = _penaltyRandomFactor;
    }

    function setSampleMaxValue(uint256 _sampleMaxValue) external {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert NotAdmin();
        }

        sampleMaxValue = _sampleMaxValue;
    }

    function updateRandomness() private {
        seed = keccak256(abi.encode(seed, block.prevrandao));
    }

    function pause() public {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert OnlyPauser();
        }

        _pause();
    }

    function unPause() public {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert OnlyPauser();
        }
        _unpause();
    }

    ////////////////////////////////////////
    //            STATE READING           //
    ////////////////////////////////////////

    function currentSeed() public view returns (bytes32) {
        uint64 cr = currentRound();
        bytes32 currentSeedValue = seed;

        if (cr > currentRevealRound + 1) {
            uint256 difference = cr - currentRevealRound - 1;
            currentSeedValue = keccak256(abi.encodePacked(currentSeedValue, difference));
        }

        return currentSeedValue;
    }

    function nextSeed() public view returns (bytes32) {
        uint64 cr = currentRound() + 1;
        bytes32 currentSeedValue = seed;

        if (cr > currentRevealRound + 1) {
            uint256 difference = cr - currentRevealRound - 1;
            currentSeedValue = keccak256(abi.encodePacked(currentSeedValue, difference));
        }

        return currentSeedValue;
    }

    function currentTruthSelectionAnchor() private view returns (string memory) {
        if (!currentPhaseClaim()) {
            revert NotClaimPhase();
        }

        uint64 cr = currentRound();
        if (cr != currentRevealRound) {
            revert NoReveals();
        }

        return string(abi.encodePacked(seed, "0"));
    }

    function currentWinnerSelectionAnchor() private view returns (string memory) {
        if (!currentPhaseClaim()) {
            revert NotClaimPhase();
        }
        uint64 cr = currentRound();
        if (cr != currentRevealRound) {
            revert NoReveals();
        }

        return string(abi.encodePacked(seed, "1"));
    }

    function currentRoundAnchor() public view returns (bytes32 returnVal) {
        if (currentPhaseCommit() || (currentRound() > currentRevealRound && !currentPhaseClaim())) {
            return currentSeed();
        }

        if (currentPhaseClaim()) {
            return nextSeed();
        }

        if (currentPhaseReveal() && currentRound() == currentRevealRound) {
            revert FirstRevealDone();
        }
    }

    function inProximity(bytes32 A, bytes32 B, uint8 minimum) public pure returns (bool) {
        if (minimum == 0) {
            return true;
        }

        return uint256(A ^ B) < uint256(2 ** (256 - minimum));
    }

    function currentRound() public view returns (uint64) {
        return uint64(block.number / ROUND_LENGTH);
    }

    function currentPhaseCommit() public view returns (bool) {
        if (block.number % ROUND_LENGTH < ROUND_LENGTH / 4) {
            return true;
        }
        return false;
    }

    function isParticipatingInUpcomingRound(address _owner, uint8 _depth) public view returns (bool) {
        uint256 _lastUpdate = Stakes.lastUpdatedBlockNumberOfAddress(_owner);
        uint8 _depthResponsibility = _depth - Stakes.heightOfAddress(_owner);

        if (currentPhaseReveal()) {
            revert WrongPhase();
        }

        if (_lastUpdate == 0) {
            revert NotStaked();
        }

        if (_lastUpdate >= block.number - 2 * ROUND_LENGTH) {
            revert MustStake2Rounds();
        }

        return inProximity(Stakes.overlayOfAddress(_owner), currentRoundAnchor(), _depthResponsibility);
    }

    function currentMinimumDepth() public view returns (uint8) {
        uint256 difference = currentCommitRound - currentClaimRound;
        uint8 skippedRounds = uint8(difference > 254 ? 254 : difference) + 1;

        uint8 lastWinnerDepth = winner.depth;

        return skippedRounds >= lastWinnerDepth ? 0 : lastWinnerDepth - skippedRounds;
    }

    function findCommit(bytes32 _overlay, bytes32 _obfuscatedHash) internal view returns (uint256) {
        for (uint256 i = 0; i < currentCommits.length; ) {
            if (currentCommits[i].overlay == _overlay && _obfuscatedHash == currentCommits[i].obfuscatedHash) {
                return i;
            }
            unchecked {
                ++i;
            }
        }
        revert NoMatchingCommit();
    }

    function wrapCommit(
        bytes32 _overlay,
        uint8 _depth,
        bytes32 _hash,
        bytes32 revealNonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_overlay, _depth, _hash, revealNonce));
    }

    function currentPhaseReveal() public view returns (bool) {
        uint256 number = block.number % ROUND_LENGTH;
        if (number >= ROUND_LENGTH / 4 && number < ROUND_LENGTH / 2) {
            return true;
        }
        return false;
    }

    function currentRoundReveals() public view returns (Reveal[] memory) {
        if (!currentPhaseClaim()) {
            revert NotClaimPhase();
        }
        uint64 cr = currentRound();
        if (cr != currentRevealRound) {
            revert NoReveals();
        }

        return currentReveals;
    }

    function currentPhaseClaim() public view returns (bool) {
        if (block.number % ROUND_LENGTH >= ROUND_LENGTH / 2) {
            return true;
        }
        return false;
    }

    function getCurrentTruth() internal view returns (bytes32 Hash, uint8 Depth) {
        uint256 currentSum;
        bytes32 randomNumber;
        uint256 randomNumberTrunc;

        bytes32 truthRevealedHash;
        uint8 truthRevealedDepth;
        uint256 revIndex;
        string memory truthSelectionAnchor = currentTruthSelectionAnchor();
        uint256 commitsArrayLength = currentCommits.length;

        for (uint256 i = 0; i < commitsArrayLength; ) {
            if (currentCommits[i].revealed) {
                revIndex = currentCommits[i].revealIndex;
                currentSum += currentReveals[revIndex].stakeDensity;
                randomNumber = keccak256(abi.encodePacked(truthSelectionAnchor, i));
                randomNumberTrunc = uint256(randomNumber & MAX_H);

                if (randomNumberTrunc * currentSum < currentReveals[revIndex].stakeDensity * (uint256(MAX_H) + 1)) {
                    truthRevealedHash = currentReveals[revIndex].hash;
                    truthRevealedDepth = currentReveals[revIndex].depth;
                }
            }
            unchecked {
                ++i;
            }
        }

        return (truthRevealedHash, truthRevealedDepth);
    }

    function isWinner(bytes32 _overlay) public view returns (bool) {
        if (!currentPhaseClaim()) {
            revert NotClaimPhase();
        }

        uint64 cr = currentRound();
        if (cr != currentRevealRound) {
            revert NoReveals();
        }

        if (cr <= currentClaimRound) {
            revert AlreadyClaimed();
        }

        uint256 currentWinnerSelectionSum;
        bytes32 winnerIs;
        bytes32 randomNumber;
        uint256 randomNumberTrunc;
        bytes32 truthRevealedHash;
        uint8 truthRevealedDepth;
        uint256 revIndex;
        string memory winnerSelectionAnchor = currentWinnerSelectionAnchor();
        uint256 redundancyCount = 0;

        (truthRevealedHash, truthRevealedDepth) = getCurrentTruth();
        uint256 commitsArrayLength = currentCommits.length;

        for (uint256 i = 0; i < commitsArrayLength; ) {
            revIndex = currentCommits[i].revealIndex;

            if (
                currentCommits[i].revealed &&
                truthRevealedHash == currentReveals[revIndex].hash &&
                truthRevealedDepth == currentReveals[revIndex].depth
            ) {
                currentWinnerSelectionSum += currentReveals[revIndex].stakeDensity;
                randomNumber = keccak256(abi.encodePacked(winnerSelectionAnchor, redundancyCount));
                randomNumberTrunc = uint256(randomNumber & MAX_H);

                if (
                    randomNumberTrunc * currentWinnerSelectionSum <
                    currentReveals[revIndex].stakeDensity * (uint256(MAX_H) + 1)
                ) {
                    winnerIs = currentReveals[revIndex].overlay;
                }

                redundancyCount++;
            }
            unchecked {
                ++i;
            }
        }

        return (winnerIs == _overlay);
    }

    function socFunction(ChunkInclusionProof calldata entryProof) internal pure {
        if (entryProof.socProof.length == 0) return;

        if (
            !Signatures.socVerify(
                entryProof.socProof[0].signer,
                entryProof.socProof[0].signature,
                entryProof.socProof[0].identifier,
                entryProof.socProof[0].chunkAddr
            )
        ) {
            revert SocVerificationFailed(entryProof.socProof[0].chunkAddr);
        }

        if (
            calculateSocAddress(entryProof.socProof[0].identifier, entryProof.socProof[0].signer) !=
            entryProof.proveSegment
        ) {
            revert SocCalcNotMatching(entryProof.socProof[0].chunkAddr);
        }
    }

    function stampFunction(ChunkInclusionProof calldata entryProof) internal view {
        (address batchOwner, uint8 batchDepth, uint8 bucketDepth, , , ) = PostageContract.batches(
            entryProof.postageProof.postageId
        );

        if (batchOwner == address(0)) {
            revert BatchDoesNotExist(entryProof.postageProof.postageId);
        }

        uint32 postageIndex = getPostageIndex(entryProof.postageProof.index);
        uint256 maxPostageIndex = postageStampIndexCount(batchDepth, bucketDepth);
        if (postageIndex >= maxPostageIndex) {
            revert IndexOutsideSet(entryProof.postageProof.postageId);
        }

        uint64 postageBucket = getPostageBucket(entryProof.postageProof.index);
        uint64 addressBucket = addressToBucket(entryProof.proveSegment, bucketDepth);
        if (postageBucket != addressBucket) {
            revert BucketDiffers(entryProof.postageProof.postageId);
        }

        if (
            !Signatures.postageVerify(
                batchOwner,
                entryProof.postageProof.signature,
                entryProof.proveSegment,
                entryProof.postageProof.postageId,
                entryProof.postageProof.index,
                entryProof.postageProof.timeStamp
            )
        ) {
            revert SigRecoveryFailed(entryProof.postageProof.postageId);
        }
    }

    function addressToBucket(bytes32 swarmAddress, uint8 bucketDepth) internal pure returns (uint32) {
        uint32 prefix = uint32(uint256(swarmAddress) >> (256 - 32));
        return prefix >> (32 - bucketDepth);
    }

    function postageStampIndexCount(uint8 postageDepth, uint8 bucketDepth) internal pure returns (uint256) {
        return 1 << (postageDepth - bucketDepth);
    }

    function getPostageIndex(uint64 signedIndex) internal pure returns (uint32) {
        return uint32(signedIndex);
    }

    function getPostageBucket(uint64 signedIndex) internal pure returns (uint64) {
        return uint32(signedIndex >> 32);
    }

    function calculateSocAddress(bytes32 identifier, address signer) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(identifier, signer));
    }

    function checkOrder(uint256 a, uint256 b, bytes32 trA1, bytes32 trA2, bytes32 trALast) internal pure {
        if (a < b) {
            if (uint256(trA1) >= uint256(trA2)) {
                revert RandomElementCheckFailed();
            }
            if (uint256(trA2) >= uint256(trALast)) {
                revert LastElementCheckFailed();
            }
        } else {
            if (uint256(trA2) >= uint256(trA1)) {
                revert RandomElementCheckFailed();
            }
            if (uint256(trA1) >= uint256(trALast)) {
                revert LastElementCheckFailed();
            }
        }
    }

    function estimateSize(bytes32 trALast) internal view {
        if (uint256(trALast) >= sampleMaxValue) {
            revert ReserveCheckFailed(trALast);
        }
    }
}
