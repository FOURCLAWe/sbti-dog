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

const artifactPath = path.join(projectDir, "build", "sbti", "SBTIResultNFT.json");
const frontendConfigPath = path.join(rootDir, "public", "sbti", "nft-config.js");
const deploymentsDir = path.join(rootDir, "data", "sbti-download", "nft-deployments");

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

function writeFrontendConfig(networkInfo, contractAddress) {
  const config = {
    collectionName: "SBTI Result NFT",
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
    contractAddress,
    mintEnabled: true
  };

  fs.writeFileSync(frontendConfigPath, `window.SBTI_NFT_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
}

async function main() {
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Missing artifact at ${artifactPath}. Run compile-sbti-nft.mjs first.`);
  }

  const privateKey = requiredEnv("PRIVATE_KEY");
  const metadataBaseURI = requiredEnv("SBTI_METADATA_BASE_URI");
  const contractURI = requiredEnv("SBTI_CONTRACT_URI");
  const deployNetwork = process.env.SBTI_DEPLOY_NETWORK || "bsc";
  const networkInfo = NETWORKS[deployNetwork];

  if (!networkInfo) {
    throw new Error(`Unsupported SBTI_DEPLOY_NETWORK "${deployNetwork}"`);
  }

  const ownerAddress = process.env.SBTI_COLLECTION_OWNER;
  const royaltyReceiver = process.env.SBTI_ROYALTY_RECEIVER || ownerAddress || ethers.ZeroAddress;
  const royaltyBps = Number(process.env.SBTI_ROYALTY_BPS || "0");

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
    "SBTI Result NFT",
    "SBTI",
    metadataBaseURI,
    contractURI,
    royaltyReceiver,
    royaltyBps
  );

  console.log("Deployment tx:", contract.deploymentTransaction().hash);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("Contract deployed:", contractAddress);

  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, `${deployNetwork}-direct.json`),
    `${JSON.stringify(
      {
        network: deployNetwork,
        chainId: networkInfo.chainId,
        rpcUrl: networkInfo.rpcUrl,
        contractAddress,
        deployer: wallet.address,
        owner: ownerAddress || wallet.address,
        metadataBaseURI,
        contractURI,
        royaltyReceiver,
        royaltyBps,
        deployedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`
  );

  if (process.env.SBTI_UPDATE_FRONTEND_CONFIG !== "false") {
    writeFrontendConfig(networkInfo, contractAddress);
    console.log("Updated frontend config:", frontendConfigPath);
  }
}

await main();
