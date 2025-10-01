// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
  Balancer Flashloan Receiver - JIT skeleton with Uniswap V3 swap in callback (optional)
  - Approves Vault to pull principal+fee (Balancer semantics)
  - If a Uniswap V3 router is configured, performs a conservative exactInputSingle swap
    from tokens[0] -> tokens[1] using a fraction of the flashloan amount.
*/

import { IERC20 } from "./interfaces/IERC20.sol";
import { IVault } from "./interfaces/IVault.sol";
import { IUniswapV3SwapRouter } from "./interfaces/IUniswapV3Router.sol";

contract BalancerFlashJitReceiver {
    address public owner;

    // Optional swap config
    IUniswapV3SwapRouter public swapRouter;
    uint24 public defaultPoolFee = 3000; // 0.3% default

    event FlashLoanReceived(address indexed vault, address[] tokens, uint256[] amounts, uint256[] fees, bytes userData);
    event StrategyStarted(bytes32 indexed strategyId, address indexed executor, bytes meta);
    event StrategySucceeded(bytes32 indexed strategyId, uint256 profitUsd);
    event StrategyFailed(bytes32 indexed strategyId, string reason);
    event FlashLoanRepaid(address indexed vault, address[] tokens, uint256[] amountsWithFee);
    event SwapRouterSet(address indexed router);
    event DefaultPoolFeeSet(uint24 fee);
    event SwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setSwapRouter(address router) external onlyOwner {
        swapRouter = IUniswapV3SwapRouter(router);
        emit SwapRouterSet(router);
    }

    function setDefaultPoolFee(uint24 fee) external onlyOwner {
        defaultPoolFee = fee;
        emit DefaultPoolFeeSet(fee);
    }

    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external returns (bytes memory) {
        require(tokens.length == amounts.length && amounts.length == feeAmounts.length, "len mismatch");

        emit FlashLoanReceived(msg.sender, tokens, amounts, feeAmounts, userData);

        bytes32 strategyId = keccak256(abi.encodePacked(msg.sender, tokens, amounts, feeAmounts, userData, block.number));
        emit StrategyStarted(strategyId, tx.origin, userData);

        bool strategyOk = true;
        string memory failureReason = "";
        try this._executeJitStrategyExternal(strategyId, tokens, amounts, feeAmounts, userData) {
        } catch Error(string memory reason) {
            strategyOk = false;
            failureReason = reason;
        } catch {
            strategyOk = false;
            failureReason = "unknown";
        }
        if (strategyOk) {
            emit StrategySucceeded(strategyId, 0);
        } else {
            emit StrategyFailed(strategyId, failureReason);
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

    function _executeJitStrategyExternal(
        bytes32 strategyId,
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata /*feeAmounts*/,
        bytes calldata /*userData*/
    ) external {
        require(msg.sender == address(this), "external calls disabled");
        _executeJitStrategy(strategyId, tokens, amounts);
    }

    function _executeJitStrategy(
        bytes32 /*strategyId*/,
        address[] memory tokens,
        uint256[] memory amounts
    ) internal {
        // Minimal swap path: if router set and we have at least 2 tokens, swap a fraction of token0 -> token1
        if (address(swapRouter) == address(0)) {
            return; // no-op if not configured
        }
        if (tokens.length < 2) {
            return; // need at least a pair
        }

        address tokenIn = tokens[0];
        address tokenOut = tokens[1];

        // Use 50% of the first token amount conservatively
        uint256 amountIn = amounts[0] / 2;
        if (amountIn == 0) return;

        // Approve router for tokenIn
        IERC20(tokenIn).approve(address(swapRouter), amountIn);

        IUniswapV3SwapRouter.ExactInputSingleParams memory p = IUniswapV3SwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: defaultPoolFee,
            recipient: address(this),
            deadline: block.timestamp + 60, // short deadline
            amountIn: amountIn,
            amountOutMinimum: 0, // NOTE: placeholder; set via off-chain or add slippage controls for production
            sqrtPriceLimitX96: 0
        });

        try swapRouter.exactInputSingle(p) returns (uint256 amountOut) {
            emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
        } catch {
            // If swap fails, we continue and still attempt to repay principal+fee; Vault will pull funds
        }
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).transfer(to, amount);
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}