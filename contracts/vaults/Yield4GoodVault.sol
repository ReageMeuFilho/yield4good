// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IYieldStrategy.sol";
import "../interfaces/IDonationRouter.sol";

contract Yield4GoodVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IYieldStrategy public strategy;
    address public donationRouter;
    address public beneficiary;
    bool public paused;
    uint256 public totalDonated;

    event Harvest(uint256 yieldAmount, address indexed beneficiary);
    event BeneficiaryChanged(address indexed newBeneficiary);
    event DonationRouterChanged(address indexed newRouter);
    event StrategyChanged(address indexed newStrategy);
    event Paused(bool status);
    event EmergencyDivest(uint256 amount);

    modifier whenNotPaused() {
        require(!paused, "Yield4GoodVault: paused");
        _;
    }

    constructor(
        IERC20 _asset,
        IYieldStrategy _strategy,
        address _donationRouter,
        address _beneficiary,
        string memory _name,
        string memory _symbol
    ) ERC4626(_asset) ERC20(_name, _symbol) Ownable(msg.sender) {
        require(address(_strategy) != address(0), "Yield4GoodVault: zero strategy address");
        require(_donationRouter != address(0), "Yield4GoodVault: zero router address");
        require(_beneficiary != address(0), "Yield4GoodVault: zero beneficiary address");
        require(address(_asset) == _strategy.asset(), "Yield4GoodVault: asset mismatch");

        strategy = _strategy;
        donationRouter = _donationRouter;
        beneficiary = _beneficiary;
    }

    function totalAssets() public view virtual override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + strategy.totalAssets();
    }

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal virtual override whenNotPaused nonReentrant {
        super._deposit(caller, receiver, assets, shares);
        
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        if (balance > 0) {
            IERC20(asset()).forceApprove(address(strategy), balance);
            strategy.invest(balance);
        }
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal virtual override nonReentrant {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        
        if (assets > idle) {
            uint256 shortfall = assets - idle;
            uint256 divested = strategy.divest(shortfall);
            require(divested >= shortfall, "Yield4GoodVault: insufficient liquidity");
        }
        
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    function harvest() external nonReentrant whenNotPaused {
        uint256 yieldAmount = strategy.harvest();
        
        if (yieldAmount > 0) {
            IERC20(asset()).forceApprove(donationRouter, yieldAmount);
            IDonationRouter(donationRouter).donate(asset(), beneficiary, yieldAmount);
            
            totalDonated += yieldAmount;
            emit Harvest(yieldAmount, beneficiary);
        }
    }

    function setBeneficiary(address _beneficiary) external onlyOwner {
        require(_beneficiary != address(0), "Yield4GoodVault: zero beneficiary address");
        beneficiary = _beneficiary;
        emit BeneficiaryChanged(_beneficiary);
    }

    function setDonationRouter(address _donationRouter) external onlyOwner {
        require(_donationRouter != address(0), "Yield4GoodVault: zero router address");
        donationRouter = _donationRouter;
        emit DonationRouterChanged(_donationRouter);
    }

    function setStrategy(IYieldStrategy _strategy) external onlyOwner {
        require(address(_strategy) != address(0), "Yield4GoodVault: zero strategy address");
        require(address(asset()) == _strategy.asset(), "Yield4GoodVault: asset mismatch");
        strategy = _strategy;
        emit StrategyChanged(address(_strategy));
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    function emergencyDivest(uint256 amount) external onlyOwner {
        require(amount > 0, "Yield4GoodVault: zero amount");
        uint256 divested = strategy.divest(amount);
        emit EmergencyDivest(divested);
    }
}
