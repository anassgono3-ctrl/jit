// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
 Educational Balancer-style flashloan receiver.

 This contract implements a minimal IFlashLoanRecipient-like interface:
 - receiveFlashLoan(address[] tokens, uint256[] amounts, uint256[] feeAmounts, bytes userData)

 IMPORTANT: This contract *does not* contain a trading / arbitrage
 implementation. It's a safe scaffold showing:
 1) how to accept a flashloan,
 2) emit useful diagnostics,
 3) repay the loan.

 Replace the TODO section with *fully tested* logic and be aware of legal
 and ethical implications of deploying execution code on mainnet.
*/

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IVault {
    // Vault.flashLoan(recipient, tokens, amounts, userData)
    function flashLoan(address recipient, address[] calldata tokens, uint256[] calldata amounts, bytes calldata userData) external;
}

contract BalancerFlashJitReceiver {
    address public owner;

    event FlashLoanReceived(address indexed vault, address[] tokens, uint256[] amounts, uint256[] fees, bytes userData);
    event FlashLoanRepaid(address indexed vault, address[] tokens, uint256[] amountsWithFee);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // Called by Vault after sending tokens
    // The vault expects sums (amount + fee) to be returned before this call finishes.
    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external returns (bytes memory) {
        // Diagnostics event
        emit FlashLoanReceived(msg.sender, tokens, amounts, feeAmounts, userData);

        // === USER STRATEGY AREA (PLACEHOLDER) ===
        // TODO: place your testing logic here.
        // Example safe operations:
        //  - Read balances
        //  - Call other local contracts (mock DEX) in unit tests
        //
        // NEVER call untrusted third-party code here in production without
        // full tests and safety checks.
        // =======================================

        // Repay: transfer each token back with amount+fee
        uint256 len = tokens.length;
        uint256[] memory amountsWithFee = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            uint256 repay = amounts[i] + feeAmounts[i];
            amountsWithFee[i] = repay;
            // Approve and transfer back to vault (assume token implements transfer)
            // NOTE: Vault implementations may expect tokens to be transferred directly or via approvals.
            // Our MockVault test implementation accepts transfers back.
            require(IERC20(tokens[i]).transfer(msg.sender, repay), "repay transfer failed");
        }

        emit FlashLoanRepaid(msg.sender, tokens, amountsWithFee);

        return abi.encodePacked("OK");
    }

    // Administrative functions for testing
    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).transfer(to, amount);
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}