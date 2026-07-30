/**
 * DESIGN.md 記載のサンプルデータ（法令リーダー Phase 1 静的表示用）。
 *
 * これらは実API未接続時のモック。Phase 2 で /sources/:id/provisions 等へ置き換える。
 * DESIGN.md §「サンプルデータ」からそのまま抽出。
 */

export interface SampleProvisionVersion {
  heading: string | null;
  body: string;
  citation_anchor: string;
  valid_from: string;
}

export interface SampleProvision {
  provision_id: string;
  canonical_path: string;
  provision_type: "ARTICLE" | "PARAGRAPH" | "ITEM";
  stable_label: string;
  version: SampleProvisionVersion;
}

export interface SampleTocItem {
  label: string;
  path: string;
  current?: boolean;
  chapter?: string;
}

export interface SampleReferenceEdge {
  edge_id: string;
  target_label: string;
  edge_type: "DELEGATES_TO" | "DEFINES" | "EXCEPTS" | "CITES";
  resolution_status: "RESOLVED" | "UNCONFIRMED" | "UNRESOLVED";
}

/** 法令メタデータ（出典バッジ用） */
export const sampleSource = {
  source_id: "sample-build-law",
  title: "建築基準法",
  law_number: "昭和二十五年法律第二百一号",
  authority_class: "PRIMARY_LAW" as const,
  valid_from: "2025-04-01",
  verification_status: "GAZETTE_VERIFIED" as const,
};

/** 現在位置（柱用） */
export const sampleRunner = {
  lawName: "建築基準法",
  breadcrumb: "第5章 避難施設等 ＞ 第35条",
};

/** 目次（左パネル）。DESIGN.md 記載の項目 */
export const sampleToc: SampleTocItem[] = [
  { label: "第4章 建築設備", path: "ch4", chapter: "第4章 建築設備" },
  { label: "第5章 避難施設等", path: "ch5", chapter: "第5章 避難施設等" },
  { label: "第34条 昇降機", path: "art34" },
  {
    label: "第35条 特殊建築物等の避難及び消火",
    path: "art35",
    current: true,
  },
  { label: "第35条の2 特殊建築物等の内装", path: "art35-2" },
  { label: "第35条の3 無窓の居室等の主要構造部", path: "art35-3" },
  { label: "第36条 この章の規定の適用除外", path: "art36" },
  { label: "第6章 建築物の用途", path: "ch6", chapter: "第6章 建築物の用途" },
];

/**
 * 第35条（DESIGN.md 記載の本文）。
 * 参照リンクを張る語句を埋め込むため、本文をセグメント分割して表現する。
 */
export interface BodySegment {
  text: string;
  /** 参照の種類。null なら通常テキスト */
  ref?: {
    label: string;
    status: "RESOLVED" | "UNCONFIRMED" | "UNRESOLVED";
    target?: string;
  };
}

export const sampleArticle35: {
  articleNum: string;
  caption: string;
  segments: BodySegment[];
} = {
  articleNum: "第三十五条",
  caption: "特殊建築物等の避難及び消火に関する技術的基準",
  segments: [
    {
      text: "",
      ref: {
        label: "別表第一（い）欄",
        status: "RESOLVED",
        target: "別表第一",
      },
    },
    {
      text: "（い）欄（一）項から（四）項までに掲げる用途に供する特殊建築物、階数が三以上である建築物、",
    },
    {
      text: "",
      ref: {
        label: "政令で定める窓その他の開口部を有しない居室",
        status: "RESOLVED",
        target: "令第126条の2",
      },
    },
    {
      text: "を有する建築物又は延べ面積（同一敷地内に二以上の建築物がある場合においては、その延べ面積の合計）が千平方メートルをこえる建築物については、廊下、階段、出入口その他の避難施設、消火栓、スプリンクラー、貯水槽その他の消火設備、排煙設備、非常用の照明装置及び進入口並びに敷地内の避難上及び消火上必要な通路は、",
    },
    {
      text: "",
      ref: {
        label: "政令で定める技術的基準",
        status: "RESOLVED",
        target: "令第126条の2 排煙設備の設置",
      },
    },
    {
      text: "に従つて、避難上及び消火上支障がないようにしなければならない。",
    },
  ],
};

/** 第35条の3（DESIGN.md 記載） */
export const sampleArticle35_3: {
  articleNum: string;
  caption: string;
  body: string;
} = {
  articleNum: "第三十五条の三",
  caption: "無窓の居室等の主要構造部",
  body: "政令で定める窓その他の開口部を有しない居室は、その居室を区画する主要構造部を耐火構造とし、又は不燃材料で造らなければならない。ただし、別表第一（い）欄（一）項に掲げる用途に供するものについては、この限りでない。",
};

/**
 * サポートペイン「関連」（DESIGN.md §5 記載）。
 * 型ラベル付きで縦に並べる。順序: 委任先→定義→例外→参照→未確認→未解決
 */
export const sampleReferences: SampleReferenceEdge[] = [
  {
    edge_id: "ref-1",
    target_label: "令第126条の2 排煙設備の設置",
    edge_type: "DELEGATES_TO",
    resolution_status: "RESOLVED",
  },
  {
    edge_id: "ref-2",
    target_label: "法第2条第1項第九号の二 耐火建築物",
    edge_type: "DEFINES",
    resolution_status: "RESOLVED",
  },
  {
    edge_id: "ref-3",
    target_label: "令第126条の2第1項第一号 適用しない部分",
    edge_type: "EXCEPTS",
    resolution_status: "RESOLVED",
  },
  {
    edge_id: "ref-4",
    target_label: "別表第一（い）欄",
    edge_type: "CITES",
    resolution_status: "RESOLVED",
  },
  {
    edge_id: "ref-5",
    target_label: "経過措置候補（附則第3条）",
    edge_type: "CITES",
    resolution_status: "UNCONFIRMED",
  },
  {
    edge_id: "ref-6",
    target_label: "消防法第17条",
    edge_type: "CITES",
    resolution_status: "UNRESOLVED",
  },
];

/**
 * 注意帯（NoticeBand）。DESIGN.md §3 記載。
 * 優先順序は §19.10.3 だが、Phase 1 では DESIGN.md 記載の2種のみ。
 */
export interface SampleNotice {
  kind: "caution" | "info";
  icon: string;
  text: string;
  action: { label: string };
}

export const sampleNotices: SampleNotice[] = [
  {
    kind: "caution",
    icon: "⚠",
    text: "この条文には経過措置を定めた附則があります（○○法改正法 附則第3条）",
    action: { label: "附則を開く" },
  },
  {
    kind: "info",
    icon: "ℹ",
    text: "未施行の改正があります（2027-05-26 施行予定）",
    action: { label: "新旧を比較" },
  },
];

/** 適用時点バー（DESIGN.md §1） */
export const sampleAsOf = {
  project: "案件A",
  anchor: "確認申請日",
  date: "2026-10-01",
};

/** 出典バッジ（DESIGN.md §2） */
export const sampleSourceBadges = [
  { label: "法律", tone: "primary" as const },
  { label: "2025-04-01 施行版", tone: "version" as const },
  { label: "官報確認済", tone: "verified" as const },
];
