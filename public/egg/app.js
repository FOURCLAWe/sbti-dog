const revealItems = document.querySelectorAll(".reveal");

const marketSnapshots = [
  {
    price: 0.248,
    change: 12.4,
    points: [110, 126, 122, 136, 144, 140, 150, 164, 160, 176, 188, 184, 198, 214, 208, 224]
  },
  {
    price: 0.261,
    change: 18.1,
    points: [102, 116, 120, 118, 132, 146, 142, 158, 170, 182, 178, 194, 206, 212, 228, 240]
  },
  {
    price: 0.237,
    change: 9.7,
    points: [124, 120, 130, 142, 138, 150, 146, 158, 170, 164, 178, 190, 184, 198, 208, 202]
  }
];

const state = {
  mint: 1,
  hatch: 3,
  trade: 120,
  tradeSide: "buy",
  snapshotIndex: 0,
  accountTab: "items",
  nftSearch: ""
};

const TEMPO_CHAIN = {
  chainId: "0x1079",
  chainName: "Tempo Mainnet",
  nativeCurrency: {
    name: "Tempo",
    symbol: "TEMPO",
    decimals: 18
  },
  rpcUrls: ["https://rpc.tempo.xyz"],
  blockExplorerUrls: ["https://explore.mainnet.tempo.xyz"]
};

// Fill these in later to switch the account page from preview mode to live on-chain balances.
const EGG_CONTRACTS = {
  nftAddress: "",
  tokenAddress: "",
  tokenDecimals: 18
};

const walletState = {
  account: "",
  chainId: "",
  balance: "-",
  eggNfts: "-",
  eggNftsNote: "Connect to view holdings.",
  eggNftIds: [],
  eggToken: "-",
  eggTokenNote: "Connect to view holdings.",
  previewHoldings: false,
  connecting: false
};

function setupReveal() {
  if (!revealItems.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 }
  );

  revealItems.forEach((item) => observer.observe(item));
}

function setYear() {
  const yearNode = document.querySelector("#year");
  if (yearNode) yearNode.textContent = String(new Date().getFullYear());
}

