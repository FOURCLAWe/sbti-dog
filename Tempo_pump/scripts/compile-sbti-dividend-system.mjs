import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, "..");

const buildDir = path.join(projectDir, "build", "dividend");
const sourceFiles = [
  "contracts/SBTIEligibleHolderRegistry.sol",
  "contracts/SBTIHourlyDividendVault.sol"
];
const deployableContracts = new Set(["SBTIEligibleHolderRegistry", "SBTIHourlyDividendVault"]);

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

function buildSources() {
  return Object.fromEntries(
    sourceFiles.map((relativePath) => [
      relativePath,
      { content: fs.readFileSync(path.join(projectDir, relativePath), "utf8") }
    ])
  );
}

function writeArtifacts(output) {
  fs.mkdirSync(buildDir, { recursive: true });

  for (const relativePath of sourceFiles) {
    const contractMap = output.contracts[relativePath];
    if (!contractMap) {
      throw new Error(`Compiler output missing source: ${relativePath}`);
    }

    for (const [contractName, artifact] of Object.entries(contractMap)) {
      if (!deployableContracts.has(contractName)) {
        continue;
      }

      const artifactPath = path.join(buildDir, `${contractName}.json`);
      const abiPath = path.join(buildDir, `${contractName}.abi`);
      const binPath = path.join(buildDir, `${contractName}.bin`);

      fs.writeFileSync(
        artifactPath,
        `${JSON.stringify(
          {
            contractName,
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
    }
  }
}

function main() {
  const input = {
    language: "Solidity",
    sources: buildSources(),
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
  writeArtifacts(output);

  console.log(
    JSON.stringify(
      {
        buildDir,
        contracts: [...deployableContracts]
      },
      null,
      2
    )
  );
}

main();
