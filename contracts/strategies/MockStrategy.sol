// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IYieldStrategy.sol";

contract MockStrategy is IYieldStrategy, Ownable {
    using SafeERC20 for IERC20;

    address public immutable override asset;
    uint256 public principal;
    uint256 public simulatedYield;

    event YieldSet(uint256 newYield);
    event Invested(uint256 amount);
    event Divested(uint256 amount);
    event Harvested(uint256 yieldAmount);

    constructor(address _asset) Ownable(msg.sender) {
        require(_asset != address(0), "MockStrategy: zero asset address");
        asset = _asset;
    }

    function totalAssets() external view override returns (uint256) {
        return principal + simulatedYield;
    }

    function invest(uint256 amount) external override onlyOwner {
        require(amount > 0, "MockStrategy: zero amount");
        
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        principal += amount;
        
        emit Invested(amount);
    }

    function divest(uint256 amount) external override onlyOwner returns (uint256) {
        require(amount > 0, "MockStrategy: zero amount");
        require(amount <= principal, "MockStrategy: insufficient principal");
        
        principal -= amount;
        IERC20(asset).safeTransfer(msg.sender, amount);
        
        emit Divested(amount);
        return amount;
    }

    function harvest() external override onlyOwner returns (uint256) {
        uint256 yieldAmount = simulatedYield;
        
        if (yieldAmount > 0) {
            simulatedYield = 0;
            IERC20(asset).safeTransfer(msg.sender, yieldAmount);
            emit Harvested(yieldAmount);
        }
        
        return yieldAmount;
    }

    function setSimulatedYield(uint256 _yield) external {
        simulatedYield = _yield;
        emit YieldSet(_yield);
    }
}
