/**
 * 原本XMLのローカルファイルシステム保存・読込。
 *
 * 設計書 §8.1: Raw Artifact Store — Object Storage へ原本を先に保存。
 * M3 では Object Storage の代わりにローカルFS を使う。
 * raw_object_key 列に相対パス（"{sourceId}/{hash}.xml"）を格納する。
 * 将来 S3 へ移行する場合はこのモジュールの実装を差し替えるだけでよい。
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { config } from "../config.js";

interface SaveParams {
  xml: string;
  sourceId: string;
  contentHash: string;
  /** テスト用に上書き可能。省略時は config.rawDataDir */
  baseDir?: string;
}

interface ReadParams {
  /** saveRawArtifact が返した objectKey */
  objectKey: string;
  /** テスト用に上書き可能。省略時は config.rawDataDir */
  baseDir?: string;
}

/**
 * 原本XMLを保存し、raw_object_key（相対パス）を返す。
 * 同じ contentHash で再保存した場合は上書きされる（冪等）。
 */
export async function saveRawArtifact(params: SaveParams): Promise<string> {
  const base = params.baseDir ?? config.rawDataDir;
  const objectKey = `${params.sourceId}/${params.contentHash}.xml`;
  const fullPath = join(base, objectKey);

  // ディレクトリが無ければ作成（recursive で親も含む）
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, params.xml, "utf-8");

  return objectKey;
}

/**
 * 保存した原本XMLを読み込む。
 */
export async function readRawArtifact(params: ReadParams): Promise<string> {
  const base = params.baseDir ?? config.rawDataDir;
  const fullPath = join(base, params.objectKey);
  return readFile(fullPath, "utf-8");
}
