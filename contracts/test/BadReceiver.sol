// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
 * BadReceiver deliberately fails to repay flashloan.
 * Used for negative testing only.
 */
contract BadReceiver {
    function receiveFlashLoan(
        address[] calldata, 
        uint256[] calldata, 
        uint256[] calldata, 
        bytes calldata
    ) external returns (bytes memory) {
        // do nothing, no repayment
        return abi.encodePacked("FAIL");
    }
}