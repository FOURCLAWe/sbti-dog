import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const manifestPath = path.join(rootDir, "data", "sbti-download", "image-manifest.json");
const typesPath = path.join(rootDir, "data", "sbti-download", "types.json");
const metadataDir = path.join(rootDir, "public", "sbti", "nft", "metadata");
const contractMetaPath = path.join(rootDir, "public", "sbti", "nft", "contract.json");
const nftDataPath = path.join(rootDir, "public", "sbti", "nft-data.js");
const nftResultsJsonPath = path.join(rootDir, "public", "sbti", "nft", "results.json");

const siteBaseUrl = (process.env.SBTI_SITE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const externalUrl = `${siteBaseUrl}/sbti/index.html`;
const contractUrl = `${siteBaseUrl}/sbti/nft/contract.json`;
const metadataBaseUrl = `${siteBaseUrl}/sbti/nft/metadata/`;

function buildDescription(item, type) {
  return [
    `Authorized commemorative NFT for the SBTI result ${item.code}（${item.cn}）.`,
    "",
    type.desc || "",
    "",
    `Intro: ${item.intro}`
  ].join("\n");
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const { typeLibrary } = JSON.parse(await readFile(typesPath, "utf8"));

  await mkdir(metadataDir, { recursive: true });

  const results = manifest.map((item, index) => {
    const tokenId = index + 1;
    const imageFileName = path.basename(new URL(item.sourceUrl).pathname);
    const imageUrl = `${siteBaseUrl}/sbti/image/${imageFileName}`;
    const metadataUrl = `${metadataBaseUrl}${tokenId}.json`;
    const type = typeLibrary[item.code] || {};

    return {
      tokenId,
      code: item.code,
      cn: item.cn,
      intro: item.intro,
      imageFileName,
      imageUrl,
      metadataUrl,
      name: `SBTI ${item.code} - ${item.cn}`,
      description: buildDescription(item, type)
    };
  });

  for (const result of results) {
    const metadata = {
      name: result.name,
      description: result.description,
      image: result.imageUrl,
      external_url: externalUrl,
      attributes: [
        { trait_type: "Collection", value: "SBTI Result NFT" },
        { trait_type: "Result Code", value: result.code },
        { trait_type: "Result Name", value: result.cn },
        { trait_type: "Token ID", value: result.tokenId }
      ]
    };

    await writeFile(
      path.join(metadataDir, `${result.tokenId}.json`),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8"
    );
  }

  const contractMetadata = {
    name: "SBTI Result NFT",
    description:
      "Authorized commemorative NFT collection for the SBTI personality test. Each token represents one final SBTI result type.",
    image: results[0]?.imageUrl || "",
    external_link: externalUrl,
    seller_fee_basis_points: 0,
    fee_recipient: "0x0000000000000000000000000000000000000000"
  };

  await writeFile(contractMetaPath, `${JSON.stringify(contractMetadata, null, 2)}\n`, "utf8");
  await writeFile(nftResultsJsonPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  await writeFile(nftDataPath, `window.SBTI_NFT_RESULTS = ${JSON.stringify(results, null, 2)};\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        metadataBaseUrl,
        contractUrl,
        tokenCount: results.length
      },
      null,
      2
    )
  );
}

await main();