function formatCompact(value, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function formatCurrency(value, digits = 3) {
  return `$${value.toFixed(digits)}`;
}

function getWalletProvider() {
  return typeof window !== "undefined" ? window.ethereum : undefined;
}

function shortenAddress(address) {
  if (!address) return "Wallet not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getWalletAvatar(address) {
  if (!address) return "EG";
  return `${address.slice(2, 4)}${address.slice(-2)}`.toUpperCase();
}

function getChainLabel(chainId) {
  if (!chainId) return "Tempo Mainnet";
  if (chainId.toLowerCase() === TEMPO_CHAIN.chainId) return TEMPO_CHAIN.chainName;

  const chainNumber = Number.parseInt(chainId, 16);
  return Number.isNaN(chainNumber) ? chainId : `Chain ${chainNumber}`;
}

function formatNativeBalance(hexValue) {
  if (!hexValue) return "-";

  try {
    const wei = BigInt(hexValue);
    const decimals = 10n ** 18n;
    const whole = wei / decimals;
    const fraction = ((wei % decimals) * 100n) / decimals;
    return `${whole.toString()}.${fraction.toString().padStart(2, "0")} TEMPO`;
  } catch (error) {
    console.error("Unable to format balance", error);
    return "-";
  }
}

function formatTokenBalance(rawValue, decimals = 18, precision = 2) {
  if (rawValue === undefined || rawValue === null) return "-";

  const balance = typeof rawValue === "bigint" ? rawValue : BigInt(rawValue);
  if (decimals <= 0) return balance.toString();

  const divisor = 10n ** BigInt(decimals);
  const whole = balance / divisor;
  const fraction = (balance % divisor).toString().padStart(decimals, "0");
  const trimmed = fraction.slice(0, precision).replace(/0+$/, "");

  return trimmed ? `${whole.toString()}.${trimmed}` : whole.toString();
}

function isConfiguredAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function encodeAddressParam(address) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function encodeUintParam(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function parseHexResult(hexValue) {
  if (!hexValue || hexValue === "0x") return 0n;
  return BigInt(hexValue);
}

function buildBalanceOfCall(address) {
  return `0x70a08231${encodeAddressParam(address)}`;
}

function buildTokenOfOwnerByIndexCall(address, index) {
  return `0x2f745c59${encodeAddressParam(address)}${encodeUintParam(index)}`;
}

function buildDecimalsCall() {
  return "0x313ce567";
}

async function callContract(provider, to, data) {
  return provider.request({
    method: "eth_call",
    params: [{ to, data }, "latest"]
  });
}

async function readTokenDecimals(provider) {
  if (!isConfiguredAddress(EGG_CONTRACTS.tokenAddress)) return EGG_CONTRACTS.tokenDecimals;

  try {
    const result = await callContract(provider, EGG_CONTRACTS.tokenAddress, buildDecimalsCall());
    return Number(parseHexResult(result));
  } catch (error) {
    console.error("Unable to read token decimals", error);
    return EGG_CONTRACTS.tokenDecimals;
  }
}

function createHoldingState(overrides = {}) {
  return {
    eggNfts: "-",
    eggNftsNote: "Connect to view holdings.",
    eggNftIds: [],
    eggToken: "-",
    eggTokenNote: "Connect to view holdings.",
    previewHoldings: false,
    ...overrides
  };
}

function createPreviewHoldings(address) {
  const seedParts = address
    .slice(2)
    .match(/.{1,4}/g)
    ?.map((part) => Number.parseInt(part, 16) || 0) || [404, 132];
  const nftCount = (seedParts[0] % 5) + 3;
  const tokenIds = new Set();
  let cursor = 0;

  while (tokenIds.size < nftCount) {
    const value =
      ((seedParts[cursor % seedParts.length] * 97 +
        seedParts[(cursor + 1) % seedParts.length] * 31 +
        cursor * 211) %
        13200) +
      1;
    tokenIds.add(value);
    cursor += 1;
  }

  const orderedIds = Array.from(tokenIds).sort((left, right) => left - right);
  const previewBalance = ((seedParts.reduce((sum, item) => sum + item, 0) % 9400) / 100 + 1).toFixed(2);

  return createHoldingState({
    eggNfts: formatCompact(orderedIds.length),
    eggNftsNote: "Preview IDs until live Egg NFT contracts are connected.",
    eggNftIds: orderedIds,
    eggToken: previewBalance,
    eggTokenNote: "Preview balance until the live $EGG token contract is connected.",
    previewHoldings: true
  });
}

async function fetchWalletHoldings(provider, address) {
  const nftConfigured = isConfiguredAddress(EGG_CONTRACTS.nftAddress);
  const tokenConfigured = isConfiguredAddress(EGG_CONTRACTS.tokenAddress);

  if (!nftConfigured && !tokenConfigured) {
    return createPreviewHoldings(address);
  }

  const nextHoldings = createHoldingState({
    eggNfts: "0",
    eggNftsNote: nftConfigured
      ? "No Egg NFTs in this wallet."
      : "Add the Egg NFT contract to enable live NFT IDs.",
    eggToken: "0",
    eggTokenNote: tokenConfigured
      ? "No $EGG in this wallet."
      : "Add the $EGG token contract to enable a live token balance."
  });

  if (nftConfigured) {
    try {
      const balanceHex = await callContract(provider, EGG_CONTRACTS.nftAddress, buildBalanceOfCall(address));
      const nftCount = Number(parseHexResult(balanceHex));
      nextHoldings.eggNfts = formatCompact(nftCount);

      if (nftCount > 0) {
        const idCalls = Array.from({ length: nftCount }, (_, index) =>
          callContract(provider, EGG_CONTRACTS.nftAddress, buildTokenOfOwnerByIndexCall(address, index))
        );
        const ids = await Promise.all(idCalls);
        nextHoldings.eggNftIds = ids
          .map((value) => Number(parseHexResult(value)))
          .sort((left, right) => left - right);
        nextHoldings.eggNftsNote = `${nftCount} Egg NFT${nftCount === 1 ? "" : "s"} detected in this wallet.`;
      }
    } catch (error) {
      console.error("Unable to read Egg NFT holdings", error);
      nextHoldings.eggNfts = "--";
      nextHoldings.eggNftsNote = "Unable to read Egg NFT IDs from the current contract.";
      nextHoldings.eggNftIds = [];
    }
  }

  if (tokenConfigured) {
    try {
      const decimals = await readTokenDecimals(provider);
      const tokenHex = await callContract(provider, EGG_CONTRACTS.tokenAddress, buildBalanceOfCall(address));
      const rawBalance = parseHexResult(tokenHex);
      nextHoldings.eggToken = formatTokenBalance(rawBalance, decimals, 2);
      nextHoldings.eggTokenNote =
        rawBalance > 0n ? "$EGG detected in this wallet." : "No $EGG in this wallet.";
    } catch (error) {
      console.error("Unable to read $EGG balance", error);
      nextHoldings.eggToken = "--";
      nextHoldings.eggTokenNote = "Unable to read the current $EGG balance from the token contract.";
    }
  }

  return nextHoldings;
}

function getWalletMode() {
  const provider = getWalletProvider();
  if (!provider) return "missing";
  if (walletState.connecting) return "connecting";
  if (!walletState.account) return "idle";
  if (!walletState.chainId) return "warning";
  if (walletState.chainId.toLowerCase() !== TEMPO_CHAIN.chainId) return "warning";
  return "connected";
}

function setHoldingState(nextState) {
  walletState.eggNfts = nextState.eggNfts;
  walletState.eggNftsNote = nextState.eggNftsNote;
  walletState.eggNftIds = nextState.eggNftIds || [];
  walletState.eggToken = nextState.eggToken;
  walletState.eggTokenNote = nextState.eggTokenNote;
  walletState.previewHoldings = Boolean(nextState.previewHoldings);
}

function renderAccountTabs() {
  const tabs = document.querySelectorAll("[data-account-tab]");
  const panels = document.querySelectorAll("[data-account-panel]");
  if (!tabs.length || !panels.length) return;

  tabs.forEach((tab) => {
    const isActive = tab.dataset.accountTab === state.accountTab;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.accountPanel === state.accountTab);
  });
}

function renderAccountHoldings() {
  const nftCountLargeNode = document.querySelector("#wallet-nft-count-large");
  const chipListNode = document.querySelector("#wallet-nft-chip-list");
  const gridNode = document.querySelector("#wallet-nft-grid");
  const gridNoteNode = document.querySelector("#wallet-nft-grid-note");
  const tokenDisplayNode = document.querySelector("#wallet-egg-token-display");
  const tokenDescriptionNode = document.querySelector("#wallet-egg-token-description");
  if (
    !nftCountLargeNode ||
    !chipListNode ||
    !gridNode ||
    !gridNoteNode ||
    !tokenDisplayNode ||
    !tokenDescriptionNode
  ) {
    return;
  }

  const query = state.nftSearch.trim();
  const allIds = walletState.eggNftIds;
  const visibleIds = query ? allIds.filter((id) => String(id).includes(query)) : allIds;
  const previewLabel = walletState.previewHoldings ? "Preview mode" : "Live data";

  nftCountLargeNode.textContent = allIds.length ? formatCompact(allIds.length) : walletState.eggNfts;
  tokenDisplayNode.textContent = walletState.eggToken;
  tokenDescriptionNode.textContent = walletState.eggTokenNote;

  const chips = [];
  if (walletState.account) {
    chips.push(`<span class="portfolio-chip">${previewLabel}</span>`);
    chips.push(`<span class="portfolio-chip">${shortenAddress(walletState.account)}</span>`);
  }

  allIds.slice(0, 8).forEach((id) => {
    chips.push(`<span class="portfolio-chip">#${id}</span>`);
  });

  if (allIds.length > 8) {
    chips.push(`<span class="portfolio-chip">+${allIds.length - 8} more</span>`);
  }

  chipListNode.innerHTML = chips.join("");

  if (!allIds.length) {
    gridNode.innerHTML = "";
    gridNoteNode.textContent = walletState.eggNftsNote;
    return;
  }

  if (query && !visibleIds.length) {
    gridNode.innerHTML = "";
    gridNoteNode.textContent = `No Egg NFT IDs match "${query}".`;
    return;
  }

  gridNode.innerHTML = visibleIds
    .map(
      (id) => `
        <article class="nft-card">
          <span class="nft-card-tag">Egg NFT</span>
          <strong>#${id}</strong>
          <p>Token ID ready for mint, hatch, or listing.</p>
        </article>
      `
    )
    .join("");

  gridNoteNode.textContent = query
    ? `Showing ${visibleIds.length} of ${allIds.length} held Egg NFT IDs.`
    : walletState.eggNftsNote;
}

function bindAccountTabs() {
  const tabs = document.querySelectorAll("[data-account-tab]");
  if (!tabs.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const nextTab = tab.dataset.accountTab;
      if (!nextTab || nextTab === state.accountTab) return;
      state.accountTab = nextTab;
      renderAccountTabs();
    });
  });

  renderAccountTabs();
}

