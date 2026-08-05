/**
 * 法令データ更新manifestの署名・検証モジュール。
 *
 * 更新manifest（RefreshManifest）を canonical JSON 化して SHA-256 checksum を計算し、
 * Ed25519 秘密鍵で checksum に署名する。検証時は manifest の再計算 checksum と
 * signature の正当性を両方確認することで、manifest 本体・checksum・署名のいずれの
 * 改ざんも検知する。
 *
 * 秘密鍵は環境変数 LAW_PACKAGE_SIGNING_KEY_PATH で指定した PEM ファイルから読み込む。
 * 鍵が未設定の場合は SIGNING_KEY_MISSING、読取不能な場合は SIGNING_KEY_INVALID の
 * エラーを投げ、更新パイプラインは署名なしで有効化しない。
 */

import {
  createHash,
  createPrivateKey,
  type KeyObject,
  sign,
  verify,
} from "node:crypto";
import { readFile, stat } from "node:fs/promises";

/** 更新対象となる法令単位の差分エントリ。 */
export interface RefreshManifestLaw {
  lawId: string;
  from: string;
  to: string;
  xmlChecksum: string;
}

/**
 * 更新manifest。runId 単位で不変とし、対象法令の from/to リビジョンと XML checksum を保持する。
 * このオブジェクト全体が署名対象となる。
 */
export interface RefreshManifest {
  runId: string;
  targetDate: string;
  laws: RefreshManifestLaw[];
}

/** 署名付き更新manifest。検証者は manifest・checksum・署名・鍵IDを照合する。 */
export interface SignedRefreshManifest {
  manifest: RefreshManifest;
  manifestChecksum: string;
  signature: string;
  signerKeyId: string;
}

/** 環境から読み込んだ署名用鍵の束。 */
export interface LoadedSigningKey {
  privateKey: KeyObject;
  keyId: string;
}

/**
 * 値を canonical 形式へ正規化する。
 *
 * - object の key は辞書順にソートする（挿入順に依存しない）
 * - array の要素順は入力順をそのまま維持する（順序も意味を持つため）
 * - プリミティブはそのまま返す
 *
 * 戻り値を JSON.stringify すると、key がソート済みの object になるため、
 * 呼び出し側のプロパティ挿入順に依存しない安定した文字列表現が得られる。
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * manifest を canonical JSON 文字列へ変換する。
 *
 * プロパティの挿入順に依存せず、object key は常に辞書順で直列化される。
 * array 要素の順序は入力順を維持する。
 */
export function canonicalizeRefreshManifest(manifest: RefreshManifest): string {
  return JSON.stringify(canonicalize(manifest));
}

/**
 * manifest の SHA-256 checksum（hex）を計算する。
 *
 * canonical JSON のバイト列に対する SHA-256。同じ内容の manifest は
 * プロパティ順によらず常に同じ checksum になる。
 */
export function computeManifestChecksum(manifest: RefreshManifest): string {
  const canonical = canonicalizeRefreshManifest(manifest);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * manifest に Ed25519 署名を付与して SignedRefreshManifest を返す。
 *
 * 署名対象は checksum の hex 文字列を UTF-8 でエンコードしたバイト列ではなく、
 * checksum を表す生バイト列（hex デコード）とする。これにより checksum 文字列表現の
 * 表揺れ（大文字/小文字など）を回避し、バイト値で一意に署名する。
 *
 * @param manifest 署名対象の更新manifest
 * @param privateKey Ed25519 秘密鍵
 * @param signerKeyId 署名鍵の識別子（検証側で公開鍵を特定するため）
 */
export function signRefreshManifest(
  manifest: RefreshManifest,
  privateKey: KeyObject,
  signerKeyId: string,
): SignedRefreshManifest {
  const manifestChecksum = computeManifestChecksum(manifest);
  const checksumBytes = Buffer.from(manifestChecksum, "hex");
  const signature = sign(null, checksumBytes, privateKey);
  return {
    manifest,
    manifestChecksum,
    signature: signature.toString("base64"),
    signerKeyId,
  };
}

/**
 * SignedRefreshManifest を公開鍵で検証する。
 *
 * 次の2点を両方満たす場合にのみ true を返す。
 * 1. signed.manifest を再計算した checksum が signed.manifestChecksum と一致する
 * 2. signed.manifestChecksum に対する署名が publicKey で正当と検証される
 *
 * これにより、manifest 本体・checksum・署名のいずれを改ざんしても検証失敗する。
 */
export function verifyRefreshManifest(
  signed: SignedRefreshManifest,
  publicKey: KeyObject,
): boolean {
  const recomputed = computeManifestChecksum(signed.manifest);
  if (recomputed !== signed.manifestChecksum) {
    return false;
  }
  const checksumBytes = Buffer.from(signed.manifestChecksum, "hex");
  const signatureBytes = Buffer.from(signed.signature, "base64");
  try {
    return verify(null, checksumBytes, publicKey, signatureBytes);
  } catch {
    return false;
  }
}

/**
 * 環境変数から署名用秘密鍵を読み込む。
 *
 * - LAW_PACKAGE_SIGNING_KEY_PATH: PEM ファイルのパス
 * - LAW_PACKAGE_SIGNER_KEY_ID: 鍵の識別子（検証側で公開鍵を特定するため）
 *
 * どちらか未設定の場合は SIGNING_KEY_MISSING エラー。
 * ファイルが存在しない・読取不能・不正な PEM の場合は SIGNING_KEY_INVALID エラー。
 * いずれのエラーでも更新パイプラインは署名を生成できず、更新を有効化しない。
 */
export async function loadSigningKey(): Promise<LoadedSigningKey> {
  const keyPath = process.env.LAW_PACKAGE_SIGNING_KEY_PATH;
  const keyId = process.env.LAW_PACKAGE_SIGNER_KEY_ID;

  if (!keyPath || !keyId) {
    throw new Error(
      "SIGNING_KEY_MISSING: LAW_PACKAGE_SIGNING_KEY_PATH または LAW_PACKAGE_SIGNER_KEY_ID が未設定です。更新manifestの署名を行わないため、更新パイプラインを有効化できません。",
    );
  }

  let pem: string;
  try {
    // ディレクトリやキャラクタデバイスなどを弾くため、通常ファイルであることを確認する
    const info = await stat(keyPath);
    if (!info.isFile()) {
      throw new Error("not a regular file");
    }
    pem = await readFile(keyPath, "utf8");
  } catch (cause) {
    throw new Error(
      `SIGNING_KEY_INVALID: 秘密鍵ファイル (${keyPath}) を読み込めませんでした。パス・権限・フォーマットを確認してください。`,
      { cause },
    );
  }

  try {
    const privateKey = createPrivateKey(pem);
    if (privateKey.asymmetricKeyType !== "ed25519") {
      throw new Error(
        `expected ed25519 key but got ${String(privateKey.asymmetricKeyType)}`,
      );
    }
    return { privateKey, keyId };
  } catch (cause) {
    throw new Error(
      `SIGNING_KEY_INVALID: 秘密鍵ファイル (${keyPath}) を Ed25519 秘密鍵として解析できませんでした。PEM フォーマットと鍵種別を確認してください。`,
      { cause },
    );
  }
}
