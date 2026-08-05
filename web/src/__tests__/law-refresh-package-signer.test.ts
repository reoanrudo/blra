import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canonicalizeRefreshManifest,
  computeManifestChecksum,
  loadSigningKey,
  signRefreshManifest,
  verifyRefreshManifest,
  type RefreshManifest,
} from "@/lib/law-refresh/package-signer";

/**
 * package-signer の単体テスト。
 *
 * Ed25519 署名による改ざん検知と、canonical JSON の順序非依存性を検証する。
 * 鍵は各テストで generateKeyPairSync で生成した一時鍵を使い、
 * 秘密鍵のファイル I/O は mkdtemp で作成した一時ディレクトリで行う。
 */

const CHECKSUM_HEX = "a".repeat(64);

function baseManifest(overrides: Partial<RefreshManifest> = {}): RefreshManifest {
  return {
    runId: "run-1",
    targetDate: "2026-08-04",
    laws: [
      { lawId: "law-1", from: "rev-1", to: "rev-2", xmlChecksum: CHECKSUM_HEX },
    ],
    ...overrides,
  };
}

describe("signRefreshManifest / verifyRefreshManifest", () => {
  it("同じmanifestは同じchecksumになり改ざんは検証失敗する", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const manifest = baseManifest();
    const signed = signRefreshManifest(manifest, privateKey, "test-key");

    expect(verifyRefreshManifest(signed, publicKey)).toBe(true);
    expect(
      verifyRefreshManifest(
        {
          ...signed,
          manifest: { ...signed.manifest, targetDate: "2026-08-05" },
        },
        publicKey,
      ),
    ).toBe(false);
  });

  it("同じmanifestを2回署名すると同一のchecksumになる（決定論的）", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const manifest = baseManifest();
    const a = signRefreshManifest(manifest, privateKey, "test-key");
    const b = signRefreshManifest(manifest, privateKey, "test-key");

    expect(a.manifestChecksum).toBe(b.manifestChecksum);
    // Ed25519は決定論的署名なので signature も一致する
    expect(a.signature).toBe(b.signature);
  });

  it("object key の出現順が異なっても同じ checksum になる（canonical JSON）", () => {
    // プロパティ挿入順を意図的に変えた manifest を構築
    const manifestA: RefreshManifest = {
      runId: "run-1",
      targetDate: "2026-08-04",
      laws: [
        { lawId: "law-1", from: "rev-1", to: "rev-2", xmlChecksum: CHECKSUM_HEX },
      ],
    };
    const manifestB: RefreshManifest = {
      targetDate: "2026-08-04",
      laws: [
        // law エントリ内の key 順も逆転
        { xmlChecksum: CHECKSUM_HEX, to: "rev-2", from: "rev-1", lawId: "law-1" },
      ],
      runId: "run-1",
    };

    expect(computeManifestChecksum(manifestA)).toBe(
      computeManifestChecksum(manifestB),
    );
  });

  it("空の laws 配列も署名・検証できる", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const manifest: RefreshManifest = {
      runId: "run-empty",
      targetDate: "2026-08-04",
      laws: [],
    };
    const signed = signRefreshManifest(manifest, privateKey, "empty-key");

    expect(verifyRefreshManifest(signed, publicKey)).toBe(true);
    expect(signed.manifestChecksum).toBe(computeManifestChecksum(manifest));
  });

  it("複数要素の laws 配列を署名・検証できる", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const manifest: RefreshManifest = {
      runId: "run-multi",
      targetDate: "2026-08-04",
      laws: [
        { lawId: "law-1", from: "rev-1", to: "rev-2", xmlChecksum: "a".repeat(64) },
        { lawId: "law-2", from: "rev-3", to: "rev-4", xmlChecksum: "b".repeat(64) },
        { lawId: "law-3", from: "rev-5", to: "rev-6", xmlChecksum: "c".repeat(64) },
      ],
    };
    const signed = signRefreshManifest(manifest, privateKey, "multi-key");

    expect(verifyRefreshManifest(signed, publicKey)).toBe(true);
  });

  it("配列要素の順序を変えると checksum が変わる（array 順は保存される）", () => {
    const manifestA: RefreshManifest = {
      runId: "run-1",
      targetDate: "2026-08-04",
      laws: [
        { lawId: "law-1", from: "rev-1", to: "rev-2", xmlChecksum: "a".repeat(64) },
        { lawId: "law-2", from: "rev-3", to: "rev-4", xmlChecksum: "b".repeat(64) },
      ],
    };
    const manifestB: RefreshManifest = {
      runId: "run-1",
      targetDate: "2026-08-04",
      laws: [
        { lawId: "law-2", from: "rev-3", to: "rev-4", xmlChecksum: "b".repeat(64) },
        { lawId: "law-1", from: "rev-1", to: "rev-2", xmlChecksum: "a".repeat(64) },
      ],
    };

    expect(computeManifestChecksum(manifestA)).not.toBe(
      computeManifestChecksum(manifestB),
    );
  });

  describe("改ざん検知（各フィールド）", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const baseSigned = signRefreshManifest(baseManifest(), privateKey, "test-key");

    it("runId を変更すると検証失敗", () => {
      expect(
        verifyRefreshManifest(
          {
            ...baseSigned,
            manifest: { ...baseSigned.manifest, runId: "run-tampered" },
          },
          publicKey,
        ),
      ).toBe(false);
    });

    it("targetDate を変更すると検証失敗", () => {
      expect(
        verifyRefreshManifest(
          {
            ...baseSigned,
            manifest: { ...baseSigned.manifest, targetDate: "2026-12-31" },
          },
          publicKey,
        ),
      ).toBe(false);
    });

    it("lawId を変更すると検証失敗", () => {
      const tamperedLaws = [...baseSigned.manifest.laws];
      tamperedLaws[0] = { ...tamperedLaws[0], lawId: "law-tampered" };
      expect(
        verifyRefreshManifest(
          { ...baseSigned, manifest: { ...baseSigned.manifest, laws: tamperedLaws } },
          publicKey,
        ),
      ).toBe(false);
    });

    it("from を変更すると検証失敗", () => {
      const tamperedLaws = [...baseSigned.manifest.laws];
      tamperedLaws[0] = { ...tamperedLaws[0], from: "rev-tampered" };
      expect(
        verifyRefreshManifest(
          { ...baseSigned, manifest: { ...baseSigned.manifest, laws: tamperedLaws } },
          publicKey,
        ),
      ).toBe(false);
    });

    it("to を変更すると検証失敗", () => {
      const tamperedLaws = [...baseSigned.manifest.laws];
      tamperedLaws[0] = { ...tamperedLaws[0], to: "rev-tampered" };
      expect(
        verifyRefreshManifest(
          { ...baseSigned, manifest: { ...baseSigned.manifest, laws: tamperedLaws } },
          publicKey,
        ),
      ).toBe(false);
    });

    it("xmlChecksum を変更すると検証失敗", () => {
      const tamperedLaws = [...baseSigned.manifest.laws];
      tamperedLaws[0] = { ...tamperedLaws[0], xmlChecksum: "f".repeat(64) };
      expect(
        verifyRefreshManifest(
          { ...baseSigned, manifest: { ...baseSigned.manifest, laws: tamperedLaws } },
          publicKey,
        ),
      ).toBe(false);
    });

    it("laws 配列に要素を追加すると検証失敗", () => {
      const tamperedLaws = [
        ...baseSigned.manifest.laws,
        { lawId: "law-extra", from: "rev-9", to: "rev-10", xmlChecksum: "0".repeat(64) },
      ];
      expect(
        verifyRefreshManifest(
          { ...baseSigned, manifest: { ...baseSigned.manifest, laws: tamperedLaws } },
          publicKey,
        ),
      ).toBe(false);
    });

    it("signature を変更すると検証失敗", () => {
      expect(
        verifyRefreshManifest(
          { ...baseSigned, signature: Buffer.from("tampered").toString("base64") },
          publicKey,
        ),
      ).toBe(false);
    });

    it("manifestChecksum を変更すると検証失敗", () => {
      expect(
        verifyRefreshManifest(
          { ...baseSigned, manifestChecksum: "0".repeat(64) },
          publicKey,
        ),
      ).toBe(false);
    });
  });

  it("別鍵で署名したものを公開鍵で検証すると失敗する", () => {
    const { privateKey: signingKey } = generateKeyPairSync("ed25519");
    const { publicKey: otherPublicKey } = generateKeyPairSync("ed25519");
    const signed = signRefreshManifest(baseManifest(), signingKey, "test-key");

    expect(verifyRefreshManifest(signed, otherPublicKey)).toBe(false);
  });

  it("署名者の signerKeyId を保持する", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const signed = signRefreshManifest(baseManifest(), privateKey, "prod-key-2026");
    expect(signed.signerKeyId).toBe("prod-key-2026");
  });
});

