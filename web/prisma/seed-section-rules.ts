import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LAW_ID_KENPOU = "cmoy2s9ec0000bn47zxwf2ekk"; // 建築基準法
const LAW_ID_SHIREI = "cmoy2s9em0001bn47zmz2g3ls"; // 建築基準法施行令

type SectionRuleSeed = {
  lawId: string;
  sectionStart: string;
  sectionEnd: string;
  conditionType: string;
  label: string;
  sortOrder: number;
};

const sectionRules: SectionRuleSeed[] = [
  // ── 用途地域 ──
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第48条",
    sectionEnd: "第51条",
    conditionType: "useDistrict",
    label: "用途地域等の制限",
    sortOrder: 1,
  },
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第52条",
    sectionEnd: "第52条",
    conditionType: "floorAreaRatio",
    label: "容積率",
    sortOrder: 2,
  },
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第53条",
    sectionEnd: "第53条の2",
    conditionType: "buildingCoverage",
    label: "建蔽率",
    sortOrder: 3,
  },
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第54条",
    sectionEnd: "第54条",
    conditionType: "useDistrict",
    label: "外壁の後退距離（第一種低層住居専用地域等）",
    sortOrder: 4,
  },
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第55条",
    sectionEnd: "第57条の5",
    conditionType: "heightLimit",
    label: "建築物の高さの制限",
    sortOrder: 5,
  },
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第58条",
    sectionEnd: "第60条の3",
    conditionType: "useDistrict",
    label: "高度地区・高度利用地区等",
    sortOrder: 6,
  },
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第61条",
    sectionEnd: "第65条",
    conditionType: "fireDistrict",
    label: "防火地域及び準防火地域",
    sortOrder: 7,
  },
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第67条",
    sectionEnd: "第68条",
    conditionType: "useDistrict",
    label: "特定防災街区整備地区・地区計画等",
    sortOrder: 8,
  },

  // ── 構造 ──
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第20条",
    sectionEnd: "第21条",
    conditionType: "structureType",
    label: "構造耐力",
    sortOrder: 9,
  },
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第22条",
    sectionEnd: "第25条",
    conditionType: "structureType",
    label: "主要構造部（屋根・外壁・防火壁）",
    sortOrder: 10,
  },
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第26条",
    sectionEnd: "第27条",
    conditionType: "fireDistrict",
    label: "防火壁・耐火建築物",
    sortOrder: 11,
  },
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第35条",
    sectionEnd: "第35条の3",
    conditionType: "buildingUse",
    label: "特殊建築物の避難・内装",
    sortOrder: 12,
  },
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第36条",
    sectionEnd: "第38条",
    conditionType: "structureType",
    label: "技術的基準・特殊構造方法",
    sortOrder: 13,
  },

  // ── 建築物用途 ──
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第48条",
    sectionEnd: "第48条",
    conditionType: "buildingUse",
    label: "用途地域等別の建築物用途制限",
    sortOrder: 14,
  },
  {
    lawId: LAW_ID_KENPOU,
    sectionStart: "第27条",
    sectionEnd: "第27条",
    conditionType: "buildingUse",
    label: "耐火建築物とすべき特殊建築物",
    sortOrder: 15,
  },

  // ── 施行令 ──
  {
    lawId: LAW_ID_SHIREI,
    sectionStart: "第130条の10",
    sectionEnd: "第137条の5",
    conditionType: "buildingUse",
    label: "施行令：用途別構造基準",
    sortOrder: 16,
  },
  {
    lawId: LAW_ID_SHIREI,
    sectionStart: "第107条",
    sectionEnd: "第112条",
    conditionType: "fireDistrict",
    label: "施行令：防火規定",
    sortOrder: 17,
  },
  {
    lawId: LAW_ID_SHIREI,
    sectionStart: "第73条",
    sectionEnd: "第82条",
    conditionType: "structureType",
    label: "施行令：構造強度",
    sortOrder: 18,
  },
  {
    lawId: LAW_ID_SHIREI,
    sectionStart: "第135条の2",
    sectionEnd: "第135条の2の18",
    conditionType: "useDistrict",
    label: "施行令：用途地域等の制限",
    sortOrder: 19,
  },
];

export async function seedSectionRules() {
  console.log("Seeding SectionRules...");

  // 既存データをクリア
  await prisma.articleRule.deleteMany();
  await prisma.sectionRule.deleteMany();

  for (const rule of sectionRules) {
    await prisma.sectionRule.create({ data: rule });
  }

  console.log(`Seeded ${sectionRules.length} SectionRules`);
}
