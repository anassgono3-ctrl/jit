// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IUniswapV3Quoter } from "../interfaces/IUniswapV3Quoter.sol";

contract MockQuoter is IUniswapV3Quoter {
    uint256 public quoteOut;
    bool public shouldRevert;

    function setQuote(uint256 q) external {
        quoteOut = q;
        shouldRevert = false;
    }

    function setRevert(bool v) external {
        shouldRevert = v;
    }

    function quoteExactInputSingle(
        address /*tokenIn*/,
        address /*tokenOut*/,
        uint24 /*fee*/,
        uint256 /*amountIn*/,
        uint160 /*sqrtPriceLimitX96*/
    ) external view override returns (uint256 amountOut) {
        if (shouldRevert) revert("mock quoter revert");
        return quoteOut;
    }
}
