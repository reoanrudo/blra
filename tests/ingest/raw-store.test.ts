/**
 * raw-store.ts のユニットテスト。
 * 実際のFS（os.tmpdir 配下の一時ディレクトリ）を使う。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveRawArtifact, readRawArtifact } from "../../src/ingest/raw-store.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "blra-raw-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("saveRawArtifact", () => {
  it("正常保存: {tempDir}/{sourceId}/{hash}.xml が作成される", async () => {
    const xml = "<Law><LawBody/></Law>";
    const result = await saveRawArtifact({
      xml,
      sourceId: "source-001",
      contentHash: "abcdef0123456789",
      baseDir: tempDir,
    });

    expect(result).toBe("source-001/abcdef0123456789.xml");

    // ファイルが実際に存在し、内容が一致する
    const saved = await readFile(join(tempDir, "source-001", "abcdef0123456789.xml"), "utf-8");
    expect(saved).toBe(xml);
  });

  it("冪等保存: 同じハッシュで2回保存 → ファイル1つ（上書きされる）", async () => {
    const xml = "<Law/>";
    await saveRawArtifact({ xml, sourceId: "s1", contentHash: "hash001", baseDir: tempDir });
    await saveRawArtifact({ xml, sourceId: "s1", contentHash: "hash001", baseDir: tempDir });

    // 同じパスへ2回書いてもエラーにならず、内容が保持される
    const saved = await readRawArtifact({ objectKey: "s1/hash001.xml", baseDir: tempDir });
    expect(saved).toBe(xml);
  });

  it("異なる sourceId は別ディレクトリに保存される", async () => {
    await saveRawArtifact({ xml: "<A/>", sourceId: "s1", contentHash: "h1", baseDir: tempDir });
    await saveRawArtifact({ xml: "<B/>", sourceId: "s2", contentHash: "h2", baseDir: tempDir });

    const a = await readRawArtifact({ objectKey: "s1/h1.xml", baseDir: tempDir });
    const b = await readRawArtifact({ objectKey: "s2/h2.xml", baseDir: tempDir });
    expect(a).toBe("<A/>");
    expect(b).toBe("<B/>");
  });
});

describe("readRawArtifact", () => {
  it("保存したファイルを復元できる", async () => {
    const xml = "<Law>復元テスト</Law>";
    await saveRawArtifact({ xml, sourceId: "s-read", contentHash: "h-read", baseDir: tempDir });

    const restored = await readRawArtifact({ objectKey: "s-read/h-read.xml", baseDir: tempDir });
    expect(restored).toBe(xml);
  });
});
