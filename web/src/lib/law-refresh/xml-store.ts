import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FetchedLawXml } from "./egov-client";

export type { FetchedLawXml } from "./egov-client";

/**
 * 保存済みの公式XMLとその配置情報。
 * put の戻り値で、不変保存が確定したファイル位置とchecksumを返す。
 */
export interface StoredLawXml {
  lawId: string;
  revisionId: string;
  checksum: string;
  storedPath: string;
}

/**
 * 同じ revision へ異なる内容のXMLを保存しようとしたときの例外コード。
 * 保存先パスは <root>/<lawId>/<revisionId>/<sha256>.xml であり、
 * 1つの revision ディレクトリに複数の checksum ファイルが並存することは不整合とみなす。
 */
export interface XmlChecksumConflictError {
  code: "XML_CHECKSUM_CONFLICT";
  lawId: string;
  revisionId: string;
  expectedChecksum: string;
  actualChecksum: string;
  storedPath: string;
}

interface PutInput extends Pick<FetchedLawXml, "lawId" | "revisionId" | "xml"> {}

/**
 * ファイルシステム上に公式XMLを不変保存するstore。
 *
 * 保存先: `<root>/<lawId>/<revisionId>/<sha256>.xml`
 * - 一時ファイルへ書き込み後、rename して原子的に確定する。
 * - 同じ revision 配下へ異なる checksum のXMLを保存しようとすると
 *   { code: "XML_CHECKSUM_CONFLICT" } で拒否する。
 * - 同じ checksum（同じ内容）の再保存は冪等に成功する。
 * - root は環境変数 `LAW_XML_STORAGE_DIR` が必須。コンストラクタ引数で明示上書き可能。
 */
export class FileSystemLawXmlStore {
  private readonly root: string;

  constructor(root?: string) {
    const resolved = root ?? process.env.LAW_XML_STORAGE_DIR;
    if (!resolved) {
      throw new Error(
        "FileSystemLawXmlStore: 環境変数 LAW_XML_STORAGE_DIR が未設定です",
      );
    }
    this.root = resolved;
  }

  /**
   * 公式XMLを不変保存する。
   * 同じ revision への異なる内容の保存は拒否し、同じ内容の再保存は冪等に成功する。
   */
  async put(input: PutInput): Promise<StoredLawXml> {
    const checksum = createHash("sha256").update(input.xml).digest("hex");
    const revisionDir = join(this.root, input.lawId, input.revisionId);
    const targetPath = join(revisionDir, `${checksum}.xml`);

    // 既存 revision ディレクトリ内で checksum の一意性を検査する。
    // 同じ revision へ異なる XML が並存するのは不整合なので拒否する。
    await this.assertRevisionChecksumUnique(
      input.lawId,
      input.revisionId,
      revisionDir,
      checksum,
    );

    // 冪等性: 既に対象ファイルが存在するなら再書き込みせずそのまま返す
    if (await this.pathExists(targetPath)) {
      return {
        lawId: input.lawId,
        revisionId: input.revisionId,
        checksum,
        storedPath: targetPath,
      };
    }

    await mkdir(revisionDir, { recursive: true });

    // 一時ファイルへ書き込み後、rename して原子的に確定する
    const stagingDir = join(tmpdir(), "blra-law-xml-stage");
    await mkdir(stagingDir, { recursive: true });
    const tempPath = join(
      stagingDir,
      `${input.lawId}-${input.revisionId}-${randomBytes(8).toString("hex")}.xml`,
    );
    await writeFile(tempPath, input.xml, "utf8");
    // 対象が他プロセスによって作成されていた場合の競合を許容し、冪等へ倒す
    try {
      await rename(tempPath, targetPath);
    } catch (error) {
      if (await this.pathExists(targetPath)) {
        return {
          lawId: input.lawId,
          revisionId: input.revisionId,
          checksum,
          storedPath: targetPath,
        };
      }
      throw error;
    }

    return {
      lawId: input.lawId,
      revisionId: input.revisionId,
      checksum,
      storedPath: targetPath,
    };
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  private async assertRevisionChecksumUnique(
    lawId: string,
    revisionId: string,
    revisionDir: string,
    expectedChecksum: string,
  ): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(revisionDir);
    } catch {
      // ディレクトリ未存在なら衝突のしようがない
      return;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".xml")) continue;
      const existingChecksum = entry.slice(0, -".xml".length);
      if (existingChecksum === expectedChecksum) continue; // 同じ内容はOK（冪等）
      // 同じ revision 配下に異なる checksum のXMLが存在する＝不整合
      const conflict: XmlChecksumConflictError = {
        code: "XML_CHECKSUM_CONFLICT",
        lawId,
        revisionId,
        expectedChecksum: existingChecksum,
        actualChecksum: expectedChecksum,
        storedPath: join(revisionDir, entry),
      };
      throw Object.assign(new Error("XML_CHECKSUM_CONFLICT"), conflict);
    }
  }
}
