// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IDonationRouter.sol";

contract DonationRouter is IDonationRouter {
    using SafeERC20 for IERC20;

    function donate(
        address asset,
        address beneficiary,
        uint256 amount
    ) external override {
        require(asset != address(0), "DonationRouter: zero asset address");
        require(beneficiary != address(0), "DonationRouter: zero beneficiary address");
        require(amount > 0, "DonationRouter: zero amount");

        IERC20(asset).safeTransferFrom(msg.sender, beneficiary, amount);

        emit YieldDonated(asset, beneficiary, amount, msg.sender);
    }
}
