// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IVault {
    function flashLoan(
        address recipient,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata userData
    ) external;
}