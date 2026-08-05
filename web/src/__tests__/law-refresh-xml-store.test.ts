import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FileSystemLawXmlStore,
  type FetchedLawXml,
} from "@/lib/law-refresh/xml-store";

const XML_A = "<Law><MainProvision><Article/></MainProvision></Law>";
const XML_B =
  "<Law><MainProvision><Article Num=\"1\"/></MainProvision></Law>";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const fetchedInput = (overrides: Partial<FetchedLawXml> = {}): FetchedLawXml => ({
  lawId: "law-1",
  revisionId: "rev-1",
  xml: XML_A,
  checksum: sha256(XML_A),
  sourceUrl: "https://example.invalid/law_file/xml/law-1",
  fetchedAt: new Date("2026-08-04T00:00:00Z"),
  ...overrides,
});

describe("FileSystemLawXmlStore.put", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "blra-law-xml-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("同じRevisionへ異なるXMLを保存しようとすると拒否する", async () => {
    const store = new FileSystemLawXmlStore(root);
    await store.put({ lawId: "law-1", revisionId: "rev-1", xml: XML_A });
    await expect(
      store.put({ lawId: "law-1", revisionId: "rev-1", xml: XML_B }),
    ).rejects.toMatchObject({ code: "XML_CHECKSUM_CONFLICT" });
  });

  it("同じ内容（同じchecksum）の再保存は冪等に成功する", async () => {
    const store = new FileSystemLawXmlStore(root);
    const first = await store.put({
      lawId: "law-1",
      revisionId: "rev-1",
      xml: XML_A,
    });
    const second = await store.put({
      lawId: "law-1",
      revisionId: "rev-1",
      xml: XML_A,
    });

    expect(second.storedPath).toBe(first.storedPath);
    expect(second.checksum).toBe(first.checksum);
  });

  it("異なるrevisionへは別々に保存できる", async () => {
    const store = new FileSystemLawXmlStore(root);
    const a = await store.put({
      lawId: "law-1",
      revisionId: "rev-1",
      xml: XML_A,
    });
    const b = await store.put({
      lawId: "law-1",
      revisionId: "rev-2",
      xml: XML_B,
    });

    expect(a.storedPath).not.toBe(b.storedPath);
    expect(a.checksum).not.toBe(b.checksum);
  });

  it("保存先は <root>/<lawId>/<revisionId>/<sha256>.xml になる", async () => {
    const store = new FileSystemLawXmlStore(root);
    const result = await store.put({
      lawId: "law-1",
      revisionId: "rev-1",
      xml: XML_A,
    });

    const expected = join(root, "law-1", "rev-1", `${sha256(XML_A)}.xml`);
    expect(result.storedPath).toBe(expected);
  });

  it("保存したファイルの内容は入力XMLと一致する", async () => {
    const store = new FileSystemLawXmlStore(root);
    const result = await store.put({
      lawId: "law-1",
      revisionId: "rev-1",
      xml: XML_A,
    });

    const written = await readFile(result.storedPath, "utf8");
    expect(written).toBe(XML_A);
  });

  it("戻り値のchecksumはXML本文のSHA-256と一致する", async () => {
    const store = new FileSystemLawXmlStore(root);
    const result = await store.put({
      lawId: "law-1",
      revisionId: "rev-1",
      xml: XML_A,
    });

    expect(result.checksum).toBe(sha256(XML_A));
  });

  it("root未設定（LAW_XML_STORAGE_DIR未定義）の既定storeは構築時に例外", () => {
    const previous = process.env.LAW_XML_STORAGE_DIR;
    delete process.env.LAW_XML_STORAGE_DIR;
    try {
      expect(() => new FileSystemLawXmlStore()).toThrow(/LAW_XML_STORAGE_DIR/);
    } finally {
      if (previous !== undefined) process.env.LAW_XML_STORAGE_DIR = previous;
    }
  });

  it("環境変数LAW_XML_STORAGE_DIRを既定rootとして扱う", async () => {
    const previous = process.env.LAW_XML_STORAGE_DIR;
    process.env.LAW_XML_STORAGE_DIR = root;
    try {
      const store = new FileSystemLawXmlStore();
      const result = await store.put({
        lawId: "law-env",
        revisionId: "rev-env",
        xml: XML_A,
      });
      expect(result.storedPath.startsWith(root)).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.LAW_XML_STORAGE_DIR;
      } else {
        process.env.LAW_XML_STORAGE_DIR = previous;
      }
    }
  });

  it("既存ファイルのchecksumと異なる内容で上書き保存しようとするとconflict", async () => {
    // 手動で既存ファイルを配置（checksumを直接偽装しない・実際のSHA-256で配置）
    const store = new FileSystemLawXmlStore(root);
    await store.put({ lawId: "law-1", revisionId: "rev-1", xml: XML_A });

    // 同じ revision 配下で異なるXML（異るchecksumファイル名）を保存しようとすると拒否
    await expect(
      store.put({ lawId: "law-1", revisionId: "rev-1", xml: XML_B }),
    ).rejects.toMatchObject({ code: "XML_CHECKSUM_CONFLICT" });
  });
});
