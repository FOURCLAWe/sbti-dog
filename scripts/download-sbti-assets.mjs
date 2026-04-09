import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SITE_URL = "https://sbti.unun.dev/";
const DOC_EXPORT_URL =
  "https://docs.google.com/document/d/1lvJ7hYOEDTtMdN5EiKDGMJkp5PxyIKWR/export?format=txt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "data", "sbti-download");
const imageDir = path.join(outDir, "result-images");

function sanitizeFileName(value) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function unique(values) {
  return [...new Set(values)];
}

function extractLiteral(source, name) {
  const token = `const ${name} =`;
  const tokenIndex = source.indexOf(token);
  if (tokenIndex === -1) {
    throw new Error(`Could not find ${name} in source`);
  }

  let cursor = tokenIndex + token.length;
  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1;
  }

  const opener = source[cursor];
  const closer = opener === "[" ? "]" : opener === "{" ? "}" : null;
  if (!closer) {
    throw new Error(`Unsupported literal opener for ${name}: ${opener}`);
  }

  const start = cursor;
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (; cursor < source.length; cursor += 1) {
    const char = source[cursor];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = "";
      }

      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === opener) {
      depth += 1;
      continue;
    }

    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, cursor + 1);
      }
    }
  }

  throw new Error(`Could not parse literal for ${name}`);
}

function parseLiteral(source, name) {
  const literal = extractLiteral(source, name);
  return vm.runInNewContext(`(${literal})`);
}

function formatQuestions(questions, specialQuestions) {
  const lines = [];

  questions.forEach((question, index) => {
    lines.push(`${index + 1}. [${question.dim}] ${question.text}`);
    question.options.forEach((option, optionIndex) => {
      const letter = String.fromCharCode(65 + optionIndex);
      lines.push(`   ${letter}. ${option.label}`);
    });
    lines.push("");
  });

  if (specialQuestions.length) {
    lines.push("Special Questions");
    lines.push("");

    specialQuestions.forEach((question, index) => {
      lines.push(`${index + 1}. [${question.kind}] ${question.text}`);
      question.options.forEach((option, optionIndex) => {
        const letter = String.fromCharCode(65 + optionIndex);
        lines.push(`   ${letter}. ${option.label}`);
      });
      lines.push("");
    });
  }

  return `${lines.join("\n").trim()}\n`;
}

function extractCodesFromDoc(docText, imageCodes) {
  const headingMatches = [...docText.matchAll(/^([A-Za-z0-9!_-]+(?:-[A-Za-z0-9!_-]+)?)(?=（)/gm)];
  const codes = headingMatches.map((match) => match[1]).filter((code) => imageCodes.includes(code));
  return unique(codes);
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function downloadBinary(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir(imageDir, { recursive: true });

  const [siteHtml, guideText] = await Promise.all([fetchText(SITE_URL), fetchText(DOC_EXPORT_URL)]);

  const questions = parseLiteral(siteHtml, "questions");
  const specialQuestions = parseLiteral(siteHtml, "specialQuestions");
  const typeLibrary = parseLiteral(siteHtml, "TYPE_LIBRARY");
  const typeImages = parseLiteral(siteHtml, "TYPE_IMAGES");
  const normalTypes = parseLiteral(siteHtml, "NORMAL_TYPES");

  const imageCodes = Object.keys(typeImages);
  const guideCodes = extractCodesFromDoc(guideText, imageCodes);

  await writeFile(path.join(outDir, "site.html"), siteHtml, "utf8");
  await writeFile(path.join(outDir, "guide.txt"), guideText, "utf8");
  await writeFile(
    path.join(outDir, "questions.json"),
    `${JSON.stringify({ questions, specialQuestions }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(path.join(outDir, "questions.txt"), formatQuestions(questions, specialQuestions), "utf8");
  await writeFile(
    path.join(outDir, "types.json"),
    `${JSON.stringify({ typeLibrary, typeImages, normalTypes }, null, 2)}\n`,
    "utf8"
  );

  const manifest = [];

  for (const code of guideCodes) {
    const relativePath = typeImages[code];
    const sourceUrl = new URL(relativePath, SITE_URL).href;
    const extension = path.extname(relativePath) || ".png";
    const fileName = `${String(manifest.length + 1).padStart(2, "0")}_${sanitizeFileName(code)}${extension}`;
    const filePath = path.join(imageDir, fileName);
    const imageBuffer = await downloadBinary(sourceUrl);

    await writeFile(filePath, imageBuffer);

    manifest.push({
      code,
      cn: typeLibrary[code]?.cn || "",
      intro: typeLibrary[code]?.intro || "",
      sourceUrl,
      fileName,
      filePath
    });
  }

  await writeFile(path.join(outDir, "image-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        outDir,
        questionCount: questions.length,
        specialQuestionCount: specialQuestions.length,
        downloadedImages: manifest.length
      },
      null,
      2
    )
  );
}

await main();
