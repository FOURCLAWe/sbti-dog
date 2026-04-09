import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_URL = "https://sbti.unun.dev/";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const downloadedHtmlPath = path.join(rootDir, "data", "sbti-download", "site.html");
const typeDataPath = path.join(rootDir, "data", "sbti-download", "types.json");
const publicSbtiDir = path.join(rootDir, "public", "sbti");
const publicImageDir = path.join(publicSbtiDir, "image");

async function downloadBinary(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function buildLocalHtml(html) {
  return html
    .replace(
      /<div style="padding-top: 2rem; display: flex; flex-direction: column;">[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/,
      `<div style="padding-top: 2rem; display: flex; flex-direction: column; gap: 6px;">
          <span>授权接入版本：已获原内容使用许可</span>
          <span>
            原作者：
            <a href="https://space.bilibili.com/417038183" target="_blank" rel="noreferrer">B站@蛆肉儿串儿</a>
          </span>
          <span><a href="/index.html">返回站点首页</a></span>
        </div>
      </div>
    </section>`
    )
    .replace(
      /<!-- Cloudflare Pages Analytics -->[\s\S]*?<!-- Cloudflare Pages Analytics -->/g,
      ""
    );
}

async function main() {
  const html = await readFile(downloadedHtmlPath, "utf8");
  const { typeImages } = JSON.parse(await readFile(typeDataPath, "utf8"));

  await mkdir(publicSbtiDir, { recursive: true });
  await mkdir(publicImageDir, { recursive: true });

  const localHtml = buildLocalHtml(html);
  await writeFile(path.join(publicSbtiDir, "index.html"), localHtml, "utf8");

  const downloads = Object.values(typeImages).map(async (relativePath) => {
    const sourceUrl = new URL(relativePath, SITE_URL).href;
    const fileName = path.basename(relativePath);
    const filePath = path.join(publicImageDir, fileName);
    const buffer = await downloadBinary(sourceUrl);
    await writeFile(filePath, buffer);
  });

  await Promise.all(downloads);

  console.log(
    JSON.stringify(
      {
        publishedHtml: path.join(publicSbtiDir, "index.html"),
        imageDir: publicImageDir,
        imageCount: Object.keys(typeImages).length
      },
      null,
      2
    )
  );
}

await main();
