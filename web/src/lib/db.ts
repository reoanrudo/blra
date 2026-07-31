/**
 * db stub — hourei-rag からの移植時に Prisma を置き換える仮のモジュール。
 *
 * 本来は blra バックエンドの API クライアントに置き換える。
 * それまでの間、型チェックを通すための空実装を提供する。
 */

// 最低限の Prisma 型互換スタブ
export const prisma = {
  $queryRawUnsafe: async <T>(..._args: any[]): Promise<T> => {
    return [] as unknown as T;
  },
  articleAnnotation: {
    findMany: async (..._args: any[]) => [],
  },
  articleNote: {
    findMany: async (..._args: any[]) => [],
  },
};
