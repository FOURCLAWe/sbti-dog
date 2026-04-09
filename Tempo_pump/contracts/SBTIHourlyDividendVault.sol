// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ISBTIEligibleHolderRegistry {
    function totalEligibleHolders() external view returns (uint256);
    function eligibleHolderAt(uint256 index) external view returns (address);
    function setSettlementLocked(bool locked) external;
}

interface IAutomationCompatible {
    function checkUpkeep(bytes calldata checkData) external view returns (bool upkeepNeeded, bytes memory performData);
    function performUpkeep(bytes calldata performData) external;
}

contract SBTIHourlyDividendVault is Ownable, ReentrancyGuard, IAutomationCompatible {
    error SettlementNotReady(uint256 nextSettlementAt, uint256 currentTimestamp);
    error ActiveBatchInProgress();
    error NoActiveBatch();
    error InvalidBatchSize();
    error NothingToClaim();
    error NativeTransferFailed();
    error InvalidRegistry();

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant RELEASE_BPS = 2_000;
    uint256 public constant SETTLEMENT_INTERVAL = 1 hours;
    uint256 public constant DEFAULT_BATCH_SIZE = 40;

    ISBTIEligibleHolderRegistry public immutable holderRegistry;

    uint256 public nextSettlementAt;
    uint256 public lastSettlementAt;
    uint256 public lastReleaseAmount;
    uint256 public totalReservedForClaims;

    uint256 public settledEpochCount;
    uint256 public activeEpochId;
    uint256 public activeBatchCursor;
    uint256 public activeBatchHolderCount;
    uint256 public activeBatchAmountPerHolder;
    uint256 public activeBatchRemainder;
    uint256 public activeBatchReservedAmount;

    mapping(address => uint256) public claimableBNB;

    event NativeFunded(address indexed from, uint256 amount);
    event SettlementOpened(
        uint256 indexed epochId,
        uint256 releaseAmount,
        uint256 holderCount,
        uint256 amountPerHolder,
        uint256 remainder,
        uint256 openedAt,
        uint256 nextSettlementAt
    );
    event SettlementSkipped(uint256 availableBalance, uint256 previewReleaseAmount, uint256 holderCount, uint256 nextSettlementAt);
    event SettlementBatchProcessed(
        uint256 indexed epochId,
        uint256 fromIndex,
        uint256 toIndex,
        uint256 creditedAmount,
        bool completed
    );
    event Claimed(address indexed account, uint256 amount);
    event EmergencyWithdrawal(address indexed to, uint256 amount);

    constructor(address initialOwner, address registryAddress) Ownable(initialOwner) {
        if (registryAddress == address(0)) revert InvalidRegistry();

        holderRegistry = ISBTIEligibleHolderRegistry(registryAddress);
        nextSettlementAt = block.timestamp + SETTLEMENT_INTERVAL;
    }

    receive() external payable {
        emit NativeFunded(msg.sender, msg.value);
    }

    function availableForNextSettlement() public view returns (uint256) {
        if (address(this).balance <= totalReservedForClaims) {
            return 0;
        }

        return address(this).balance - totalReservedForClaims;
    }

    function previewNextRelease() public view returns (uint256) {
        return (availableForNextSettlement() * RELEASE_BPS) / BPS_DENOMINATOR;
    }

    function activeBatchRemaining() external view returns (uint256) {
        if (activeEpochId == 0 || activeBatchCursor >= activeBatchHolderCount) {
            return 0;
        }

        return activeBatchHolderCount - activeBatchCursor;
    }

    function checkUpkeep(bytes calldata)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        if (activeEpochId != 0 && activeBatchCursor < activeBatchHolderCount) {
            return (true, abi.encode(DEFAULT_BATCH_SIZE));
        }

        if (block.timestamp >= nextSettlementAt) {
            return (true, abi.encode(DEFAULT_BATCH_SIZE));
        }

        return (false, bytes(""));
    }

    function performUpkeep(bytes calldata performData) external override {
        uint256 batchSize = performData.length == 0 ? DEFAULT_BATCH_SIZE : abi.decode(performData, (uint256));
        executeUpkeep(batchSize);
    }

    function executeUpkeep(uint256 batchSize) public {
        if (activeEpochId != 0) {
            processSettlementBatch(batchSize);
            return;
        }

        settleCurrentHour(batchSize);
    }

    function settleCurrentHour(uint256 batchSize) public {
        if (activeEpochId != 0) revert ActiveBatchInProgress();
        if (block.timestamp < nextSettlementAt) {
            revert SettlementNotReady(nextSettlementAt, block.timestamp);
        }

        if (batchSize == 0) revert InvalidBatchSize();

        uint256 holderCount = holderRegistry.totalEligibleHolders();
        uint256 availableBalance = availableForNextSettlement();
        uint256 releaseAmount = (availableBalance * RELEASE_BPS) / BPS_DENOMINATOR;

        lastSettlementAt = block.timestamp;
        nextSettlementAt = block.timestamp + SETTLEMENT_INTERVAL;
        lastReleaseAmount = releaseAmount;

        if (releaseAmount == 0 || holderCount == 0) {
            emit SettlementSkipped(availableBalance, releaseAmount, holderCount, nextSettlementAt);
            return;
        }

        settledEpochCount += 1;
        activeEpochId = settledEpochCount;
        activeBatchCursor = 0;
        activeBatchHolderCount = holderCount;
        activeBatchAmountPerHolder = releaseAmount / holderCount;
        activeBatchRemainder = releaseAmount % holderCount;
        activeBatchReservedAmount = releaseAmount;
        totalReservedForClaims += releaseAmount;

        holderRegistry.setSettlementLocked(true);

        emit SettlementOpened(
            activeEpochId,
            releaseAmount,
            holderCount,
            activeBatchAmountPerHolder,
            activeBatchRemainder,
            block.timestamp,
            nextSettlementAt
        );

        processSettlementBatch(batchSize);
    }

    function processSettlementBatch(uint256 maxCount) public {
        if (activeEpochId == 0 || activeBatchCursor >= activeBatchHolderCount) revert NoActiveBatch();
        if (maxCount == 0) revert InvalidBatchSize();

        uint256 fromIndex = activeBatchCursor;
        uint256 toIndex = fromIndex + maxCount;
        if (toIndex > activeBatchHolderCount) {
            toIndex = activeBatchHolderCount;
        }

        uint256 creditedAmount;

        for (uint256 i = fromIndex; i < toIndex; i += 1) {
            address holder = holderRegistry.eligibleHolderAt(i);
            uint256 payout = activeBatchAmountPerHolder;
            if (i < activeBatchRemainder) {
                payout += 1;
            }

            if (payout == 0) {
                continue;
            }

            claimableBNB[holder] += payout;
            creditedAmount += payout;
        }

        activeBatchCursor = toIndex;
        bool completed = activeBatchCursor == activeBatchHolderCount;

        if (completed) {
            activeEpochId = 0;
            activeBatchCursor = 0;
            activeBatchHolderCount = 0;
            activeBatchAmountPerHolder = 0;
            activeBatchRemainder = 0;
            activeBatchReservedAmount = 0;
            holderRegistry.setSettlementLocked(false);
        }

        emit SettlementBatchProcessed(settledEpochCount, fromIndex, toIndex, creditedAmount, completed);
    }

    function claim() external nonReentrant {
        uint256 amount = claimableBNB[msg.sender];
        if (amount == 0) revert NothingToClaim();

        claimableBNB[msg.sender] = 0;
        totalReservedForClaims -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) {
            claimableBNB[msg.sender] = amount;
            totalReservedForClaims += amount;
            revert NativeTransferFailed();
        }

        emit Claimed(msg.sender, amount);
    }

    function emergencyWithdraw(address payable to, uint256 amount) external onlyOwner nonReentrant {
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert NativeTransferFailed();

        emit EmergencyWithdrawal(to, amount);
    }
}
