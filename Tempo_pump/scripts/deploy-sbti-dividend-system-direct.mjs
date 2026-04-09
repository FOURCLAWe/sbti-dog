import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(projectDir, "..");

const registryArtifactPath = path.join(projectDir, "build", "dividend", "SBTIEligibleHolderRegistry.json");
const vaultArtifactPath = path.join(projectDir, "build", "dividend", "SBTIHourlyDividendVault.json");
const frontendConfigPath = path.join(rootDir, "public", "sbti", "dividend-vault-config.js");
const deploymentsDir = path.join(rootDir, "data", "sbti-download", "dividend-deployments");

const NETWORKS = {
  bsc: {
    chainId: 56,
    chainIdHex: "0x38",
    chainName: "BNB Smart Chain",
    rpcUrl: process.env.BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org",
    blockExplorerUrls: ["https://bscscan.com"],
    explorerBaseUrl: "https://bscscan.com"
  },
  bscTestnet: {
    chainId: 97,
    chainIdHex: "0x61",
    chainName: "BNB Smart Chain Testnet",
    rpcUrl: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    blockExplorerUrls: ["https://testnet.bscscan.com"],
    explorerBaseUrl: "https://testnet.bscscan.com"
  }
};

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function writeFrontendConfig(networkInfo, config) {
  fs.writeFileSync(
    frontendConfigPath,
    `window.SBTI_DIVIDEND_VAULT_CONFIG = ${JSON.stringify(
      {
        chainId: networkInfo.chainId,
        chainIdHex: networkInfo.chainIdHex,
        chainName: networkInfo.chainName,
        rpcUrls: [networkInfo.rpcUrl],
        explorerBaseUrl: networkInfo.explorerBaseUrl,
        blockExplorerUrls: networkInfo.blockExplorerUrls,
        nftContractAddress: config.nftContractAddress,
        sbtiTokenAddress: config.sbtiTokenAddress,
        registryAddress: config.registryAddress,
        vaultAddress: config.vaultAddress,
        minimumSbtiBalance: config.minimumSbtiBalance,
        settlementIntervalSeconds: 3600,
        releaseBps: 2000,
        defaultBatchSize: 40
      },
      null,
      2
    )};\n`
  );
}

async function main() {
  if (!fs.existsSync(registryArtifactPath) || !fs.existsSync(vaultArtifactPath)) {
    throw new Error("Missing dividend artifacts. Run compile-sbti-dividend-system.mjs first.");
  }

  const privateKey = requiredEnv("PRIVATE_KEY");
  const nftContractAddress = requiredEnv("SBTI_NFT_CONTRACT_ADDRESS");
  const sbtiTokenAddress = requiredEnv("SBTI_TOKEN_ADDRESS");
  const deployNetwork = process.env.SBTI_DEPLOY_NETWORK || "bsc";
  const networkInfo = NETWORKS[deployNetwork];

  if (!networkInfo) {
    throw new Error(`Unsupported SBTI_DEPLOY_NETWORK "${deployNetwork}"`);
  }

  const ownerAddress = process.env.SBTI_DIVIDEND_OWNER || process.env.SBTI_COLLECTION_OWNER;
  const minimumSbtiBalance =
    process.env.SBTI_DIVIDEND_MIN_TOKEN_BALANCE || ethers.parseUnits("10000", 18).toString();

  const registryArtifact = JSON.parse(fs.readFileSync(registryArtifactPath, "utf8"));
  const vaultArtifact = JSON.parse(fs.readFileSync(vaultArtifactPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(networkInfo.rpcUrl, networkInfo.chainId);
  const wallet = new ethers.Wallet(privateKey, provider);
  const balance = await provider.getBalance(wallet.address);

  console.log("Network:", deployNetwork);
  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "BNB");

  const registryFactory = new ethers.ContractFactory(registryArtifact.abi, registryArtifact.bytecode, wallet);
  const registry = await registryFactory.deploy(
    ownerAddress || wallet.address,
    nftContractAddress,
    sbtiTokenAddress,
    27,
    minimumSbtiBalance
  );

  console.log("Registry deployment tx:", registry.deploymentTransaction().hash);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();

  const vaultFactory = new ethers.ContractFactory(vaultArtifact.abi, vaultArtifact.bytecode, wallet);
  const vault = await vaultFactory.deploy(ownerAddress || wallet.address, registryAddress);

  console.log("Vault deployment tx:", vault.deploymentTransaction().hash);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  const registryWrite = new ethers.Contract(registryAddress, registryArtifact.abi, wallet);
  const setManagerTx = await registryWrite.setSettlementManager(vaultAddress);
  console.log("Set settlement manager tx:", setManagerTx.hash);
  await setManagerTx.wait();

  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, `${deployNetwork}-dividend-system.json`),
    `${JSON.stringify(
      {
        network: deployNetwork,
        chainId: networkInfo.chainId,
        rpcUrl: networkInfo.rpcUrl,
        registryAddress,
        vaultAddress,
        nftContractAddress,
        sbtiTokenAddress,
        owner: ownerAddress || wallet.address,
        deployer: wallet.address,
        minimumSbtiBalance,
        deployedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`
  );

  if (process.env.SBTI_UPDATE_FRONTEND_CONFIG !== "false") {
    writeFrontendConfig(networkInfo, {
      nftContractAddress,
      sbtiTokenAddress,
      registryAddress,
      vaultAddress,
      minimumSbtiBalance
    });
    console.log("Updated dividend frontend config:", frontendConfigPath);
  }
}

await main();
