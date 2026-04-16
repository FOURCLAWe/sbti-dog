(function () {
  const config = window.SBTI_AIRDROP_CONFIG || {};

  const connectBtn = document.getElementById("connectAirdropWalletBtn");
  const claimBtn = document.getElementById("claimAirdropBtn");
  const walletMetaEl = document.getElementById("airdropWalletMeta");
  const nftBalanceEl = document.getElementById("airdropNftBalance");
  const eligibilityEl = document.getElementById("airdropEligibility");
  const claimStateEl = document.getElementById("airdropClaimState");
  const claimMetaEl = document.getElementById("airdropClaimMeta");
  const contractMetaEl = document.getElementById("airdropContractMeta");
  const tokenMetaEl = document.getElementById("airdropTokenMeta");
  const nftMetaEl = document.getElementById("airdropNftMeta");
  const claimAmountMetaEl = document.getElementById("airdropClaimAmountMeta");
  const contractBalanceEl = document.getElementById("airdropContractBalance");
  const heroAmountEl = document.getElementById("airdropHeroAmount");
  const heroSymbolEl = document.getElementById("airdropHeroSymbol");
  const statusEl = document.getElementById("airdropStatus");

  const nftAbi = [
    "function balanceOf(address account, uint256 id) external view returns (uint256)",
    "function balanceOfBatch(address[] accounts, uint256[] ids) external view returns (uint256[])"
  ];

  const airdropAbi = [
    "function claim() external",
    "function claimEnabled() external view returns (bool)",
    "function claimAmount() external view returns (uint256)",
    "function claimed(address account) external view returns (bool)",
    "function isEligible(address account) external view returns (bool)",
    "function nftBalance(address account) external view returns (uint256)"
  ];

  const tokenAbi = [
    "function balanceOf(address account) external view returns (uint256)",
    "function symbol() external view returns (string)"
  ];

  let currentAccount = "";
  let claimInFlight = false;

  function getWalletProvider() {
    const candidates = [];

    if (window.ethereum) {
      if (Array.isArray(window.ethereum.providers)) {
        candidates.push(...window.ethereum.providers);
      }
      candidates.push(window.ethereum);
    }

    if (window.BinanceChain) candidates.push(window.BinanceChain);
    if (window.okxwallet) candidates.push(window.okxwallet);
    if (window.coinbaseWalletExtension) candidates.push(window.coinbaseWalletExtension);

    const unique = [...new Set(candidates)].filter((provider) => provider && typeof provider.request === "function");

    return (
      unique.find(
        (provider) =>
          provider.isMetaMask ||
          provider.isOkxWallet ||
          provider.isCoinbaseWallet ||
          provider.isBinance ||
          provider.isBinanceChain
      ) || unique[0] || null
    );
  }

  function hasWallet() {
    return Boolean(getWalletProvider()) && typeof window.ethers !== "undefined";
  }

  function shortAddress(address) {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "待配置";
  }

  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = type ? `status ${type}` : "status";
  }

  function formatAmount(value, decimals = Number(config.tokenDecimals || 18), precision = 0) {
    if (typeof window.ethers === "undefined") return String(value);

    const formatted = window.ethers.formatUnits(value, decimals);
    const numeric = Number.parseFloat(formatted);

    if (!Number.isFinite(numeric)) return formatted;
    if (precision === 0) return numeric.toLocaleString("en-US", { maximumFractionDigits: 0 });
    return numeric.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: precision
    });
  }

  function getConfiguredClaimDisplay() {
    if (config.claimAmountDisplay) {
      return `${config.claimAmountDisplay} ${config.tokenSymbol || "SBTI"}`;
    }

    if (config.claimAmount) {
      return `${formatAmount(config.claimAmount, Number(config.tokenDecimals || 18), 0)} ${config.tokenSymbol || "SBTI"}`;
    }

    return `200,000 ${config.tokenSymbol || "SBTI"}`;
  }

  async function getCurrentChainId() {
    const provider = getWalletProvider();
    if (!provider) return "";
    return provider.request({ method: "eth_chainId" });
  }

  async function ensureExpectedNetwork() {
    const walletProvider = getWalletProvider();
    if (!walletProvider) return false;

    const currentChainId = await getCurrentChainId();
    if (currentChainId === config.chainIdHex) {
      return true;
    }

    try {
      await walletProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: config.chainIdHex }]
      });
      return true;
    } catch (switchError) {
      if (switchError && switchError.code === 4902) {
        await walletProvider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: config.chainIdHex,
              chainName: config.chainName,
              nativeCurrency: config.nativeCurrency,
              rpcUrls: config.rpcUrls,
              blockExplorerUrls: config.blockExplorerUrls
            }
          ]
        });
        return true;
      }

      throw switchError;
    }
  }

  function getErrorMessage(error) {
    if (!error) return "未知错误";
    if (typeof error === "string") return error;
    if (typeof error === "object") {
      if ("shortMessage" in error && error.shortMessage) return error.shortMessage;
      if ("reason" in error && error.reason) return error.reason;
      if ("message" in error && error.message) return error.message;
    }
    return String(error);
  }

  async function readWalletNftBalance(provider, account) {
    if (!config.nftContractAddress) return 0n;

    const nftContract = new window.ethers.Contract(config.nftContractAddress, nftAbi, provider);
    const tokenIds = Array.from({ length: 27 }, (_, index) => BigInt(index + 1));

    try {
      const balances = await nftContract.balanceOfBatch(
        tokenIds.map(() => account),
        tokenIds
      );
      return balances.reduce((sum, balance) => sum + balance, 0n);
    } catch (batchError) {
      const balances = await Promise.all(
        tokenIds.map((tokenId) => nftContract.balanceOf(account, tokenId))
      );
      return balances.reduce((sum, balance) => sum + balance, 0n);
    }
  }

  function applyStaticConfig() {
    if (claimAmountMetaEl) claimAmountMetaEl.textContent = getConfiguredClaimDisplay();
    if (heroAmountEl) {
      heroAmountEl.textContent = config.claimAmountDisplay || formatAmount(config.claimAmount || "0", Number(config.tokenDecimals || 18), 0);
    }
    if (heroSymbolEl) {
      heroSymbolEl.textContent = `${config.tokenSymbol || "SBTI"} / 每个合格钱包可领取一次。资格只认链上 SBTI NFT 持仓，不认站内截图。`;
    }
    if (contractMetaEl) {
      contractMetaEl.textContent = config.airdropContractAddress ? shortAddress(config.airdropContractAddress) : "待配置";
    }
    if (tokenMetaEl) {
      tokenMetaEl.textContent = config.tokenAddress ? shortAddress(config.tokenAddress) : "待配置";
    }
    if (nftMetaEl) {
      nftMetaEl.textContent = config.nftContractAddress ? shortAddress(config.nftContractAddress) : "待配置";
    }
    if (contractBalanceEl) {
      contractBalanceEl.textContent = config.airdropContractAddress && config.tokenAddress ? "读取中..." : "待配置";
    }
  }

  function resetDisconnectedState() {
    if (walletMetaEl) walletMetaEl.textContent = hasWallet() ? "尚未连接" : "未检测到钱包";
    if (nftBalanceEl) nftBalanceEl.textContent = "未检测";
    if (eligibilityEl) eligibilityEl.textContent = "待连接";
    if (claimStateEl) claimStateEl.textContent = "待连接";
    if (claimMetaEl) {
      claimMetaEl.textContent = hasWallet()
        ? "连接钱包后，这里会显示你是否持有任意 SBTI NFT，以及当前地址是否还能领取这份空投。"
        : "当前浏览器没有检测到可用的 EVM 钱包。请在 MetaMask、OKX 或 Binance Wallet 的内置浏览器中打开，或在桌面浏览器安装钱包扩展。";
    }

    if (connectBtn) {
      connectBtn.textContent = hasWallet() ? "连接钱包" : "未检测到钱包";
    }

    if (claimBtn) {
      claimBtn.disabled = true;
    }
  }

  async function refreshState() {
    applyStaticConfig();

    if (!hasWallet()) {
      resetDisconnectedState();
      setStatus("当前浏览器没有检测到可用的 EVM 钱包。", "error");
      return;
    }

    if (!currentAccount) {
      resetDisconnectedState();
      setStatus("", "");
      return;
    }

    const rpcProvider = new window.ethers.JsonRpcProvider(config.rpcUrls[0], config.chainId);

    try {
      const walletNftBalance = await readWalletNftBalance(rpcProvider, currentAccount);
      const hasEligibleNft = walletNftBalance > 0n;

      if (walletMetaEl) walletMetaEl.textContent = shortAddress(currentAccount);
      if (connectBtn) connectBtn.textContent = shortAddress(currentAccount);
      if (nftBalanceEl) nftBalanceEl.textContent = `${walletNftBalance.toString()} 枚`;
      if (eligibilityEl) eligibilityEl.textContent = hasEligibleNft ? "符合条件" : "未持有 NFT";

      if (!config.airdropContractAddress || !config.tokenAddress) {
        if (claimStateEl) claimStateEl.textContent = "待开启";
        if (claimMetaEl) {
          claimMetaEl.textContent = hasEligibleNft
            ? "当前钱包已经持有 SBTI NFT，但空投合约和代币地址还没有配置完成。"
            : "当前钱包还没有持有任何 SBTI NFT，因此即使空投合约上线也无法领取。";
        }
        if (claimBtn) claimBtn.disabled = true;
        if (contractBalanceEl) contractBalanceEl.textContent = "待配置";
        setStatus("空投合约地址或 SBTI 代币地址尚未配置，页面暂时处于待开启状态。", "");
        return;
      }

      const airdropContract = new window.ethers.Contract(config.airdropContractAddress, airdropAbi, rpcProvider);
      const tokenContract = new window.ethers.Contract(config.tokenAddress, tokenAbi, rpcProvider);

      const [claimEnabled, hasClaimed, claimAmount, contractBalance] = await Promise.all([
        airdropContract.claimEnabled(),
        airdropContract.claimed(currentAccount),
        airdropContract.claimAmount(),
        tokenContract.balanceOf(config.airdropContractAddress)
      ]);

      if (claimAmountMetaEl) {
        claimAmountMetaEl.textContent = `${formatAmount(claimAmount, Number(config.tokenDecimals || 18), 0)} ${config.tokenSymbol || "SBTI"}`;
      }
      if (contractBalanceEl) {
        contractBalanceEl.textContent = `${formatAmount(contractBalance, Number(config.tokenDecimals || 18), 0)} ${config.tokenSymbol || "SBTI"}`;
      }

      const enoughBalance = contractBalance >= claimAmount;
      const expectedNetwork = (await getCurrentChainId()) === config.chainIdHex;

      if (claimStateEl) {
        if (hasClaimed) {
          claimStateEl.textContent = "已领取";
        } else if (!claimEnabled) {
          claimStateEl.textContent = "未开启";
        } else if (!enoughBalance) {
          claimStateEl.textContent = "余额不足";
        } else {
          claimStateEl.textContent = "可领取";
        }
      }

      if (claimMetaEl) {
        if (!hasEligibleNft) {
          claimMetaEl.textContent = "当前钱包没有持有任意 SBTI NFT，因此不在这次空投资格范围内。";
        } else if (hasClaimed) {
          claimMetaEl.textContent = `当前钱包已经领取过这份 ${getConfiguredClaimDisplay()} 空投。`;
        } else if (!claimEnabled) {
          claimMetaEl.textContent = "空投合约已经部署，但管理员还没有打开领取开关。";
        } else if (!enoughBalance) {
          claimMetaEl.textContent = "空投合约当前代币余额不足，暂时还不能完成这次领取。";
        } else if (!expectedNetwork) {
          claimMetaEl.textContent = `当前钱包不在 ${config.chainName}，先切到正确网络后再领取。`;
        } else {
          claimMetaEl.textContent = `当前钱包已经符合条件，可直接领取 ${getConfiguredClaimDisplay()}。`;
        }
      }

      if (claimBtn) {
        claimBtn.disabled = claimInFlight || !hasEligibleNft || hasClaimed || !claimEnabled || !enoughBalance || !expectedNetwork;
      }

      setStatus("", "");
    } catch (error) {
      if (claimStateEl) claimStateEl.textContent = "读取失败";
      if (claimMetaEl) claimMetaEl.textContent = "链上状态暂时读取失败，请稍后再试。";
      if (contractBalanceEl) contractBalanceEl.textContent = "读取失败";
      if (claimBtn) claimBtn.disabled = true;
      setStatus(`读取空投状态失败：${getErrorMessage(error)}`, "error");
    }
  }

  async function connectWallet() {
    if (!hasWallet()) {
      setStatus("当前浏览器没有检测到可用的 EVM 钱包。", "error");
      return;
    }

    const walletProvider = getWalletProvider();

    try {
      const accounts = await walletProvider.request({ method: "eth_requestAccounts" });
      currentAccount = (accounts && accounts[0]) || "";
      await refreshState();
    } catch (error) {
      setStatus(`连接钱包失败：${getErrorMessage(error)}`, "error");
    }
  }

  async function claimAirdrop() {
    if (claimInFlight) return;
    if (!currentAccount) {
      setStatus("请先连接钱包。", "error");
      return;
    }
    if (!config.airdropContractAddress || !config.tokenAddress) {
      setStatus("空投合约还没有配置完成。", "error");
      return;
    }

    try {
      const networkReady = await ensureExpectedNetwork();
      if (!networkReady) {
        setStatus(`请先切到 ${config.chainName}。`, "error");
        return;
      }
    } catch (error) {
      setStatus(`切换网络失败：${getErrorMessage(error)}`, "error");
      return;
    }

    claimInFlight = true;
    if (claimBtn) claimBtn.disabled = true;
    setStatus("领取交易已发起，等待链上确认。", "");

    try {
      const browserProvider = new window.ethers.BrowserProvider(getWalletProvider());
      const signer = await browserProvider.getSigner();
      const contract = new window.ethers.Contract(config.airdropContractAddress, airdropAbi, signer);
      const tx = await contract.claim();
      setStatus(`交易已提交：${tx.hash}`, "");
      await tx.wait();
      setStatus(`领取成功，${getConfiguredClaimDisplay()} 已发送到当前钱包。`, "success");
      await refreshState();
    } catch (error) {
      const message = getErrorMessage(error);
      setStatus(`领取失败：${message}`, "error");
      await refreshState();
    } finally {
      claimInFlight = false;
    }
  }

  function bindWalletEvents() {
    const walletProvider = getWalletProvider();
    if (!walletProvider || typeof walletProvider.on !== "function") return;

    walletProvider.on("accountsChanged", (accounts) => {
      currentAccount = (accounts && accounts[0]) || "";
      refreshState();
    });

    walletProvider.on("chainChanged", () => {
      refreshState();
    });
  }

  async function hydrateExistingWallet() {
    const walletProvider = getWalletProvider();
    if (!walletProvider) return;

    try {
      const accounts = await walletProvider.request({ method: "eth_accounts" });
      currentAccount = (accounts && accounts[0]) || "";
      if (currentAccount) {
        await refreshState();
      }
    } catch (error) {
      // Ignore silent hydration failures and keep the page usable.
    }
  }

  if (connectBtn) connectBtn.addEventListener("click", connectWallet);
  if (claimBtn) claimBtn.addEventListener("click", claimAirdrop);

  applyStaticConfig();
  resetDisconnectedState();
  bindWalletEvents();
  hydrateExistingWallet();
})();
