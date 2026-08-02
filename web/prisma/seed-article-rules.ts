import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LAW_ID_KENPOU = "cmoy2s9ec0000bn47zxwf2ekk";
const LAW_ID_SHIREI = "cmoy2s9em0001bn47zmz2g3ls";

type ArticleRuleSeed = {
  sectionRuleSortOrder: number;
  lawId: string;
  articleNumberNormalized: string;
  highlightLevel: string;
  conditionKey: string;
  conditionValues: string[];
  description?: string;
  sortOrder: number;
};

// 用途地域の正式名称（13種+無指定）
const USE_DISTRICTS_ALL = [
  "第一種低層住居専用地域",
  "第二種低層住居専用地域",
  "第一種中高層住居専用地域",
  "第二種中高層住居専用地域",
  "第一種住居地域",
  "第二種住居地域",
  "準住居地域",
  "近隣商業地域",
  "商業地域",
  "準工業地域",
  "工業地域",
  "工業専用地域",
  "用途地域無指定",
];

const articleRules: ArticleRuleSeed[] = [
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 用途地域（useDistrict） — 第48条〜第51条
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 1,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "48",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "用途地域等 — 全地域共通",
    sortOrder: 1,
  },
  {
    sectionRuleSortOrder: 1,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "49",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "特別用途地区",
    sortOrder: 2,
  },
  {
    sectionRuleSortOrder: 1,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "50",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "用途地域等における建築物の制限",
    sortOrder: 3,
  },
  {
    sectionRuleSortOrder: 1,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "51",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: [
      "近隣商業地域",
      "商業地域",
      "準工業地域",
      "工業地域",
      "工業専用地域",
    ],
    description: "卸売市場等の位置",
    sortOrder: 4,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 容積率（floorAreaRatio） — 第52条
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 2,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "52",
    highlightLevel: "article",
    conditionKey: "floorAreaRatio",
    conditionValues: USE_DISTRICTS_ALL,
    description: "容積率 — 用途地域別限度",
    sortOrder: 5,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 建蔽率（buildingCoverage） — 第53条〜第53条の2
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 3,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "53",
    highlightLevel: "article",
    conditionKey: "buildingCoverage",
    conditionValues: USE_DISTRICTS_ALL,
    description: "建蔽率 — 用途地域別限度",
    sortOrder: 6,
  },
  {
    sectionRuleSortOrder: 3,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "53の2",
    highlightLevel: "article",
    conditionKey: "buildingCoverage",
    conditionValues: USE_DISTRICTS_ALL,
    description: "建築物の敷地面積の最低限度",
    sortOrder: 7,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 外壁後退（useDistrict） — 第54条
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 4,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "54",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: [
      "第一種低層住居専用地域",
      "第二種低層住居専用地域",
    ],
    description: "外壁の後退距離（低層住居専用地域）",
    sortOrder: 8,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 高さ制限（heightLimit） — 第55条〜第57条の5
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 5,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "55",
    highlightLevel: "article",
    conditionKey: "heightLimit",
    conditionValues: [
      "第一種低層住居専用地域",
      "第二種低層住居専用地域",
    ],
    description: "絶対高さの制限（低層住居専用地域）",
    sortOrder: 9,
  },
  {
    sectionRuleSortOrder: 5,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "56",
    highlightLevel: "article",
    conditionKey: "heightLimit",
    conditionValues: USE_DISTRICTS_ALL,
    description: "道路斜線制限",
    sortOrder: 10,
  },
  {
    sectionRuleSortOrder: 5,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "56の2",
    highlightLevel: "article",
    conditionKey: "heightLimit",
    conditionValues: [
      "第一種中高層住居専用地域",
      "第二種中高層住居専用地域",
      "第一種住居地域",
      "第二種住居地域",
      "準住居地域",
      "近隣商業地域",
    ],
    description: "日影規制（中高層住居系地域）",
    sortOrder: 11,
  },
  {
    sectionRuleSortOrder: 5,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "57",
    highlightLevel: "article",
    conditionKey: "heightLimit",
    conditionValues: USE_DISTRICTS_ALL,
    description: "高架工作物内の高さ制限緩和",
    sortOrder: 12,
  },
  {
    sectionRuleSortOrder: 5,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "57の2",
    highlightLevel: "article",
    conditionKey: "heightLimit",
    conditionValues: USE_DISTRICTS_ALL,
    description: "特例容積率適用地区",
    sortOrder: 13,
  },
  {
    sectionRuleSortOrder: 5,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "57の4",
    highlightLevel: "article",
    conditionKey: "heightLimit",
    conditionValues: USE_DISTRICTS_ALL,
    description: "特例容積率適用地区内の高さ限度",
    sortOrder: 14,
  },
  {
    sectionRuleSortOrder: 5,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "57の5",
    highlightLevel: "article",
    conditionKey: "heightLimit",
    conditionValues: [
      "第一種住居地域",
      "第二種住居地域",
      "準住居地域",
      "近隣商業地域",
      "商業地域",
    ],
    description: "高層住居誘導地区",
    sortOrder: 15,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 高度地区等（useDistrict） — 第58条〜第60条の3
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 6,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "58",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "高度地区",
    sortOrder: 16,
  },
  {
    sectionRuleSortOrder: 6,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "59",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "高度利用地区",
    sortOrder: 17,
  },
  {
    sectionRuleSortOrder: 6,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "60",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "特定街区",
    sortOrder: 18,
  },
  {
    sectionRuleSortOrder: 6,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "60の2",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "都市再生特別地区",
    sortOrder: 19,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 防火地域（fireDistrict） — 第61条〜第65条
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 7,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "61",
    highlightLevel: "article",
    conditionKey: "fireDistrict",
    conditionValues: ["防火地域", "準防火地域"],
    description: "防火・準防火地域内の建築物",
    sortOrder: 20,
  },
  {
    sectionRuleSortOrder: 7,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "62",
    highlightLevel: "article",
    conditionKey: "fireDistrict",
    conditionValues: ["防火地域", "準防火地域"],
    description: "防火地域内の屋根",
    sortOrder: 21,
  },
  {
    sectionRuleSortOrder: 7,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "63",
    highlightLevel: "article",
    conditionKey: "fireDistrict",
    conditionValues: ["防火地域", "準防火地域"],
    description: "防火地域内の隣地境界線外壁",
    sortOrder: 22,
  },
  {
    sectionRuleSortOrder: 7,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "64",
    highlightLevel: "article",
    conditionKey: "fireDistrict",
    conditionValues: ["防火地域", "準防火地域"],
    description: "防火地域内の看板等防火措置",
    sortOrder: 23,
  },
  {
    sectionRuleSortOrder: 7,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "65",
    highlightLevel: "article",
    conditionKey: "fireDistrict",
    conditionValues: ["防火地域", "準防火地域"],
    description: "防火地域内外にわたる建築物の措置",
    sortOrder: 24,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 地区計画等（useDistrict） — 第67条〜第68条
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 8,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "67",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "特定防災街区整備地区",
    sortOrder: 25,
  },
  {
    sectionRuleSortOrder: 8,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "68",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "条例に基づく制限",
    sortOrder: 26,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 道路関係（useDistrict） — 第42条〜第47条
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 1,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "42",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "道路の定義",
    sortOrder: 27,
  },
  {
    sectionRuleSortOrder: 1,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "43",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "敷地等と道路との関係",
    sortOrder: 28,
  },
  {
    sectionRuleSortOrder: 1,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "44",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "道路内の建築制限",
    sortOrder: 29,
  },
  {
    sectionRuleSortOrder: 1,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "45",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "私道の変更又は廃止の制限",
    sortOrder: 30,
  },
  {
    sectionRuleSortOrder: 1,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "46",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "壁面線の指定",
    sortOrder: 31,
  },
  {
    sectionRuleSortOrder: 1,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "47",
    highlightLevel: "article",
    conditionKey: "useDistrict",
    conditionValues: USE_DISTRICTS_ALL,
    description: "壁面線による建築制限",
    sortOrder: 32,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 居室・設備（buildingUse） — 第28条〜第34条
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 12,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "28",
    highlightLevel: "article",
    conditionKey: "buildingUse",
    conditionValues: [
      "共同住宅", "寄宿舎", "病院", "ホテル", "旅館",
      "学校", "事務所",
    ],
    description: "居室の採光及び換気",
    sortOrder: 33,
  },
  {
    sectionRuleSortOrder: 12,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "29",
    highlightLevel: "article",
    conditionKey: "buildingUse",
    conditionValues: ["共同住宅", "寄宿舎", "病院"],
    description: "地階における居室",
    sortOrder: 34,
  },
  {
    sectionRuleSortOrder: 12,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "30",
    highlightLevel: "article",
    conditionKey: "buildingUse",
    conditionValues: ["共同住宅", "長屋"],
    description: "長屋・共同住宅の界壁",
    sortOrder: 35,
  },
  {
    sectionRuleSortOrder: 13,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "32",
    highlightLevel: "article",
    conditionKey: "structureType",
    conditionValues: ["RC", "SRC", "S", "W"],
    description: "電気設備",
    sortOrder: 36,
  },
  {
    sectionRuleSortOrder: 13,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "33",
    highlightLevel: "article",
    conditionKey: "structureType",
    conditionValues: ["RC", "SRC", "S"],
    description: "避雷設備",
    sortOrder: 37,
  },
  {
    sectionRuleSortOrder: 13,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "34",
    highlightLevel: "article",
    conditionKey: "structureType",
    conditionValues: ["RC", "SRC", "S", "W"],
    description: "昇降機",
    sortOrder: 38,
  },
  {
    sectionRuleSortOrder: 10,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "19",
    highlightLevel: "article",
    conditionKey: "structureType",
    conditionValues: ["RC", "SRC", "S", "W"],
    description: "敷地の衛生及び安全",
    sortOrder: 39,
  },
  {
    sectionRuleSortOrder: 7,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "66",
    highlightLevel: "article",
    conditionKey: "fireDistrict",
    conditionValues: ["防火地域", "準防火地域"],
    description: "第三十八条の準用（防火）",
    sortOrder: 40,
  },
  {
    sectionRuleSortOrder: 5,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "59の2",
    highlightLevel: "article",
    conditionKey: "heightLimit",
    conditionValues: USE_DISTRICTS_ALL,
    description: "敷地内空地のある建築物の容積率等特例",
    sortOrder: 41,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 構造（structureType） — 第20条〜第25条
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 9,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "20",
    highlightLevel: "article",
    conditionKey: "structureType",
    conditionValues: ["RC", "SRC", "S", "W", "CBR", "CFT"],
    description: "構造耐力 — 全構造共通",
    sortOrder: 27,
  },
  {
    sectionRuleSortOrder: 9,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "21",
    highlightLevel: "article",
    conditionKey: "structureType",
    conditionValues: ["RC", "SRC", "S"],
    description: "大規模建築物の主要構造部",
    sortOrder: 28,
  },
  {
    sectionRuleSortOrder: 10,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "22",
    highlightLevel: "article",
    conditionKey: "structureType",
    conditionValues: ["RC", "SRC", "S", "W"],
    description: "屋根（構造種別）",
    sortOrder: 29,
  },
  {
    sectionRuleSortOrder: 10,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "23",
    highlightLevel: "article",
    conditionKey: "structureType",
    conditionValues: ["RC", "SRC", "S", "W"],
    description: "外壁（構造種別）",
    sortOrder: 30,
  },
  {
    sectionRuleSortOrder: 10,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "24",
    highlightLevel: "article",
    conditionKey: "structureType",
    conditionValues: ["RC", "SRC", "S", "W"],
    description: "市街地区域内の構造措置",
    sortOrder: 31,
  },
  {
    sectionRuleSortOrder: 10,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "25",
    highlightLevel: "article",
    conditionKey: "structureType",
    conditionValues: ["W"],
    description: "大規模木造の外壁等",
    sortOrder: 32,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 防火壁・耐火建築物（fireDistrict） — 第26条〜第27条
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 11,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "26",
    highlightLevel: "article",
    conditionKey: "fireDistrict",
    conditionValues: ["防火地域", "準防火地域"],
    description: "防火壁等",
    sortOrder: 33,
  },
  {
    sectionRuleSortOrder: 11,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "27",
    highlightLevel: "article",
    conditionKey: "fireDistrict",
    conditionValues: ["防火地域", "準防火地域"],
    description: "耐火建築物とすべき特殊建築物",
    sortOrder: 34,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 建築物用途（buildingUse） — 第35条〜第35条の3
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 12,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "35",
    highlightLevel: "article",
    conditionKey: "buildingUse",
    conditionValues: [
      "劇場", "映画館", "演芸場", "観覧場", "公会堂", "集会場",
      "病院", "診療所", "ホテル", "旅館", "公寓", "共同住宅",
      "寄宿舎", "学校", "博物館", "百貨店", "マーケット",
      "展示場", "キャバレー", "カフェー", "ナイトクラブ",
      "遊技場", "ダンスホール", "待合", "料理店", "飲食店",
      "商店", "事務所", "工場", "倉庫", "自動車車庫",
    ],
    description: "特殊建築物の避難・消火基準",
    sortOrder: 35,
  },
  {
    sectionRuleSortOrder: 12,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "35の2",
    highlightLevel: "article",
    conditionKey: "buildingUse",
    conditionValues: [
      "劇場", "映画館", "ホテル", "旅館", "共同住宅",
      "病院", "学校", "百貨店", "マーケット", "飲食店",
    ],
    description: "特殊建築物の内装制限",
    sortOrder: 36,
  },
  {
    sectionRuleSortOrder: 12,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "35の3",
    highlightLevel: "article",
    conditionKey: "buildingUse",
    conditionValues: [
      "劇場", "映画館", "ホテル", "旅館", "共同住宅",
      "病院", "学校",
    ],
    description: "無窓居室の主要構造部",
    sortOrder: 37,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 技術的基準（structureType） — 第36条〜第38条
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 13,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "36",
    highlightLevel: "article",
    conditionKey: "structureType",
    conditionValues: ["RC", "SRC", "S", "W", "CBR", "CFT"],
    description: "技術的基準の委任",
    sortOrder: 38,
  },
  {
    sectionRuleSortOrder: 13,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "37",
    highlightLevel: "article",
    conditionKey: "structureType",
    conditionValues: ["RC", "SRC", "S", "W"],
    description: "建築材料の品質",
    sortOrder: 39,
  },
  {
    sectionRuleSortOrder: 13,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "38",
    highlightLevel: "article",
    conditionKey: "structureType",
    conditionValues: ["RC", "SRC", "S", "W", "CBR", "CFT"],
    description: "特殊構造方法",
    sortOrder: 40,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 建築物用途制限（buildingUse） — 第48条
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 14,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "48",
    highlightLevel: "article",
    conditionKey: "buildingUse",
    conditionValues: [
      "劇場", "映画館", "病院", "ホテル", "旅館",
      "共同住宅", "学校", "百貨店", "マーケット",
      "飲食店", "商店", "事務所", "工場", "倉庫",
      "自動車車庫",
    ],
    description: "用途地域別建築物用途制限",
    sortOrder: 41,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 耐火建築物用途（buildingUse） — 第27条
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    sectionRuleSortOrder: 15,
    lawId: LAW_ID_KENPOU,
    articleNumberNormalized: "27",
    highlightLevel: "article",
    conditionKey: "buildingUse",
    conditionValues: [
      "劇場", "映画館", "病院", "ホテル", "旅館",
      "共同住宅", "学校", "百貨店", "マーケット",
      "飲食店", "商店", "事務所", "工場", "倉庫",
    ],
    description: "耐火建築物とすべき特殊建築物（用途別）",
    sortOrder: 42,
  },
];

