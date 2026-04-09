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
  const countdownEl = document.getElementById("dividendCountdown");
  const countdownHintEl = document.getElementById("dividendCountdownHint");
  const historyMetaEl = document.getElementById("dividendHistoryMeta");
  const historyListEl = document.getElementById("dividendHistoryList");

  let countdownTimer = null;

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
    "function availableForNextSettlement() external view returns (uint256)",
    "event SettlementOpened(uint256 indexed epochId, uint256 releaseAmount, uint256 holderCount, uint256 amountPerHolder, uint256 remainder, uint256 openedAt, uint256 nextSettlementAt)"
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

  function getNextNaturalHourTimestamp(nowMs = Date.now()) {
    const next = new Date(nowMs);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return Math.floor(next.getTime() / 1000);
  }

  function formatCountdown(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
      return "00:00:00";
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
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

  function startCountdown(targetResolver) {
    if (countdownTimer) {
      window.clearInterval(countdownTimer);
    }

    const tick = () => {
      const targetTimestamp = Number(targetResolver()) || getNextNaturalHourTimestamp();
      const nowSeconds = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, targetTimestamp - nowSeconds);
      setText(countdownEl, formatCountdown(remaining));
    };

    tick();
    countdownTimer = window.setInterval(tick, 1000);
  }

  function clearHistory() {
    if (!historyListEl) return;
    historyListEl.innerHTML = "";
  }

  function renderHistory(historyItems) {
    if (!historyListEl) return;

    clearHistory();
    setText(historyMetaEl, historyItems.length > 0 ? `${historyItems.length} 条` : "");

    historyItems.forEach((item) => {
      const card = document.createElement("div");
      card.className = "engine-history-item";

      const topRow = document.createElement("div");
      topRow.className = "engine-history-row";

      const topCopy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `Epoch #${item.epochId}`;
      const time = document.createElement("span");
      time.textContent = formatDate(item.openedAt);
      topCopy.append(title, time);

      const amount = document.createElement("div");
      amount.className = "engine-history-amount";
      amount.textContent = formatBnb(item.releaseAmount);

      topRow.append(topCopy, amount);

      const bottomRow = document.createElement("div");
      bottomRow.className = "engine-history-row";

      const holderInfo = document.createElement("span");
      holderInfo.textContent = `${item.holderCount} 个地址参与本轮`;

      const unitInfo = document.createElement("span");
      unitInfo.textContent = `人均 ${formatBnb(item.amountPerHolder)}`;

      bottomRow.append(holderInfo, unitInfo);
      card.append(topRow, bottomRow);
      historyListEl.append(card);
    });
  }

  async function readSettlementHistory(vault, provider) {
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 120000);
    const events = await vault.queryFilter(vault.filters.SettlementOpened(), fromBlock, latestBlock);

    return events
      .slice(-6)
      .reverse()
      .map((event) => ({
        epochId: Number(event.args?.epochId ?? event.args?.[0] ?? 0),
        releaseAmount: event.args?.releaseAmount ?? event.args?.[1] ?? 0n,
        holderCount: Number(event.args?.holderCount ?? event.args?.[2] ?? 0),
        amountPerHolder: event.args?.amountPerHolder ?? event.args?.[3] ?? 0n,
        openedAt: Number(event.args?.openedAt ?? event.args?.[5] ?? 0)
      }));
  }

  async function renderVaultState() {
    let countdownTarget = getNextNaturalHourTimestamp();

    setText(releaseRuleEl, "每小时释放 20% 的可分配 BNB");
    setText(automationModeEl, "Automation / 任何人可触发");
    setText(countdownHintEl, "每个自然小时都会重新开始倒计时。");
    renderHistory([]);
    startCountdown(() => countdownTarget);

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

    if (typeof window.ethers === "undefined") {
      setText(vaultAddressEl, shortAddress(config.vaultAddress));
      setText(registryAddressEl, config.registryAddress ? shortAddress(config.registryAddress) : "待部署");
      setText(nextSettlementEl, "依赖未加载");
      setText(previewReleaseEl, "依赖未加载");
      setText(availableBalanceEl, "依赖未加载");
      setText(holderCountEl, "依赖未加载");
      setText(batchProgressEl, "依赖未加载");
      setText(statusNoteEl, "页面缺少链上读取依赖，暂时无法拉取实时分红状态。");
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
        settlementLocked,
        historyItems
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
        registry ? registry.settlementLocked() : Promise.resolve(false),
        readSettlementHistory(vault, provider).catch(() => [])
      ]);

      countdownTarget = Number(nextSettlementAt) > 0 ? Number(nextSettlementAt) : countdownTarget;
      startCountdown(() => countdownTarget);

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
      setText(
        countdownHintEl,
        Number(nextSettlementAt) > 0 ? `链上登记的下次结算时间：${formatDate(nextSettlementAt)}` : "每个自然小时都会重新开始倒计时。"
      );
      renderHistory(historyItems);
    } catch (error) {
      setText(vaultAddressEl, shortAddress(config.vaultAddress));
      setText(registryAddressEl, config.registryAddress ? shortAddress(config.registryAddress) : "待部署");
      setText(nextSettlementEl, "读取失败");
      setText(previewReleaseEl, "读取失败");
      setText(availableBalanceEl, "读取失败");
      setText(holderCountEl, "读取失败");
      setText(batchProgressEl, "读取失败");
      setText(statusNoteEl, `链上状态暂时读取失败：${error.message || String(error)}`);
      setText(countdownHintEl, "倒计时仍按自然整点运行，链上状态稍后会自动重读。");
    }
  }

  renderVaultState();
})();
