// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Minimal Uniswap V3 Quoter interface
interface IUniswapV3Quoter {
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountOut);
}
