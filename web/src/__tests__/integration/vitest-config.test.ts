import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const configPath = fileURLToPath(new URL("../../../vitest.config.mts", import.meta.url));

describe("Vitest統合テスト設定", () => {
  it("DB統合テスト用にテストファイルを直列実行する", async () => {
    const config = await readFile(configPath, "utf8");

    expect(config).toContain("fileParallelism: false");
  });
});
