// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SwapPriceOracle
 * @notice Not a real contract in the ethersphere repos. Bee does not use a
 *         separate SwapPriceOracle for the chequebook / swap-swear-and-swindle
 *         stack. This file is kept as a placeholder to avoid breaking any
 *         deployment scripts that reference it by name.
 *
 *         The actual price oracle for storage incentives is PriceOracle.sol
 *         (PostagePriceOracle), deployed alongside PostageStamp.sol.
 */
contract SwapPriceOracle {
    uint256 private constant DEFAULT_PRICE = 1000000000000000; // 0.001 ETH

    function getPrice(bytes32 /*target*/) external view returns (uint256 price, uint256 updatedAt) {
        return (DEFAULT_PRICE, block.timestamp);
    }

    function currentPrice() external pure returns (uint256) {
        return DEFAULT_PRICE;
    }
}
