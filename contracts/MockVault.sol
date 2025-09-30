// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
 MockVault (updated) now mirrors Balancer Vault repayment semantics:
 - Sends principal to the receiver
 - Calls receiveFlashLoan on the receiver
 - Pulls principal+fee back via transferFrom (requires receiver to approve)
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
    // fee rate in bps (e.g., 5 => 0.05%)
    uint256 public feeBps = 5;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function setFeeBps(uint256 bps) external {
        require(msg.sender == owner, "only owner");
        feeBps = bps;
    }

    function flashLoan(address recipient, address[] calldata tokens, uint256[] calldata amounts, bytes calldata userData) external {
        require(tokens.length == amounts.length, "mismatch");

        // Transfer principal to recipient
        for (uint i = 0; i < tokens.length; i++) {
            require(IERC20(tokens[i]).transfer(recipient, amounts[i]), "send principal failed");
        }

        // Compute fees
        uint256[] memory feeAmounts = new uint256[](amounts.length);
        for (uint i = 0; i < amounts.length; i++) {
            feeAmounts[i] = (amounts[i] * feeBps) / 10000;
        }

        // Callback
        IFlashLoanRecipient(recipient).receiveFlashLoan(tokens, amounts, feeAmounts, userData);

        // Pull repayment (principal + fee) from receiver
        for (uint i = 0; i < tokens.length; i++) {
            uint256 expected = amounts[i] + feeAmounts[i];
            require(IERC20(tokens[i]).transferFrom(recipient, address(this), expected), "not repaid");
        }
    }

    // Helper to fund this mock in tests
    function fundToken(address token, uint256 amount) external {
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "fund failed");
    }
}