// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
  Balancer Flashloan Receiver - JIT skeleton (repayment via approve for Vault pull)
*/

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IVault {
    function flashLoan(address recipient, address[] calldata tokens, uint256[] calldata amounts, bytes calldata userData) external;
}

/// Optional Uniswap V3-like position manager interface (illustrative - to be adapted)
interface IUniswapV3PositionManager {
    // simplified placeholders; adapt to canonical interface when implementing
    function mint(bytes calldata params) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function decreaseLiquidity(bytes calldata params) external returns (uint256 amount0, uint256 amount1);
    function collect(bytes calldata params) external returns (uint256 amount0, uint256 amount1);
}

contract BalancerFlashJitReceiver {
    address public owner;

    // Lifecycle events for observability
    event FlashLoanReceived(address indexed vault, address[] tokens, uint256[] amounts, uint256[] fees, bytes userData);
    event StrategyStarted(bytes32 indexed strategyId, address indexed executor, bytes meta);
    event StrategySucceeded(bytes32 indexed strategyId, uint256 profitUsd);
    event StrategyFailed(bytes32 indexed strategyId, string reason);
    event FlashLoanRepaid(address indexed vault, address[] tokens, uint256[] amountsWithFee);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // Called by Vault after sending tokens.
    // Must repay amount + fee before returning.
    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external returns (bytes memory) {
        require(tokens.length == amounts.length && amounts.length == feeAmounts.length, "len mismatch");

        // Emit diagnostic event for off-chain tracing
        emit FlashLoanReceived(msg.sender, tokens, amounts, feeAmounts, userData);

        // Build a unique strategy id for tracing (simple hash)
        bytes32 strategyId = keccak256(abi.encodePacked(msg.sender, tokens, amounts, feeAmounts, userData, block.number));

        emit StrategyStarted(strategyId, tx.origin, userData);

        // Execute strategy (internal, wrapped via public entry to allow try/catch)
        bool strategyOk = true;
        string memory failureReason = "";

        try this._executeJitStrategyExternal(strategyId, tokens, amounts, feeAmounts, userData) {
            // success
        } catch Error(string memory reason) {
            strategyOk = false;
            failureReason = reason;
        } catch {
            strategyOk = false;
            failureReason = "unknown";
        }

        if (strategyOk) {
            emit StrategySucceeded(strategyId, 0); // profitUsd unknown in template
        } else {
            emit StrategyFailed(strategyId, failureReason);
            // failure does not block repay in this skeleton
        }

        // Approve the vault (msg.sender) to pull principal+fee
        uint256 len = tokens.length;
        uint256[] memory amountsWithFee = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            uint256 repay = amounts[i] + feeAmounts[i];
            amountsWithFee[i] = repay;
            require(IERC20(tokens[i]).approve(msg.sender, repay), "approve failed");
        }
        emit FlashLoanRepaid(msg.sender, tokens, amountsWithFee);
        return abi.encodePacked("OK");
    }

    // ---- Strategy hook ----

    // Public wrapper used only for try/catch context; blocks external callers.
    function _executeJitStrategyExternal(
        bytes32 strategyId,
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external {
        require(msg.sender == address(this), "external calls disabled");
        _executeJitStrategy(strategyId, tokens, amounts, feeAmounts, userData);
    }

    // Internal hook — replace this body with your production logic.
    function _executeJitStrategy(
        bytes32 /*strategyId*/,
        address[] memory /*tokens*/,
        uint256[] memory /*amounts*/,
        uint256[] memory /*feeAmounts*/,
        bytes memory /*userData*/
    ) internal {
        // no-op skeleton (replace with production logic)
    }

    // Admin helpers
    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).transfer(to, amount);
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}