export async function seedArticleRules() {
  console.log("Seeding ArticleRules...");

  // SectionRule を sortOrder で引けるようにマップ
  const sectionRules = await prisma.sectionRule.findMany();
  const sectionBySort = new Map(
    sectionRules.map((sr) => [sr.sortOrder, sr.id]),
  );

  // Article を articleNumberNormalized で引けるようにマップ
  const articles = await prisma.article.findMany({
    where: { level: "article", deletedAt: null },
    select: { id: true, articleNumberNormalized: true, lawId: true },
  });

  const articleByNorm = new Map<string, string>();
  for (const a of articles) {
    if (a.articleNumberNormalized) {
      articleByNorm.set(`${a.lawId}:${a.articleNumberNormalized}`, a.id);
    }
  }

  let created = 0;
  let skipped = 0;

  for (const rule of articleRules) {
    const sectionRuleId = sectionBySort.get(rule.sectionRuleSortOrder);
    if (!sectionRuleId) {
      console.warn(
        `  Skip: SectionRule sortOrder=${rule.sectionRuleSortOrder} not found`,
      );
      skipped++;
      continue;
    }

    const articleId = articleByNorm.get(
      `${rule.lawId}:${rule.articleNumberNormalized}`,
    );
    if (!articleId) {
      console.warn(
        `  Skip: Article ${rule.articleNumberNormalized} (lawId=${rule.lawId}) not found`,
      );
      skipped++;
      continue;
    }

    await prisma.articleRule.create({
      data: {
        sectionRuleId,
        articleId,
        highlightLevel: rule.highlightLevel,
        conditionKey: rule.conditionKey,
        conditionValues: rule.conditionValues,
        description: rule.description,
        sortOrder: rule.sortOrder,
      },
    });
    created++;
  }

  console.log(`Seeded ${created} ArticleRules (${skipped} skipped)`);
}