describe("canonicalizeRefreshManifest", () => {
  it("object key が辞書順にソートされる", () => {
    const manifest: RefreshManifest = {
      runId: "run-1",
      targetDate: "2026-08-04",
      laws: [
        { lawId: "law-1", from: "rev-1", to: "rev-2", xmlChecksum: CHECKSUM_HEX },
      ],
    };
    const canonical = canonicalizeRefreshManifest(manifest);
    const parsed = JSON.parse(canonical) as Record<string, unknown>;
    const topKeys = Object.keys(parsed);
    expect(topKeys).toEqual([...topKeys].sort());
    const lawKeys = Object.keys((parsed.laws as Array<Record<string, unknown>>)[0]);
    expect(lawKeys).toEqual([...lawKeys].sort());
  });
});

describe("loadSigningKey", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "blra-signer-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("パス未設定時は SIGNING_KEY_MISSING エラー", async () => {
    delete process.env.LAW_PACKAGE_SIGNING_KEY_PATH;
    delete process.env.LAW_PACKAGE_SIGNER_KEY_ID;
    await expect(loadSigningKey()).rejects.toThrow(/SIGNING_KEY_MISSING/);
  });

  it("keyId 未設定時は SIGNING_KEY_MISSING エラー", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const keyPath = join(dir, "key.pem");
    await writeFile(keyPath, pem, { mode: 0o600 });

    process.env.LAW_PACKAGE_SIGNING_KEY_PATH = keyPath;
    delete process.env.LAW_PACKAGE_SIGNER_KEY_ID;

    await expect(loadSigningKey()).rejects.toThrow(/SIGNING_KEY_MISSING/);

    delete process.env.LAW_PACKAGE_SIGNING_KEY_PATH;
  });

  it("読取不能なファイルは SIGNING_KEY_INVALID エラー", async () => {
    const keyPath = join(dir, "broken.pem");
    await writeFile(keyPath, "not-a-valid-pem", { mode: 0o600 });

    process.env.LAW_PACKAGE_SIGNING_KEY_PATH = keyPath;
    process.env.LAW_PACKAGE_SIGNER_KEY_ID = "test-key";

    await expect(loadSigningKey()).rejects.toThrow(/SIGNING_KEY_INVALID/);

    delete process.env.LAW_PACKAGE_SIGNING_KEY_PATH;
    delete process.env.LAW_PACKAGE_SIGNER_KEY_ID;
  });

  it("存在しないパスは SIGNING_KEY_INVALID エラー", async () => {
    process.env.LAW_PACKAGE_SIGNING_KEY_PATH = join(dir, "missing.pem");
    process.env.LAW_PACKAGE_SIGNER_KEY_ID = "test-key";

    await expect(loadSigningKey()).rejects.toThrow(/SIGNING_KEY_INVALID/);

    delete process.env.LAW_PACKAGE_SIGNING_KEY_PATH;
    delete process.env.LAW_PACKAGE_SIGNER_KEY_ID;
  });

  it("有効な PEM を読み込んで KeyObject と keyId を返す", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const keyPath = join(dir, "valid.pem");
    await writeFile(keyPath, pem, { mode: 0o600 });

    process.env.LAW_PACKAGE_SIGNING_KEY_PATH = keyPath;
    process.env.LAW_PACKAGE_SIGNER_KEY_ID = "prod-key";

    const loaded = await loadSigningKey();
    expect(loaded.keyId).toBe("prod-key");
    expect(loaded.privateKey.asymmetricKeyType).toBe("ed25519");

    delete process.env.LAW_PACKAGE_SIGNING_KEY_PATH;
    delete process.env.LAW_PACKAGE_SIGNER_KEY_ID;
  });

  it("ディレクトリを指定した場合は SIGNING_KEY_INVALID エラー", async () => {
    const subDir = join(dir, "subdir");
    await mkdir(subDir);

    process.env.LAW_PACKAGE_SIGNING_KEY_PATH = subDir;
    process.env.LAW_PACKAGE_SIGNER_KEY_ID = "test-key";

    await expect(loadSigningKey()).rejects.toThrow(/SIGNING_KEY_INVALID/);

    delete process.env.LAW_PACKAGE_SIGNING_KEY_PATH;
    delete process.env.LAW_PACKAGE_SIGNER_KEY_ID;
  });
});
