(function () {
  const config = window.SBTI_NFT_CONFIG || {};
  const results = Array.isArray(window.SBTI_NFT_RESULTS) ? window.SBTI_NFT_RESULTS : [];
  const resultMap = new Map(results.map((item) => [item.code, item]));

  const connectWalletBtn = document.getElementById("connectWalletBtn");
  const mintNftBtn = document.getElementById("mintNftBtn");
  const nftResultMeta = document.getElementById("nftResultMeta");
  const nftContractMeta = document.getElementById("nftContractMeta");
  const mintStatus = document.getElementById("mintStatus");
  const resultScreen = document.getElementById("result");
  const resultTypeName = document.getElementById("resultTypeName");
  const submitBtn = document.getElementById("submitBtn");
  const restartBtn = document.getElementById("restartBtn");
  const startBtn = document.getElementById("startBtn");
  const toTopBtn = document.getElementById("toTopBtn");

  const abi = [
    "function mint(uint256 tokenId) external",
    "function hasMinted(address account, uint256 tokenId) external view returns (bool)",
    "function balanceOf(address account, uint256 id) external view returns (uint256)"
  ];

  let currentAccount = "";
  let currentResult = null;
  let mintInFlight = false;

  function getWalletProvider() {
    const candidates = [];

    if (window.ethereum) {
      if (Array.isArray(window.ethereum.providers)) {
        candidates.push(...window.ethereum.providers);
      }
      candidates.push(window.ethereum);
    }

    if (window.BinanceChain) {
      candidates.push(window.BinanceChain);
    }

    if (window.okxwallet) {
      candidates.push(window.okxwallet);
    }

    if (window.coinbaseWalletExtension) {
      candidates.push(window.coinbaseWalletExtension);
    }

    const uniqueCandidates = [...new Set(candidates)].filter(
      (provider) => provider && typeof provider.request === "function"
    );

    if (!uniqueCandidates.length) {
      return null;
    }

    return (
      uniqueCandidates.find(
        (provider) =>
          provider.isMetaMask ||
          provider.isOkxWallet ||
          provider.isCoinbaseWallet ||
          provider.isBinance ||
          provider.isBinanceChain
      ) || uniqueCandidates[0]
    );
  }

  function hasWallet() {
    return Boolean(getWalletProvider()) && typeof window.ethers !== "undefined";
  }

  function setStatus(message, type) {
    mintStatus.textContent = message;
    mintStatus.className = type ? `mint-status ${type}` : "mint-status";
  }

  function formatWalletHint() {
    return "当前浏览器没有检测到可用的 EVM 钱包。请在 MetaMask、OKX 或 Binance Wallet 的内置浏览器中打开，或在桌面浏览器安装钱包扩展。";
  }

  function formatWrongNetworkHint() {
    return `当前钱包不在 ${config.chainName || "BSC 主网"}。先切到 BSC，再 mint 这枚 NFT。`;
  }

  async function getCurrentChainId() {
    const walletProvider = getWalletProvider();
    if (!walletProvider) return "";
    return walletProvider.request({ method: "eth_chainId" });
  }

  async function isExpectedNetwork() {
    const currentChainId = await getCurrentChainId();
    return currentChainId === config.chainIdHex;
  }

  function getErrorMessage(error) {
    if (!error) return "未知错误";

    if (typeof error === "string") {
      return error;
    }

    if (typeof error === "object") {
      if ("shortMessage" in error && error.shortMessage) {
        return error.shortMessage;
      }
      if ("message" in error && error.message) {
        return error.message;
      }
    }

    return String(error);
  }

  function getCurrentResultCode() {
    if (!resultTypeName) return "";
    const raw = resultTypeName.textContent.trim();
    const match = raw.match(/^([A-Za-z0-9!_-]+(?:-[A-Za-z0-9!_-]+)?)/);
    return match ? match[1] : "";
  }

  function resetResultInfo() {
    currentResult = null;
    nftResultMeta.textContent = "答完题后，这里会显示当前结果对应的 NFT。";
    nftContractMeta.textContent = config.contractAddress
      ? `合约地址：${config.contractAddress}`
      : "Mint 尚未启用：前端还没有配置合约地址。";
    mintNftBtn.disabled = true;
  }

  function syncResultInfo() {
    if (!resultScreen || !resultScreen.classList.contains("active")) {
      resetResultInfo();
      return;
    }

    const code = getCurrentResultCode();
    currentResult = resultMap.get(code) || null;

    if (!currentResult) {
      resetResultInfo();
      return;
    }

    nftResultMeta.textContent = `当前结果 NFT：#${currentResult.tokenId} ${currentResult.code}（${currentResult.cn}）`;

    if (!config.contractAddress || !config.mintEnabled) {
      nftContractMeta.textContent = "Mint 尚未启用：前端还没有配置合约地址。";
      mintNftBtn.disabled = true;
      return;
    }

    nftContractMeta.textContent = `合约地址：${config.contractAddress}`;
    updateMintState();
  }

  async function ensureBscNetwork() {
    const walletProvider = getWalletProvider();
    if (!walletProvider) {
      throw new Error(formatWalletHint());
    }

    const currentChainId = await walletProvider.request({ method: "eth_chainId" });
    if (currentChainId === config.chainIdHex) return;

    try {
      await walletProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: config.chainIdHex }]
      });
    } catch (error) {
      if (error && error.code === 4902) {
        await walletProvider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: config.chainIdHex,
              chainName: config.chainName,
              rpcUrls: config.rpcUrls,
              blockExplorerUrls: config.blockExplorerUrls,
              nativeCurrency: config.nativeCurrency
            }
          ]
        });
        return;
      }

      throw error;
    }
  }

  async function connectWallet() {
    if (!hasWallet()) {
      setStatus(formatWalletHint(), "error");
      return false;
    }

    const walletProvider = getWalletProvider();
    setStatus("正在请求钱包授权...");

    try {
      const [account] = await walletProvider.request({ method: "eth_requestAccounts" });
      currentAccount = account || "";
      connectWalletBtn.textContent = currentAccount
        ? `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}`
        : "连接钱包";

      if (!currentAccount) {
        setStatus("钱包已连接，但没有返回可用地址。", "error");
        return false;
      }

      await updateMintState();
      return true;
    } catch (error) {
      setStatus(`连接钱包失败：${getErrorMessage(error)}`, "error");
      return false;
    }
  }

  async function updateMintState() {
    if (!currentResult || !config.contractAddress) {
      mintNftBtn.disabled = true;
      return;
    }

    if (!hasWallet()) {
      mintNftBtn.disabled = true;
      setStatus(formatWalletHint(), "error");
      return;
    }

    if (!currentAccount) {
      mintNftBtn.disabled = true;
      setStatus("检测到钱包后，先点“连接钱包”，再 mint 当前结果。");
      return;
    }

    if (!(await isExpectedNetwork())) {
      mintNftBtn.disabled = mintInFlight ? true : false;
      setStatus(formatWrongNetworkHint(), "error");
      return;
    }

    try {
      const walletProvider = getWalletProvider();
      const provider = new window.ethers.BrowserProvider(walletProvider);
      const contract = new window.ethers.Contract(config.contractAddress, abi, provider);
      const minted = await contract.hasMinted(currentAccount, currentResult.tokenId);
      const balance = await contract.balanceOf(currentAccount, currentResult.tokenId);

      if (minted || balance > 0n) {
        mintNftBtn.disabled = true;
        setStatus("这个结果 NFT 你已经 mint 过了。", "success");
        return;
      }

      mintNftBtn.disabled = mintInFlight ? true : false;
      if (!mintInFlight) {
        setStatus("当前结果可以 mint，一次 mint 一枚。");
      }
    } catch (error) {
      mintNftBtn.disabled = true;
      setStatus(`读取 mint 状态失败：${getErrorMessage(error)}`, "error");
    }
  }

  async function mintCurrentResult() {
    if (!currentResult) {
      setStatus("还没有拿到测试结果。", "error");
      return;
    }

    if (!config.contractAddress || !config.mintEnabled) {
      setStatus("Mint 尚未启用，先部署合约并把地址写入前端配置。", "error");
      return;
    }

    try {
      mintInFlight = true;
      mintNftBtn.disabled = true;
      setStatus("正在连接 BSC 并发起 mint...");

      const connected = await connectWallet();
      if (!connected) {
        return;
      }

      await ensureBscNetwork();

      const walletProvider = getWalletProvider();
      const provider = new window.ethers.BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const contract = new window.ethers.Contract(config.contractAddress, abi, signer);

      const tx = await contract.mint(currentResult.tokenId);
      const txUrl = config.explorerBaseUrl ? `${config.explorerBaseUrl}/tx/${tx.hash}` : "";
      setStatus(txUrl ? `交易已发送：${txUrl}` : `交易已发送：${tx.hash}`);

      await tx.wait();
      setStatus("Mint 成功，这枚结果 NFT 已经进你的钱包了。", "success");
      await updateMintState();
    } catch (error) {
      setStatus(`Mint 失败：${getErrorMessage(error)}`, "error");
      mintNftBtn.disabled = false;
    } finally {
      mintInFlight = false;
    }
  }

  function installHooks() {
    const originalRenderResult = window.renderResult;
    if (typeof originalRenderResult === "function") {
      window.renderResult = function patchedRenderResult() {
        const result = originalRenderResult.apply(this, arguments);
        window.setTimeout(syncResultInfo, 0);
        return result;
      };
    }
  }

  function installObservers() {
    if (resultTypeName && typeof MutationObserver !== "undefined") {
      const titleObserver = new MutationObserver(() => {
        window.setTimeout(syncResultInfo, 0);
      });
      titleObserver.observe(resultTypeName, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    if (resultScreen && typeof MutationObserver !== "undefined") {
      const screenObserver = new MutationObserver(() => {
        window.setTimeout(syncResultInfo, 0);
      });
      screenObserver.observe(resultScreen, {
        attributes: true,
        attributeFilter: ["class"]
      });
    }
  }

  if (connectWalletBtn) {
    connectWalletBtn.addEventListener("click", connectWallet);
  }

  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      window.setTimeout(syncResultInfo, 0);
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener("click", resetResultInfo);
  }

  if (startBtn) {
    startBtn.addEventListener("click", resetResultInfo);
  }

  if (toTopBtn) {
    toTopBtn.addEventListener("click", resetResultInfo);
  }

  if (mintNftBtn) {
    mintNftBtn.addEventListener("click", mintCurrentResult);
  }

  const walletProvider = getWalletProvider();
  if (walletProvider && typeof walletProvider.on === "function") {
    walletProvider.on("accountsChanged", (accounts) => {
      currentAccount = accounts[0] || "";
      connectWalletBtn.textContent = currentAccount
        ? `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}`
        : "连接钱包";
      updateMintState();
    });

    walletProvider.on("chainChanged", () => {
      updateMintState();
    });
  }

  installHooks();
  installObservers();
  syncResultInfo();
})();
