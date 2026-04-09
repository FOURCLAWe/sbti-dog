import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");

const productionBaseUrl = process.env.SBTI_PRODUCTION_BASE_URL || "https://sbti.dog";

function upsertEnv(content, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const nextLine = `${key}=${value}`;

  if (pattern.test(content)) {
    return content.replace(pattern, nextLine);
  }

  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  return `${normalized}${nextLine}\n`;
}

async function main() {
  let envContent = await readFile(envPath, "utf8");

  envContent = upsertEnv(envContent, "SBTI_SITE_BASE_URL", productionBaseUrl);
  envContent = upsertEnv(
    envContent,
    "SBTI_METADATA_BASE_URI",
    `${productionBaseUrl}/sbti/nft/metadata/`
  );
  envContent = upsertEnv(
    envContent,
    "SBTI_CONTRACT_URI",
    `${productionBaseUrl}/sbti/nft/contract.json`
  );

  await writeFile(envPath, envContent, "utf8");

  console.log(
    JSON.stringify(
      {
        envPath,
        siteBaseUrl: productionBaseUrl,
        metadataBaseURI: `${productionBaseUrl}/sbti/nft/metadata/`,
        contractURI: `${productionBaseUrl}/sbti/nft/contract.json`
      },
      null,
      2
    )
  );
}

await main();
