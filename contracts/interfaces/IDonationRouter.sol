// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDonationRouter {
    event YieldDonated(
        address indexed asset,
        address indexed beneficiary,
        uint256 amount,
        address indexed caller
    );
    
    function donate(
        address asset,
        address beneficiary,
        uint256 amount
    ) external;
}
