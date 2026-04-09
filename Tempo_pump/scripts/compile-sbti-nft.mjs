import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, "..");

const sourcePath = path.join(projectDir, "contracts", "SBTIResultNFT.sol");
const buildDir = path.join(projectDir, "build", "sbti");

function resolveImport(importPath) {
  const candidates = [
    path.join(projectDir, importPath),
    path.join(projectDir, "node_modules", importPath)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { contents: fs.readFileSync(candidate, "utf8") };
    }
  }

  return { error: `File not found: ${importPath}` };
}

function main() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      "contracts/SBTIResultNFT.sol": {
        content: source
      }
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"]
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: resolveImport }));
  const errors = output.errors || [];
  const fatalErrors = errors.filter((entry) => entry.severity === "error");

  if (fatalErrors.length) {
    fatalErrors.forEach((entry) => console.error(entry.formattedMessage));
    process.exit(1);
  }

  errors.forEach((entry) => console.warn(entry.formattedMessage));

  const artifact =
    output.contracts["contracts/SBTIResultNFT.sol"] &&
    output.contracts["contracts/SBTIResultNFT.sol"].SBTIResultNFT;

  if (!artifact) {
    throw new Error("SBTIResultNFT artifact not found in compiler output");
  }

  fs.mkdirSync(buildDir, { recursive: true });

  const artifactPath = path.join(buildDir, "SBTIResultNFT.json");
  const abiPath = path.join(buildDir, "SBTIResultNFT.abi");
  const binPath = path.join(buildDir, "SBTIResultNFT.bin");

  fs.writeFileSync(
    artifactPath,
    `${JSON.stringify(
      {
        contractName: "SBTIResultNFT",
        abi: artifact.abi,
        bytecode: `0x${artifact.evm.bytecode.object}`,
        deployedBytecode: `0x${artifact.evm.deployedBytecode.object}`
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(abiPath, `${JSON.stringify(artifact.abi, null, 2)}\n`);
  fs.writeFileSync(binPath, `0x${artifact.evm.bytecode.object}\n`);

  console.log(
    JSON.stringify(
      {
        artifactPath,
        abiPath,
        binPath
      },
      null,
      2
    )
  );
}

main();