function bindNftSearch() {
  const searchNode = document.querySelector("#nft-search");
  if (!searchNode) return;

  searchNode.addEventListener("input", (event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    state.nftSearch = target.value;
    renderAccountHoldings();
  });
}

function renderWalletProfile() {
  const connectNode = document.querySelector("#wallet-connect");
  const profileNode = document.querySelector("#wallet-profile");
  const avatarNode = document.querySelector("#wallet-avatar");
  const addressNode = document.querySelector("#wallet-address");
  const statusNode = document.querySelector("#wallet-status");
  const balanceNode = document.querySelector("#wallet-balance");
  const eggNftsNode = document.querySelector("#wallet-egg-nfts");
  const eggNftsNoteNode = document.querySelector("#wallet-egg-nfts-note");
  const eggTokenNode = document.querySelector("#wallet-egg-token");
  const eggTokenNoteNode = document.querySelector("#wallet-egg-token-note");

  const syncHoldingViews = () => {
    if (eggNftsNode) eggNftsNode.textContent = walletState.eggNfts;
    if (eggNftsNoteNode) eggNftsNoteNode.textContent = walletState.eggNftsNote;
    if (eggTokenNode) eggTokenNode.textContent = walletState.eggToken;
    if (eggTokenNoteNode) eggTokenNoteNode.textContent = walletState.eggTokenNote;
    renderAccountHoldings();
  };

  const mode = getWalletMode();
  if (profileNode) profileNode.dataset.walletState = mode;
  syncHoldingViews();

  if (!connectNode) return;

  if (mode === "missing") {
    connectNode.textContent = "Wallet Unavailable";
    connectNode.disabled = true;
    if (avatarNode) avatarNode.textContent = "EG";
    if (addressNode) {
      addressNode.textContent = "No EVM wallet detected";
      addressNode.title = "No EVM wallet detected";
    }
    if (statusNode) statusNode.textContent = "Offline";
    if (balanceNode) balanceNode.textContent = "-";
    setHoldingState({
      eggNfts: "-",
      eggNftsNote: "Install an EVM wallet.",
      eggNftIds: [],
      eggToken: "-",
      eggTokenNote: "Install an EVM wallet.",
      previewHoldings: false
    });
    syncHoldingViews();
    return;
  }

  if (mode === "connecting") {
    connectNode.textContent = "Connecting...";
    connectNode.disabled = true;
    if (avatarNode) avatarNode.textContent = walletState.account ? getWalletAvatar(walletState.account) : "EG";
    if (addressNode) {
      addressNode.textContent = walletState.account ? shortenAddress(walletState.account) : "Awaiting approval";
      addressNode.title = walletState.account || "Awaiting wallet approval";
    }
    if (statusNode) statusNode.textContent = "Pending";
    if (balanceNode) balanceNode.textContent = walletState.balance;
    setHoldingState({
      eggNfts: "...",
      eggNftsNote: "Checking wallet access.",
      eggNftIds: [],
      eggToken: "...",
      eggTokenNote: "Checking wallet access.",
      previewHoldings: false
    });
    syncHoldingViews();
    return;
  }

  connectNode.disabled = false;

  if (mode === "idle") {
    connectNode.textContent = "Connect Wallet";
    if (avatarNode) avatarNode.textContent = "EG";
    if (addressNode) {
      addressNode.textContent = "Wallet not connected";
      addressNode.title = "Wallet not connected";
    }
    if (statusNode) statusNode.textContent = "Guest";
    if (balanceNode) balanceNode.textContent = "-";
    setHoldingState({
      eggNfts: "-",
      eggNftsNote: "Connect to view holdings.",
      eggNftIds: [],
      eggToken: "-",
      eggTokenNote: "Connect to view holdings.",
      previewHoldings: false
    });
    syncHoldingViews();
    return;
  }

  if (avatarNode) avatarNode.textContent = getWalletAvatar(walletState.account);
  if (addressNode) {
    addressNode.textContent = shortenAddress(walletState.account);
    addressNode.title = walletState.account;
  }
  if (balanceNode) balanceNode.textContent = walletState.balance;

  if (mode === "warning") {
    connectNode.textContent = "Complete Setup";
    if (statusNode) statusNode.textContent = "Attention";
    setHoldingState({
      eggNfts: "--",
      eggNftsNote: "Switch to Tempo to view wallet holdings.",
      eggNftIds: [],
      eggToken: "--",
      eggTokenNote: "Switch to Tempo to view wallet holdings.",
      previewHoldings: false
    });
    syncHoldingViews();
    return;
  }

  connectNode.textContent = "Wallet Connected";
  if (statusNode) statusNode.textContent = "Online";
  syncHoldingViews();
}

