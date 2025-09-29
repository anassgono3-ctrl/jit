// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
 Simple MockVault that simulates a Balancer flashLoan call.
 It transfers tokens to the recipient and then calls receiveFlashLoan.
 This mock is for local testing only. It keeps logic simple and safe.
*/

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function mint(address to, uint256 amount) external;
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external returns (bytes memory);
}

contract MockVault {
    // fee rate in bps (for example 5 => 0.05%)
    uint256 public feeBps = 5;

    // admin
    address public owner;
    constructor() {
        owner = msg.sender;
    }

    function setFeeBps(uint256 bps) external {
        require(msg.sender == owner, "only owner");
        feeBps = bps;
    }

    // tokens and amounts arrays must match length
    function flashLoan(address recipient, address[] calldata tokens, uint256[] calldata amounts, bytes calldata userData) external {
        require(tokens.length == amounts.length, "mismatch");

        // Track initial balances before transferring
        uint256[] memory initialBalances = new uint256[](tokens.length);
        for (uint i = 0; i < tokens.length; i++) {
            initialBalances[i] = IERC20(tokens[i]).balanceOf(address(this));
        }

        // Transfer tokens to recipient
        for (uint i = 0; i < tokens.length; i++) {
            IERC20(tokens[i]).transfer(recipient, amounts[i]);
        }

        // compute fee amounts
        uint256[] memory feeAmounts = new uint256[](amounts.length);
        for (uint i = 0; i < amounts.length; i++) {
            feeAmounts[i] = (amounts[i] * feeBps) / 10000;
        }

        // Call recipient (simulate Vault calling)
        IFlashLoanRecipient(recipient).receiveFlashLoan(tokens, amounts, feeAmounts, userData);

        // After the call, check that this mock contract received repayment
        for (uint i = 0; i < tokens.length; i++) {
            uint256 expectedBalance = initialBalances[i] + feeAmounts[i];
            uint256 actualBalance = IERC20(tokens[i]).balanceOf(address(this));
            require(actualBalance >= expectedBalance, "not repaid");
        }
    }

    // For tests: allow funding the vault with mock tokens
    function fundToken(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }
}