// ── 用途地域（13種 + 無指定） ──
export const USE_DISTRICT_OPTIONS = [
  { value: "第一種低層住居専用地域", short: "一低専" },
  { value: "第二種低層住居専用地域", short: "二低専" },
  { value: "第一種中高層住居専用地域", short: "一中高専" },
  { value: "第二種中高層住居専用地域", short: "二中高専" },
  { value: "第一種住居地域", short: "一住" },
  { value: "第二種住居地域", short: "二住" },
  { value: "準住居地域", short: "準住" },
  { value: "近隣商業地域", short: "近商" },
  { value: "商業地域", short: "商" },
  { value: "準工業地域", short: "準工" },
  { value: "工業地域", short: "工" },
  { value: "工業専用地域", short: "工専" },
  { value: "用途地域無指定", short: "無指定" },
] as const;

// ── 防火地域 ──
export const FIRE_DISTRICT_OPTIONS = [
  { value: "", label: "未選択" },
  { value: "防火地域", label: "防火地域" },
  { value: "準防火地域", label: "準防火地域" },
  { value: "非指定", label: "非指定（防火・準防火以外）" },
] as const;

// ── 建築物用途 ──
export const BUILDING_USE_OPTIONS = [
  "共同住宅",
  "長屋",
  "一戸建住宅",
  "事務所",
  "店舗・飲食店",
  "百貨店・マーケット",
  "病院",
  "診療所",
  "学校",
  "劇場・映画館",
  "ホテル・旅館",
  "工場",
  "倉庫",
  "自動車車庫",
  "寄宿舎",
  "博物館・展示場",
] as const;

// ── 構造種別 ──
export const STRUCTURE_TYPE_OPTIONS = [
  { value: "", label: "未選択" },
  { value: "RC", label: "RC（鉄筋コンクリート造）" },
  { value: "SRC", label: "SRC（鉄骨鉄筋コンクリート造）" },
  { value: "S", label: "S（鉄骨造）" },
  { value: "W", label: "W（木造）" },
  { value: "CBR", label: "CBR（コンクリートブロック造）" },
  { value: "CFT", label: "CFT（コンクリート充填鋼管造）" },
  { value: "その他", label: "その他" },
] as const;

// ── 条件オブジェクト型 ──
export interface ConditionValues {
  useDistrict?: string;
  fireDistrict?: string;
  buildingUse?: string;
  structureType?: string;
  floors?: number;
  height?: number;
  totalFloorArea?: number;
  buildingCoverageRatio?: number;
  floorAreaRatio?: number;
  specialUses?: string[];
}