async function ensureTempoNetwork(provider) {
  const currentChainId = await provider.request({ method: "eth_chainId" });
  if (currentChainId.toLowerCase() === TEMPO_CHAIN.chainId) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: TEMPO_CHAIN.chainId }]
    });
  } catch (error) {
    if (error && error.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [TEMPO_CHAIN]
      });
      return;
    }

    throw error;
  }
}

async function syncWalletState() {
  const provider = getWalletProvider();
  if (!provider) {
    setHoldingState(createHoldingState());
    renderWalletProfile();
    return;
  }

  try {
    const [accounts, chainId] = await Promise.all([
      provider.request({ method: "eth_accounts" }),
      provider.request({ method: "eth_chainId" })
    ]);

    walletState.account = accounts[0] || "";
    walletState.chainId = chainId || "";
    walletState.balance = "-";
    setHoldingState(createHoldingState());

    if (walletState.account) {
      const balanceHex = await provider.request({
        method: "eth_getBalance",
        params: [walletState.account, "latest"]
      });
      walletState.balance = formatNativeBalance(balanceHex);

      if (walletState.chainId.toLowerCase() === TEMPO_CHAIN.chainId) {
        const holdings = await fetchWalletHoldings(provider, walletState.account);
        setHoldingState(holdings);
      } else {
        setHoldingState(
          createHoldingState({
            eggNfts: "--",
            eggNftsNote: "Switch to Tempo to view wallet holdings.",
            eggToken: "--",
            eggTokenNote: "Switch to Tempo to view wallet holdings."
          })
        );
      }
    }
  } catch (error) {
    console.error("Unable to sync wallet state", error);
  }

  renderWalletProfile();
}

