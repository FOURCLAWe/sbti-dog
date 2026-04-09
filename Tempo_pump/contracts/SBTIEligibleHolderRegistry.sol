// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

contract SBTIEligibleHolderRegistry is Ownable {
    error RegistryLocked();
    error ZeroAddress();
    error OnlySettlementManager();

    IERC1155 public immutable nftContract;
    IERC20 public immutable sbtiToken;
    uint256 public immutable maxTokenId;

    address public settlementManager;
    bool public settlementLocked;
    uint256 public minimumSbtiBalance;

    address[] private _eligibleHolders;
    mapping(address => bool) public isRegisteredEligible;
    mapping(address => uint256) private _eligibleIndexPlusOne;

    event HolderEligibilityUpdated(
        address indexed account,
        bool eligible,
        uint256 nftBalance,
        uint256 sbtiBalance
    );
    event MinimumSbtiBalanceUpdated(uint256 nextMinimumBalance);
    event SettlementManagerUpdated(address indexed nextManager);
    event SettlementLockUpdated(bool locked);

    constructor(
        address initialOwner,
        address nftContractAddress,
        address sbtiTokenAddress,
        uint256 maxTokenId_,
        uint256 minimumSbtiBalance_
    ) Ownable(initialOwner) {
        if (nftContractAddress == address(0) || sbtiTokenAddress == address(0)) revert ZeroAddress();

        nftContract = IERC1155(nftContractAddress);
        sbtiToken = IERC20(sbtiTokenAddress);
        maxTokenId = maxTokenId_;
        minimumSbtiBalance = minimumSbtiBalance_;
    }

    modifier whenNotLocked() {
        if (settlementLocked) revert RegistryLocked();
        _;
    }

    modifier onlySettlementManager() {
        if (msg.sender != settlementManager) revert OnlySettlementManager();
        _;
    }

    function totalEligibleHolders() external view returns (uint256) {
        return _eligibleHolders.length;
    }

    function eligibleHolderAt(uint256 index) external view returns (address) {
        return _eligibleHolders[index];
    }

    function setMinimumSbtiBalance(uint256 nextMinimumBalance) external onlyOwner whenNotLocked {
        minimumSbtiBalance = nextMinimumBalance;
        emit MinimumSbtiBalanceUpdated(nextMinimumBalance);
    }

    function setSettlementManager(address nextManager) external onlyOwner {
        settlementManager = nextManager;
        emit SettlementManagerUpdated(nextManager);
    }

    function setSettlementLocked(bool locked) external onlySettlementManager {
        settlementLocked = locked;
        emit SettlementLockUpdated(locked);
    }

    function registerSelf() external whenNotLocked returns (bool eligible) {
        return refreshHolder(msg.sender);
    }

    function refreshHolder(address account) public whenNotLocked returns (bool eligible) {
        uint256 nftBalance;
        uint256 sbtiBalance;

        (eligible, nftBalance, sbtiBalance) = _currentEligibility(account);
        _applyEligibility(account, eligible);
        emit HolderEligibilityUpdated(account, eligible, nftBalance, sbtiBalance);
    }

    function refreshBatch(address[] calldata accounts) external whenNotLocked {
        for (uint256 i = 0; i < accounts.length; i += 1) {
            refreshHolder(accounts[i]);
        }
    }

    function currentEligibility(address account)
        external
        view
        returns (bool eligible, uint256 nftBalance, uint256 sbtiBalance)
    {
        return _currentEligibility(account);
    }

    function _currentEligibility(address account)
        internal
        view
        returns (bool eligible, uint256 nftBalance, uint256 sbtiBalance)
    {
        if (account == address(0)) {
            return (false, 0, 0);
        }

        address[] memory accounts = new address[](maxTokenId);
        uint256[] memory ids = new uint256[](maxTokenId);

        for (uint256 i = 0; i < maxTokenId; i += 1) {
            accounts[i] = account;
            ids[i] = i + 1;
        }

        uint256[] memory nftBalances = nftContract.balanceOfBatch(accounts, ids);
        for (uint256 i = 0; i < nftBalances.length; i += 1) {
            nftBalance += nftBalances[i];
        }

        sbtiBalance = sbtiToken.balanceOf(account);
        eligible = nftBalance > 0 && sbtiBalance >= minimumSbtiBalance;
    }

    function _applyEligibility(address account, bool eligible) internal {
        bool currentlyEligible = isRegisteredEligible[account];

        if (eligible && !currentlyEligible) {
            _eligibleHolders.push(account);
            _eligibleIndexPlusOne[account] = _eligibleHolders.length;
            isRegisteredEligible[account] = true;
            return;
        }

        if (!eligible && currentlyEligible) {
            uint256 index = _eligibleIndexPlusOne[account] - 1;
            uint256 lastIndex = _eligibleHolders.length - 1;

            if (index != lastIndex) {
                address movedHolder = _eligibleHolders[lastIndex];
                _eligibleHolders[index] = movedHolder;
                _eligibleIndexPlusOne[movedHolder] = index + 1;
            }

            _eligibleHolders.pop();
            delete _eligibleIndexPlusOne[account];
            delete isRegisteredEligible[account];
        }
    }
}
