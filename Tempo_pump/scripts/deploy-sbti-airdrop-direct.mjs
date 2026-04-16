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

const artifactPath = path.join(projectDir, "build", "airdrop", "SBTINftHolderAirdrop.json");
const frontendConfigPath = path.join(rootDir, "public", "sbti", "airdrop-config.js");
const deploymentsDir = path.join(rootDir, "data", "sbti-download", "airdrop-deployments");

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
    `window.SBTI_AIRDROP_CONFIG = ${JSON.stringify(
      {
        chainId: networkInfo.chainId,
        chainIdHex: networkInfo.chainIdHex,
        chainName: networkInfo.chainName,
        rpcUrls: [networkInfo.rpcUrl],
        blockExplorerUrls: networkInfo.blockExplorerUrls,
        explorerBaseUrl: networkInfo.explorerBaseUrl,
        nativeCurrency: {
          name: "BNB",
          symbol: "BNB",
          decimals: 18
        },
        nftContractAddress: config.nftContractAddress,
        tokenAddress: config.tokenAddress,
        airdropContractAddress: config.airdropContractAddress,
        claimAmount: config.claimAmount,
        tokenDecimals: config.tokenDecimals,
        tokenSymbol: config.tokenSymbol,
        claimAmountDisplay: config.claimAmountDisplay
      },
      null,
      2
    )};\n`
  );
}

async function main() {
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Missing artifact at ${artifactPath}. Run compile-sbti-airdrop.mjs first.`);
  }

  const privateKey = requiredEnv("PRIVATE_KEY");
  const tokenAddress = process.env.SBTI_AIRDROP_TOKEN_ADDRESS || requiredEnv("SBTI_TOKEN_ADDRESS");
  const nftContractAddress =
    process.env.SBTI_AIRDROP_NFT_ADDRESS || requiredEnv("SBTI_NFT_CONTRACT_ADDRESS");
  const deployNetwork = process.env.SBTI_DEPLOY_NETWORK || "bsc";
  const networkInfo = NETWORKS[deployNetwork];

  if (!networkInfo) {
    throw new Error(`Unsupported SBTI_DEPLOY_NETWORK "${deployNetwork}"`);
  }

  const ownerAddress = process.env.SBTI_AIRDROP_OWNER || process.env.SBTI_COLLECTION_OWNER;
  const tokenDecimals = Number(process.env.SBTI_AIRDROP_TOKEN_DECIMALS || "18");
  const tokenSymbol = process.env.SBTI_AIRDROP_TOKEN_SYMBOL || "SBTI";
  const claimAmountDisplay = process.env.SBTI_AIRDROP_CLAIM_AMOUNT_DISPLAY || "200,000";
  const claimAmount =
    process.env.SBTI_AIRDROP_CLAIM_AMOUNT || ethers.parseUnits("200000", tokenDecimals).toString();
  const maxTokenId = Number(process.env.SBTI_AIRDROP_MAX_TOKEN_ID || "27");

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(networkInfo.rpcUrl, networkInfo.chainId);
  const wallet = new ethers.Wallet(privateKey, provider);
  const balance = await provider.getBalance(wallet.address);

  console.log("Network:", deployNetwork);
  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "BNB");

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(
    ownerAddress || wallet.address,
    tokenAddress,
    nftContractAddress,
    claimAmount,
    maxTokenId
  );

  console.log("Deployment tx:", contract.deploymentTransaction().hash);
  await contract.waitForDeployment();

  const airdropContractAddress = await contract.getAddress();
  console.log("Contract deployed:", airdropContractAddress);

  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, `${deployNetwork}-airdrop.json`),
    `${JSON.stringify(
      {
        network: deployNetwork,
        chainId: networkInfo.chainId,
        rpcUrl: networkInfo.rpcUrl,
        airdropContractAddress,
        tokenAddress,
        nftContractAddress,
        claimAmount,
        tokenDecimals,
        tokenSymbol,
        claimAmountDisplay,
        maxTokenId,
        deployer: wallet.address,
        owner: ownerAddress || wallet.address,
        deployedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`
  );

  if (process.env.SBTI_UPDATE_FRONTEND_CONFIG !== "false") {
    writeFrontendConfig(networkInfo, {
      nftContractAddress,
      tokenAddress,
      airdropContractAddress,
      claimAmount,
      tokenDecimals,
      tokenSymbol,
      claimAmountDisplay
    });
    console.log("Updated frontend config:", frontendConfigPath);
  }
}

await main();
