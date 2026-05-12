// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

library Signatures {
    error InvalidSignatureLength();

    /** Hash of the message to sign */
    function getPostageMessageHash(
        bytes32 _chunkAddr,
        bytes32 _batchId,
        uint64 _index,
        uint64 _timeStamp
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_chunkAddr, _batchId, _index, _timeStamp));
    }

    function postageVerify(
        address _signer, // signer Ethereum address to check against
        bytes memory _signature,
        bytes32 _chunkAddr,
        bytes32 _postageId,
        uint64 _index,
        uint64 _timeStamp
    ) internal pure returns (bool) {
        bytes32 messageHash = getPostageMessageHash(_chunkAddr, _postageId, _index, _timeStamp);
        bytes32 ethMessageHash = getEthSignedMessageHash(messageHash);

        return recoverSigner(ethMessageHash, _signature) == _signer;
    }

    function getEthSignedMessageHash(bytes32 _messageHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _messageHash));
    }

    function recoverSigner(
        bytes32 _ethSignedMessageHash,
        bytes memory _signature
    ) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);

        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r_, bytes32 s_, uint8 v_) {
        if (sig.length != 65) {
            revert InvalidSignatureLength();
        }

        assembly {
            r_ := mload(add(sig, 32))
            s_ := mload(add(sig, 64))
            v_ := byte(0, mload(add(sig, 96)))
        }
    }

    function getSocMessageHash(bytes32 _identifier, bytes32 _chunkAddr) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_identifier, _chunkAddr));
    }

    function socVerify(
        address _signer, // signer Ethereum address to check against
        bytes memory _signature,
        bytes32 _identifier,
        bytes32 _chunkAddr
    ) internal pure returns (bool) {
        bytes32 messageHash = getSocMessageHash(_identifier, _chunkAddr);
        bytes32 ethMessageHash = getEthSignedMessageHash(messageHash);

        return recoverSigner(ethMessageHash, _signature) == _signer;
    }
}
