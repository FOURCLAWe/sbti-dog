(function () {
  const config = window.SBTI_DIVIDEND_VAULT_CONFIG || {};
  const vaultAddressEl = document.getElementById("dividendVaultAddress");
  const registryAddressEl = document.getElementById("dividendRegistryAddress");
  const nextSettlementEl = document.getElementById("dividendNextSettlement");
  const previewReleaseEl = document.getElementById("dividendPreviewRelease");
  const availableBalanceEl = document.getElementById("dividendAvailableBalance");
  const holderCountEl = document.getElementById("dividendHolderCount");
  const batchProgressEl = document.getElementById("dividendBatchProgress");
  const statusNoteEl = document.getElementById("dividendStatusNote");
  const releaseRuleEl = document.getElementById("dividendReleaseRule");
  const automationModeEl = document.getElementById("dividendAutomationMode");

  const vaultAbi = [
    "function nextSettlementAt() external view returns (uint256)",
    "function lastSettlementAt() external view returns (uint256)",
    "function lastReleaseAmount() external view returns (uint256)",
    "function totalReservedForClaims() external view returns (uint256)",
    "function previewNextRelease() external view returns (uint256)",
    "function settledEpochCount() external view returns (uint256)",
    "function activeEpochId() external view returns (uint256)",
    "function activeBatchCursor() external view returns (uint256)",
    "function activeBatchHolderCount() external view returns (uint256)",
    "function availableForNextSettlement() external view returns (uint256)"
  ];

  const registryAbi = [
    "function totalEligibleHolders() external view returns (uint256)",
    "function settlementLocked() external view returns (bool)",
    "function minimumSbtiBalance() external view returns (uint256)"
  ];

  function setText(element, value) {
    if (element) {
      element.textContent = value;
    }
  }

  function shortAddress(address) {
    if (!address) return "待部署";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  function formatBnb(value) {
    if (typeof window.ethers === "undefined") return value;
    const formatted = window.ethers.formatEther(value);
    const numeric = Number.parseFloat(formatted);

    if (!Number.isFinite(numeric)) {
      return `${formatted} BNB`;
    }

    if (numeric === 0) return "0 BNB";
    if (numeric < 0.0001) return "<0.0001 BNB";
    if (numeric < 1) return `${numeric.toFixed(4)} BNB`;
    return `${numeric.toFixed(3)} BNB`;
  }

  function formatDate(timestampSeconds) {
    if (!timestampSeconds || Number(timestampSeconds) === 0) {
      return "等待首次结算";
    }

    const date = new Date(Number(timestampSeconds) * 1000);
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  async function renderVaultState() {
    setText(releaseRuleEl, "每小时释放 20% 的可分配 BNB");
    setText(automationModeEl, "Automation / 任何人可触发");

    if (!config.vaultAddress) {
      setText(vaultAddressEl, "待部署");
      setText(registryAddressEl, config.registryAddress ? shortAddress(config.registryAddress) : "待部署");
      setText(nextSettlementEl, "待部署");
      setText(previewReleaseEl, "待部署");
      setText(availableBalanceEl, "待部署");
      setText(holderCountEl, "待部署");
      setText(batchProgressEl, "待部署");
      setText(
        statusNoteEl,
        "资金接收合约部署后，这里会直接显示链上的下一次结算时间、可分配 BNB、批次进度和合格持有人数量。"
      );
      return;
    }

    try {
      const provider = new window.ethers.JsonRpcProvider(config.rpcUrls[0], config.chainId);
      const vault = new window.ethers.Contract(config.vaultAddress, vaultAbi, provider);
      const registry =
        config.registryAddress && config.registryAddress !== "0x0000000000000000000000000000000000000000"
          ? new window.ethers.Contract(config.registryAddress, registryAbi, provider)
          : null;

      const [
        contractBalance,
        nextSettlementAt,
        previewNextRelease,
        availableForNextSettlement,
        activeEpochId,
        activeBatchCursor,
        activeBatchHolderCount,
        totalReservedForClaims,
        holderCount,
        settlementLocked
      ] = await Promise.all([
        provider.getBalance(config.vaultAddress),
        vault.nextSettlementAt(),
        vault.previewNextRelease(),
        vault.availableForNextSettlement(),
        vault.activeEpochId(),
        vault.activeBatchCursor(),
        vault.activeBatchHolderCount(),
        vault.totalReservedForClaims(),
        registry ? registry.totalEligibleHolders() : Promise.resolve(0n),
        registry ? registry.settlementLocked() : Promise.resolve(false)
      ]);

      setText(vaultAddressEl, shortAddress(config.vaultAddress));
      setText(registryAddressEl, config.registryAddress ? shortAddress(config.registryAddress) : "待部署");
      setText(nextSettlementEl, formatDate(nextSettlementAt));
      setText(previewReleaseEl, formatBnb(previewNextRelease));
      setText(
        availableBalanceEl,
        `${formatBnb(availableForNextSettlement)} / 余额 ${formatBnb(contractBalance)}`
      );
      setText(holderCountEl, holderCount === 0n ? "0 地址" : `${holderCount.toString()} 地址`);

      if (activeEpochId === 0n || activeBatchHolderCount === 0n) {
        setText(batchProgressEl, "当前没有未完成批次");
      } else {
        setText(
          batchProgressEl,
          `Epoch #${activeEpochId.toString()} · ${activeBatchCursor.toString()} / ${activeBatchHolderCount.toString()}`
        );
      }

      setText(
        statusNoteEl,
        settlementLocked
          ? `当前批次正在链上记账中，已锁定 ${formatBnb(totalReservedForClaims)} 待领取 BNB。`
          : `当前已预留 ${formatBnb(totalReservedForClaims)} 给已生成的分红批次，持有人可在链上 claim。`
      );
    } catch (error) {
      setText(vaultAddressEl, shortAddress(config.vaultAddress));
      setText(registryAddressEl, config.registryAddress ? shortAddress(config.registryAddress) : "待部署");
      setText(nextSettlementEl, "读取失败");
      setText(previewReleaseEl, "读取失败");
      setText(availableBalanceEl, "读取失败");
      setText(holderCountEl, "读取失败");
      setText(batchProgressEl, "读取失败");
      setText(statusNoteEl, `链上状态暂时读取失败：${error.message || String(error)}`);
    }
  }

  if (typeof window.ethers === "undefined") {
    return;
  }

  renderVaultState();
})();
