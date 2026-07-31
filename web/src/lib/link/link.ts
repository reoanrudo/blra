/**
 * リンク（参照）表示用の型定義。
 *
 * 元は hourei-rag から移植した Prisma データ取得関数を含んでいたが、
 * blra は API（api/client.ts）経由で参照データを取得するため、
 * このファイルには表示用の型のみ残す。
 * データ取得は ReaderPage が useReferences フックで行う。
 */

export interface OutgoingLinkRow {
  id: string;
  sourceId: string;
  targetId: string | null;
  linkType: string;
  sourceRange: string | null;
  isResolved: boolean;
  targetLawName: string | null;
  targetText: string | null;
  targetArticleNumberNormalized: string | null;
  // JOIN fields from target Article
  targetArticleNumber: string | null;
  targetCaption: string | null;
  targetLawShortName: string | null;
}

export interface IncomingLinkRow {
  id: string;
  sourceId: string;
  targetId: string | null;
  linkType: string;
  sourceRange: string | null;
  isResolved: boolean;
  targetText: string | null;
  // JOIN fields from source Article
  sourceArticleNumberNormalized: string | null;
  sourceCaption: string | null;
  sourceLawShortName: string | null;
}
