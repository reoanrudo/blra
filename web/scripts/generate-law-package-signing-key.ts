/**
 * 法令更新パッケージ署名用の Ed25519 鍵ペアを生成するCLI。
 *
 * 秘密鍵は Git 管理外のディレクトリ（既定ではリポジトルートの .secrets/）へ
 * mode 0600 で保存し、公開鍵は検証側が参照できるように PEM 形式で出力する。
 *
 * 使い方:
 *   npx tsx scripts/generate-law-package-signing-key.ts \
 *     --out ../.secrets/law-package-ed25519.pem \
 *     --public-out ../.secrets/law-package-ed25519.pub.pem
 *
 * 既存ファイルがある場合は上書きせず非0で終了する（鍵の誤再生成を防止）。
 */

import { generateKeyPairSync } from "node:crypto";
import {
  access,
  mkdir,
  writeFile,
  type constants,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface ParsedArgs {
  out: string;
  publicOut: string;
}

const F_OK: typeof constants.F_OK = 0;

function printUsage(stream: NodeJS.WriteStream): void {
  stream.write(
    [
      "使い方: generate-law-package-signing-key --out <private.pem> --public-out <public.pem>",
      "",
      "必須引数:",
      "  --out <path>         秘密鍵の保存先（mode 0600 で保存）",
      "  --public-out <path>  公開鍵の保存先（PEM 形式）",
      "",
    ].join("\n"),
  );
  stream.write("\n");
}

function parseArgs(argv: string[]): ParsedArgs | null {
  let out: string | undefined;
  let publicOut: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") {
      out = argv[++i];
    } else if (arg === "--public-out") {
      publicOut = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      printUsage(process.stdout);
      process.exit(0);
    } else {
      process.stderr.write(`不明な引数: ${arg}\n\n`);
      printUsage(process.stderr);
      process.exit(2);
    }
  }

  if (!out || !publicOut) {
    process.stderr.write("--out と --public-out は両方必須です。\n\n");
    printUsage(process.stderr);
    return null;
  }

  return { out, publicOut };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    process.exit(2);
  }

  const outPath = resolve(parsed.out);
  const publicOutPath = resolve(parsed.publicOut);

  // 既存ファイルがある場合は誤再生成を防止するため非0終了
  if (await exists(outPath)) {
    process.stderr.write(
      `エラー: 秘密鍵ファイルが既に存在します (${outPath})。上書きしません。意図的な再生成の場合は手動でファイルを削除してください。\n`,
    );
    process.exit(1);
  }
  if (await exists(publicOutPath)) {
    process.stderr.write(
      `エラー: 公開鍵ファイルが既に存在します (${publicOutPath})。上書きしません。\n`,
    );
    process.exit(1);
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  await ensureDir(outPath);
  await ensureDir(publicOutPath);

  // 秘密鍵は所有者のみ読み書き可能 (0600)
  await writeFile(outPath, privatePem, { mode: 0o600 });
  // 公開鍵は検証者が参照できるように通常のデフォルト権限で保存
  await writeFile(publicOutPath, publicPem);

  process.stdout.write(
    [
      `Ed25519 鍵ペアを生成しました。`,
      `  秘密鍵: ${outPath} (mode 0600)`,
      `  公開鍵: ${publicOutPath}`,
      ``,
      `次の環境変数を設定してください（実値はコミットしないでください）:`,
      `  LAW_PACKAGE_SIGNING_KEY_PATH=${outPath}`,
      `  LAW_PACKAGE_SIGNER_KEY_ID=<一意な鍵ID>`,
      ``,
    ].join("\n"),
  );
}

main().catch((error) => {
  process.stderr.write(
    `鍵生成中にエラーが発生しました: ${String(error instanceof Error ? error.message : error)}\n`,
  );
  process.exit(1);
});