async function handleWalletAction() {
  const provider = getWalletProvider();
  if (!provider || walletState.connecting) {
    renderWalletProfile();
    return;
  }

  walletState.connecting = true;
  renderWalletProfile();

  try {
    if (!walletState.account) {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      walletState.account = accounts[0] || "";
    }

    walletState.chainId = await provider.request({ method: "eth_chainId" });

    if (walletState.chainId.toLowerCase() !== TEMPO_CHAIN.chainId) {
      await ensureTempoNetwork(provider);
    }
  } catch (error) {
    console.error("Wallet action failed", error);
  } finally {
    walletState.connecting = false;
    await syncWalletState();
  }
}

function bindWallet() {
  const connectNode = document.querySelector("#wallet-connect");
  if (!connectNode) return;

  connectNode.addEventListener("click", () => {
    void handleWalletAction();
  });

  const provider = getWalletProvider();
  if (provider?.on) {
    provider.on("accountsChanged", () => {
      void syncWalletState();
    });

    provider.on("chainChanged", () => {
      void syncWalletState();
    });
  }

  void syncWalletState();
}

function updateMintSurface() {
  const qtyNode = document.querySelector("#mint-quantity");
  const totalNode = document.querySelector("#mint-total");
  const receiveNode = document.querySelector("#mint-receive");
  if (!qtyNode || !totalNode || !receiveNode) return;

  qtyNode.textContent = String(state.mint);
  totalNode.textContent = `${(state.mint * 0.3).toFixed(1)} pathUSD`;
  receiveNode.textContent = `${state.mint} Egg NFT${state.mint > 1 ? "s" : ""}`;
}

function updateHatchSurface() {
  const qtyNode = document.querySelector("#hatch-quantity");
  const outputNode = document.querySelector("#hatch-output");
  if (!qtyNode || !outputNode) return;

  qtyNode.textContent = String(state.hatch);
  outputNode.textContent = `${state.hatch} $EGG`;
}

