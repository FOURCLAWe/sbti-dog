(function () {
  const config = window.SBTI_NFT_CONFIG || {};
  const results = Array.isArray(window.SBTI_NFT_RESULTS) ? window.SBTI_NFT_RESULTS : [];
  const resultMap = new Map(results.map((item) => [item.code, item]));

  const connectWalletBtn = document.getElementById("connectWalletBtn");
  const mintNftBtn = document.getElementById("mintNftBtn");
  const nftResultMeta = document.getElementById("nftResultMeta");
  const nftContractMeta = document.getElementById("nftContractMeta");
  const mintStatus = document.getElementById("mintStatus");

  const abi = [
    "function mint(uint256 tokenId) external",
    "function hasMinted(address account, uint256 tokenId) external view returns (bool)",
    "function balanceOf(address account, uint256 id) external view returns (uint256)"
  ];

  let currentAccount = "";
  let currentResult = null;
  let mintInFlight = false;

  function hasWallet() {
    return typeof window.ethereum !== "undefined" && typeof window.ethers !== "undefined";
  }

  function setStatus(message, type) {
    mintStatus.textContent = message;
    mintStatus.className = type ? `mint-status ${type}` : "mint-status";
  }

  function getCurrentResultCode() {
    const title = document.getElementById("resultTypeName");
    if (!title) return "";
    const raw = title.textContent.trim();
    const match = raw.match(/^([A-Za-z0-9!_-]+(?:-[A-Za-z0-9!_-]+)?)/);
    return match ? match[1] : "";
  }

  function syncResultInfo() {
    const code = getCurrentResultCode();
    currentResult = resultMap.get(code) || null;

    if (!currentResult) {
      nftResultMeta.textContent = "答完题后，这里会显示当前结果对应的 NFT。";
      mintNftBtn.disabled = true;
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
    const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
    if (currentChainId === config.chainIdHex) return;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: config.chainIdHex }]
      });
    } catch (error) {
      if (error && error.code === 4902) {
        await window.ethereum.request({
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
      setStatus("没有检测到 EVM 钱包。请先安装 MetaMask 或其它兼容钱包。", "error");
      return;
    }

    const [account] = await window.ethereum.request({ method: "eth_requestAccounts" });
    currentAccount = account || "";
    connectWalletBtn.textContent = currentAccount
      ? `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}`
      : "连接钱包";
    await updateMintState();
  }

  async function updateMintState() {
    if (!currentResult || !currentAccount || !config.contractAddress || !hasWallet()) {
      mintNftBtn.disabled = true;
      return;
    }

    try {
      const provider = new window.ethers.BrowserProvider(window.ethereum);
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
      setStatus(`读取 mint 状态失败：${error.message || String(error)}`, "error");
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

      await connectWallet();
      await ensureBscNetwork();

      const provider = new window.ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new window.ethers.Contract(config.contractAddress, abi, signer);

      const tx = await contract.mint(currentResult.tokenId);
      const txUrl = config.explorerBaseUrl ? `${config.explorerBaseUrl}/tx/${tx.hash}` : "";
      setStatus(txUrl ? `交易已发送：${txUrl}` : `交易已发送：${tx.hash}`);

      await tx.wait();
      setStatus("Mint 成功，这枚结果 NFT 已经进你的钱包了。", "success");
      await updateMintState();
    } catch (error) {
      const message =
        error && typeof error === "object" && "shortMessage" in error
          ? error.shortMessage
          : error.message || String(error);
      setStatus(`Mint 失败：${message}`, "error");
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

  if (connectWalletBtn) {
    connectWalletBtn.addEventListener("click", connectWallet);
  }

  if (mintNftBtn) {
    mintNftBtn.addEventListener("click", mintCurrentResult);
  }

  if (hasWallet()) {
    window.ethereum.on("accountsChanged", (accounts) => {
      currentAccount = accounts[0] || "";
      connectWalletBtn.textContent = currentAccount
        ? `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}`
        : "连接钱包";
      updateMintState();
    });

    window.ethereum.on("chainChanged", () => {
      updateMintState();
    });
  }

  installHooks();
  syncResultInfo();
})();
