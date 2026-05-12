// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

/**
 * @title TestToken (BZZ test token)
 * @notice Mintable ERC20 token used in bee-factory / local dev.
 *         Mirrors the TestToken from ethersphere/storage-incentives with 16 decimals.
 */
contract BzzToken is ERC20PresetMinterPauser {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20PresetMinterPauser(name, symbol) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _mint(msg.sender, initialSupply);
    }

    // BZZ uses 16 decimals
    function decimals() public view virtual override returns (uint8) {
        return 16;
    }
}
