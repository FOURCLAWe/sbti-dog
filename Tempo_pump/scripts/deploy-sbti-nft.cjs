const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { ethers, network } = require("hardhat");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const ROOT_DIR = path.resolve(__dirname, "../..");
const FRONTEND_CONFIG_PATH = path.join(ROOT_DIR, "public", "sbti", "nft-config.js");
const DEPLOYMENTS_DIR = path.join(ROOT_DIR, "data", "sbti-download", "nft-deployments");

const NETWORK_CONFIG = {
  bsc: {
    chainId: 56,
    chainIdHex: "0x38",
    chainName: "BNB Smart Chain",
    rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
    blockExplorerUrls: ["https://bscscan.com"],
    explorerBaseUrl: "https://bscscan.com"
  },
  bscTestnet: {
    chainId: 97,
    chainIdHex: "0x61",
    chainName: "BNB Smart Chain Testnet",
    rpcUrls: ["https://data-seed-prebsc-1-s1.bnbchain.org:8545"],
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFrontendConfig(contractAddress, networkInfo) {
  const config = {
    collectionName: "SBTI Result NFT",
    chainId: networkInfo.chainId,
    chainIdHex: networkInfo.chainIdHex,
    chainName: networkInfo.chainName,
    rpcUrls: networkInfo.rpcUrls,
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

  fs.writeFileSync(FRONTEND_CONFIG_PATH, `window.SBTI_NFT_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
}

async function main() {
  const networkInfo = NETWORK_CONFIG[network.name];
  if (!networkInfo) {
    throw new Error(`Unsupported network "${network.name}". Use bsc or bscTestnet.`);
  }

  const metadataBaseURI = requiredEnv("SBTI_METADATA_BASE_URI");
  const contractURI = requiredEnv("SBTI_CONTRACT_URI");
  const collectionOwner = process.env.SBTI_COLLECTION_OWNER;
  const royaltyReceiver = process.env.SBTI_ROYALTY_RECEIVER || collectionOwner || ethers.ZeroAddress;
  const royaltyBps = Number(process.env.SBTI_ROYALTY_BPS || "0");

  const [deployer] = await ethers.getSigners();
  const ownerAddress = collectionOwner || deployer.address;
  const balance = await deployer.provider.getBalance(deployer.address);

  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "BNB");
  console.log("Collection owner:", ownerAddress);
  console.log("Metadata URI:", metadataBaseURI);
  console.log("Contract URI:", contractURI);

  const Contract = await ethers.getContractFactory("SBTIResultNFT");
  const contract = await Contract.deploy(
    ownerAddress,
    "SBTI Result NFT",
    "SBTI",
    metadataBaseURI,
    contractURI,
    royaltyReceiver,
    royaltyBps
  );

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log("Contract deployed:", contractAddress);

  ensureDir(DEPLOYMENTS_DIR);

  const deploymentRecord = {
    network: network.name,
    chainId: networkInfo.chainId,
    contractAddress,
    deployer: deployer.address,
    owner: ownerAddress,
    metadataBaseURI,
    contractURI,
    royaltyReceiver,
    royaltyBps,
    deployedAt: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(DEPLOYMENTS_DIR, `${network.name}.json`),
    `${JSON.stringify(deploymentRecord, null, 2)}\n`
  );

  if (process.env.SBTI_UPDATE_FRONTEND_CONFIG !== "false") {
    writeFrontendConfig(contractAddress, networkInfo);
    console.log("Updated frontend config:", FRONTEND_CONFIG_PATH);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
