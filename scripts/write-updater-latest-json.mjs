/**
 * Écrit `latest.json` pour tauri-plugin-updater à partir du bundle NSIS signé.
 *
 * Usage (job Windows, après `tauri build` avec TAURI_SIGNING_PRIVATE_KEY) :
 *   node scripts/write-updater-latest-json.mjs <dossier-nsis> <owner/repo>
 *
 * Ne signe rien : lit le `.sig` déjà produit par le bundler Tauri.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const nsisDir = process.argv[2];
const repo = process.argv[3];
if (!nsisDir || !repo || repo.split("/").length !== 2) {
  console.error("Usage: node scripts/write-updater-latest-json.mjs <nsis-dir> <owner/repo>");
  process.exit(1);
}

const names = readdirSync(nsisDir);
const exe = names.find((n) => n.endsWith("-setup.exe") && !n.endsWith(".sig"));
const sigName = exe ? `${exe}.sig` : names.find((n) => n.endsWith("-setup.exe.sig"));
if (!exe || !sigName || !names.includes(sigName)) {
  console.log("Aucun artefact updater signé — latest.json non écrit.");
  process.exit(0);
}

const conf = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const version = String(conf.version ?? "").trim();
if (!version) {
  console.error("version absente de src-tauri/tauri.conf.json");
  process.exit(1);
}

const signature = readFileSync(join(nsisDir, sigName), "utf8").trim();
const url = `https://github.com/${repo}/releases/download/v${version}/${encodeURIComponent(exe)}`;
const manifest = {
  version,
  notes: `RustyMail ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url,
    },
  },
};

const out = join(nsisDir, "latest.json");
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`latest.json → ${out}`);
console.log(`url ${url}`);
