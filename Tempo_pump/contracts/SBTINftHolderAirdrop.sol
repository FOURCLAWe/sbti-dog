// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SBTINftHolderAirdrop is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error InvalidClaimAmount();
    error InvalidMaxTokenId();
    error ClaimClosed();
    error AlreadyClaimed(address account);
    error NotEligible(address account);
    error InsufficientAirdropBalance(uint256 requiredAmount, uint256 availableAmount);

    IERC20 public immutable sbtiToken;
    IERC1155 public immutable nftContract;
    uint256 public immutable maxTokenId;

    uint256 public claimAmount;
    bool public claimEnabled;

    mapping(address => bool) public claimed;

    event Claimed(address indexed account, uint256 amount);
    event ClaimStatusUpdated(bool enabled);
    event ClaimAmountUpdated(uint256 amount);
    event TokensRecovered(address indexed token, address indexed to, uint256 amount);

    constructor(
        address initialOwner,
        address tokenAddress,
        address nftContractAddress,
        uint256 claimAmount_,
        uint256 maxTokenId_
    ) Ownable(initialOwner) {
        if (tokenAddress == address(0) || nftContractAddress == address(0)) revert ZeroAddress();
        if (claimAmount_ == 0) revert InvalidClaimAmount();
        if (maxTokenId_ == 0) revert InvalidMaxTokenId();

        sbtiToken = IERC20(tokenAddress);
        nftContract = IERC1155(nftContractAddress);
        claimAmount = claimAmount_;
        maxTokenId = maxTokenId_;
        claimEnabled = true;
    }

    function setClaimEnabled(bool enabled) external onlyOwner {
        claimEnabled = enabled;
        emit ClaimStatusUpdated(enabled);
    }

    function setClaimAmount(uint256 nextClaimAmount) external onlyOwner {
        if (nextClaimAmount == 0) revert InvalidClaimAmount();
        claimAmount = nextClaimAmount;
        emit ClaimAmountUpdated(nextClaimAmount);
    }

    function nftBalance(address account) public view returns (uint256 totalBalance) {
        if (account == address(0)) {
            return 0;
        }

        for (uint256 tokenId = 1; tokenId <= maxTokenId; tokenId += 1) {
            totalBalance += nftContract.balanceOf(account, tokenId);
        }
    }

    function isEligible(address account) public view returns (bool) {
        return nftBalance(account) > 0;
    }

    function previewClaim(address account)
        external
        view
        returns (bool eligible, bool hasClaimed, uint256 nextClaimAmount, uint256 contractBalance)
    {
        eligible = isEligible(account);
        hasClaimed = claimed[account];
        nextClaimAmount = claimAmount;
        contractBalance = sbtiToken.balanceOf(address(this));
    }

    function claim() external nonReentrant {
        if (!claimEnabled) revert ClaimClosed();
        if (claimed[msg.sender]) revert AlreadyClaimed(msg.sender);
        if (!isEligible(msg.sender)) revert NotEligible(msg.sender);

        uint256 available = sbtiToken.balanceOf(address(this));
        if (available < claimAmount) revert InsufficientAirdropBalance(claimAmount, available);

        claimed[msg.sender] = true;
        sbtiToken.safeTransfer(msg.sender, claimAmount);

        emit Claimed(msg.sender, claimAmount);
    }

    function recoverTokens(address tokenAddress, address to, uint256 amount) external onlyOwner {
        if (tokenAddress == address(0) || to == address(0)) revert ZeroAddress();
        IERC20(tokenAddress).safeTransfer(to, amount);
        emit TokensRecovered(tokenAddress, to, amount);
    }
}