function updateTradeSurface() {
  const qtyNode = document.querySelector("#trade-quantity");
  const sizeValueNode = document.querySelector("#trade-size-value");
  const sizeUnitNode = document.querySelector("#trade-size-unit");
  const summaryLabelNode = document.querySelector("#trade-summary-label");
  const outputNode = document.querySelector("#trade-output");
  const toggleButtons = document.querySelectorAll("[data-trade-side]");
  if (!qtyNode || !sizeValueNode || !sizeUnitNode || !summaryLabelNode || !outputNode) return;

  const price = marketSnapshots[state.snapshotIndex].price;

  toggleButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tradeSide === state.tradeSide);
  });

  qtyNode.textContent = formatCompact(state.trade);

  if (state.tradeSide === "buy") {
    const receive = state.trade / price;
    sizeValueNode.textContent = formatCompact(state.trade);
    sizeUnitNode.textContent = "pathUSD";
    summaryLabelNode.textContent = "Estimated Receive";
    outputNode.textContent = `${formatCompact(receive, 2)} $EGG`;
  } else {
    const receive = state.trade * price;
    sizeValueNode.textContent = formatCompact(state.trade);
    sizeUnitNode.textContent = "$EGG";
    summaryLabelNode.textContent = "Estimated Receive";
    outputNode.textContent = `${receive.toFixed(2)} pathUSD`;
  }
}

function clampState(key, delta) {
  if (key === "mint") {
    state.mint = Math.min(25, Math.max(1, state.mint + delta));
    updateMintSurface();
    return;
  }

  if (key === "hatch") {
    state.hatch = Math.min(20, Math.max(1, state.hatch + delta));
    updateHatchSurface();
    return;
  }

  if (key === "trade") {
    const step = state.tradeSide === "buy" ? 20 : 50;
    const minimum = state.tradeSide === "buy" ? 20 : 50;
    const maximum = state.tradeSide === "buy" ? 2000 : 5000;
    state.trade = Math.min(maximum, Math.max(minimum, state.trade + delta * step));
    updateTradeSurface();
  }
}

function bindQuantityControls() {
  const controls = document.querySelectorAll("[data-qty-control]");
  controls.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.qtyControl;
      const direction = Number(button.dataset.direction || "0");
      if (!key || Number.isNaN(direction)) return;
      clampState(key, direction);
    });
  });
}

function bindTradeToggle() {
  const buttons = document.querySelectorAll("[data-trade-side]");
  if (!buttons.length) return;

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const side = button.dataset.tradeSide;
      if (!side || side === state.tradeSide) return;

      state.tradeSide = side;
      state.trade = side === "buy" ? 120 : 300;
      updateTradeSurface();
    });
  });
}

function buildChartPath(values, width, height, padding) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const stepX = (width - padding * 2) / (values.length - 1);

  const points = values.map((value, index) => {
    const x = padding + stepX * index;
    const normalized = (value - min) / (max - min || 1);
    const y = height - padding - normalized * (height - padding * 2);
    return [x, y];
  });

  return points.reduce((path, [x, y], index) => {
    const prefix = index === 0 ? "M" : "L";
    return `${path}${prefix}${x.toFixed(2)},${y.toFixed(2)} `;
  }, "");
}

function renderChart(snapshot) {
  const linePathNode = document.querySelector("#chart-line-path");
  const fillPathNode = document.querySelector("#chart-fill-path");
  const priceNode = document.querySelector("#chart-price");
  const changeNode = document.querySelector("#chart-change");
  if (!linePathNode || !fillPathNode || !priceNode || !changeNode) return;

  const width = 960;
  const height = 360;
  const padding = 24;
  const linePath = buildChartPath(snapshot.points, width, height, padding);
  const fillPath = `${linePath}L${width - padding},${height - padding} L${padding},${height - padding} Z`;

  linePathNode.setAttribute("d", linePath.trim());
  fillPathNode.setAttribute("d", fillPath.trim());
  priceNode.textContent = formatCurrency(snapshot.price, 3);
  changeNode.textContent = `${snapshot.change > 0 ? "+" : ""}${snapshot.change.toFixed(1)}% / 24h`;
}

function rotateChart() {
  if (!document.querySelector("#price-chart")) return;

  renderChart(marketSnapshots[state.snapshotIndex]);
  updateTradeSurface();

  window.setInterval(() => {
    state.snapshotIndex = (state.snapshotIndex + 1) % marketSnapshots.length;
    renderChart(marketSnapshots[state.snapshotIndex]);
    updateTradeSurface();
  }, 3200);
}

setupReveal();
setYear();
bindQuantityControls();
bindTradeToggle();
bindWallet();
bindAccountTabs();
bindNftSearch();
updateMintSurface();
updateHatchSurface();
updateTradeSurface();
rotateChart();
