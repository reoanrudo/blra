import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";

// テスト実行前に .env を読み込む
loadEnv();

export default defineConfig({
  test: {
    // DB を使うテストはシーケンシャルに実行（並行接続の競合を避ける）
    fileParallelism: false,
    // テストのタイムアウト（DB 起動待ちを考慮）
    testTimeout: 30000,
    // reference/ は外部コードの参照用。テスト対象から除外
    exclude: ["**/node_modules/**", "**/dist/**", "**/reference/**", "**/spikes/**"],
    // テストファイルの検索範囲を限定
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
  },
});
