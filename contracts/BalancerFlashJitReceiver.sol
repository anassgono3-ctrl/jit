// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
  Balancer Flashloan Receiver - JIT skeleton with Uniswap V3 swap in callback (optional) +
  Slippage guard using on-chain Quoter with fallback.
*/

import { IERC20 } from "./interfaces/IERC20.sol";
import { IVault } from "./interfaces/IVault.sol";
import { IUniswapV3SwapRouter } from "./interfaces/IUniswapV3Router.sol";
import { IUniswapV3Quoter } from "./interfaces/IUniswapV3Quoter.sol";

contract BalancerFlashJitReceiver {
    address public owner;

    // Optional swap config
    IUniswapV3SwapRouter public swapRouter;
    IUniswapV3Quoter public quoter;
    uint24 public defaultPoolFee = 3000; // 0.3% default

    // Slippage in basis points (bps): 50 = 0.5%
    uint16 public slippageBps = 50;
    uint16 public maxSlippageBps = 200; // 2% cap

    event FlashLoanReceived(address indexed vault, address[] tokens, uint256[] amounts, uint256[] fees, bytes userData);
    event StrategyStarted(bytes32 indexed strategyId, address indexed executor, bytes meta);
    event StrategySucceeded(bytes32 indexed strategyId, uint256 profitUsd);
    event StrategyFailed(bytes32 indexed strategyId, string reason);
    event FlashLoanRepaid(address indexed vault, address[] tokens, uint256[] amountsWithFee);

    event SwapRouterSet(address indexed router);
    event DefaultPoolFeeSet(uint24 fee);
    event QuoterSet(address indexed quoter);
    event SlippageParamsSet(uint16 slippageBps, uint16 maxSlippageBps);
    event SwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event SlippageFallbackUsed(string reason);

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

    function setQuoter(address _quoter) external onlyOwner {
        quoter = IUniswapV3Quoter(_quoter);
        emit QuoterSet(_quoter);
    }

    function setMaxSlippageBps(uint16 bps) external onlyOwner {
        require(bps > 0 && bps <= 5000, "invalid max slippage");
        maxSlippageBps = bps;
        if (slippageBps > maxSlippageBps) {
            slippageBps = maxSlippageBps;
        }
        emit SlippageParamsSet(slippageBps, maxSlippageBps);
    }

    function setSlippageBps(uint16 bps) external onlyOwner {
        require(bps > 0 && bps <= maxSlippageBps, "slippage too high");
        slippageBps = bps;
        emit SlippageParamsSet(slippageBps, maxSlippageBps);
    }

    // Exposed for tests
    function calcAmountOutMin(uint256 quotedOut) public view returns (uint256) {
        if (slippageBps == 0) return quotedOut; // defensive
        uint256 keepBps = 10000 - uint256(slippageBps);
        return (quotedOut * keepBps) / 10000;
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
        // Optional: perform a guarded swap using Uniswap V3
        if (address(swapRouter) == address(0)) return;
        if (tokens.length < 2) return;

        address tokenIn = tokens[0];
        address tokenOut = tokens[1];

        uint256 amountIn = amounts[0] / 2; // conservative fraction
        if (amountIn == 0) return;

        IERC20(tokenIn).approve(address(swapRouter), amountIn);

        uint256 minOut = 0;
        bool usedFallback = false;

        if (address(quoter) != address(0)) {
            try quoter.quoteExactInputSingle(tokenIn, tokenOut, defaultPoolFee, amountIn, 0) returns (uint256 quotedOut) {
                minOut = calcAmountOutMin(quotedOut);
            } catch {
                usedFallback = true;
            }
        } else {
            usedFallback = true;
        }

        if (usedFallback) {
            emit SlippageFallbackUsed("quoter unavailable");
            // minOut stays 0 to avoid revert in environments with no quoter
        }

        IUniswapV3SwapRouter.ExactInputSingleParams memory p = IUniswapV3SwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: defaultPoolFee,
            recipient: address(this),
            deadline: block.timestamp + 60,
            amountIn: amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0
        });

        try swapRouter.exactInputSingle(p) returns (uint256 amountOut) {
            emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
        } catch {
            // If swap fails, we continue and allow the Vault to pull principal+fee from balances
            // This guards against permanent lockups during test/fork conditions.
        }
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).transfer(to, amount);
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}