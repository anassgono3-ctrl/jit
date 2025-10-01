// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IERC20 } from "../interfaces/IERC20.sol";
import { IUniswapV3SwapRouter } from "../interfaces/IUniswapV3Router.sol";

// A minimal router that pulls tokenIn and sends a pre-configured amountOut to recipient.
// Reverts if amountOutMinimum > configured amountOut.
contract MockRouterV3 is IUniswapV3SwapRouter {
    uint256 public amountOutToSend;

    function setAmountOut(uint256 v) external {
        amountOutToSend = v;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable override returns (uint256 amountOut) {
        // Pull tokenIn from caller
        require(IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn), "pull tokenIn failed");
        // Check slippage constraint
        require(amountOutToSend >= params.amountOutMinimum, "TooMuchSlippage");
        // Send out tokenOut to recipient
        require(IERC20(params.tokenOut).transfer(params.recipient, amountOutToSend), "send tokenOut failed");
        return amountOutToSend;
    }
}
