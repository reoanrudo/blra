/**
 * マイグレーション実行スクリプト。
 * node-pg-migrate の runner をプログラム経由で呼び出す。
 *
 * 使用法:
 *   tsx src/migrate.ts up          全マイグレーションを適用
 *   tsx src/migrate.ts down        直前のマイグレーションを巻き戻し
 *   tsx src/migrate.ts create <名> 新規マイグレーションファイルを作成
 */

import { runner } from "node-pg-migrate";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

// .env を読み込む（tsx 実行時は自動で読み込まれないため）
loadEnv();

const command = process.argv[2] ?? "up";

const migrationsDir = resolve(process.cwd(), "migrations");

async function main() {
  if (command === "create") {
    const name = process.argv[3];
    if (!name) {
      console.error("マイグレーション名を指定してください: tsx src/migrate.ts create <名>");
      process.exit(1);
    }
    // create サブコマンドは npx 経由で直接実行（runner は create をサポートしない）
    const { execFileSync } = await import("node:child_process");
    execFileSync(
      "npx",
      ["node-pg-migrate", "--migrations-dir", "migrations", "create", name],
      { stdio: "inherit" }
    );
    return;
  }

  const direction = command === "down" ? "down" : "up";

  await runner({
    databaseUrl: process.env.DATABASE_URL!,
    dir: migrationsDir,
    migrationsTable: "pgmigrations",
    direction,
    count: command === "down" ? 1 : undefined,
  });

  console.log(`マイグレーション完了: ${command}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("マイグレーションエラー:", err);
  process.exit(1);
});
