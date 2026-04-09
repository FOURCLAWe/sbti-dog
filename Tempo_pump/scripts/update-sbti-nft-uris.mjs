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
const deploymentPath = path.join(rootDir, "data", "sbti-download", "nft-deployments", "bsc-direct.json");

const abi = [
  "function setMetadataBaseURI(string calldata nextBaseURI) external",
  "function setContractURI(string calldata nextContractURI) external",
  "function metadataBaseURI() external view returns (string memory)",
  "function contractURI() external view returns (string memory)"
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main() {
  const privateKey = requiredEnv("PRIVATE_KEY");
  const metadataBaseURI = requiredEnv("SBTI_METADATA_BASE_URI");
  const contractURI = requiredEnv("SBTI_CONTRACT_URI");

  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment record not found at ${deploymentPath}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(
    process.env.BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org",
    56
  );
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(deployment.contractAddress, abi, wallet);

  console.log("Contract:", deployment.contractAddress);
  console.log("Updating metadataBaseURI to:", metadataBaseURI);
  let tx = await contract.setMetadataBaseURI(metadataBaseURI);
  console.log("Metadata tx:", tx.hash);
  await tx.wait();

  console.log("Updating contractURI to:", contractURI);
  tx = await contract.setContractURI(contractURI);
  console.log("Contract URI tx:", tx.hash);
  await tx.wait();

  const currentMetadataBaseURI = await contract.metadataBaseURI();
  const currentContractURI = await contract.contractURI();

  console.log(
    JSON.stringify(
      {
        contractAddress: deployment.contractAddress,
        metadataBaseURI: currentMetadataBaseURI,
        contractURI: currentContractURI
      },
      null,
      2
    )
  );
}

await main();
