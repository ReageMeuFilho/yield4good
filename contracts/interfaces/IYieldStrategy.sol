// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IYieldStrategy {
    function asset() external view returns (address);
    
    function totalAssets() external view returns (uint256);
    
    function invest(uint256 amount) external;
    
    function divest(uint256 amount) external returns (uint256 actuallyDivested);
    
    function harvest() external returns (uint256 yieldAmt);
}
