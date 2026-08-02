import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function getUserId(): Promise<string> {
  let user = await prisma.user.findFirst({ where: { name: "default" } });
  if (!user) {
    user = await prisma.user.create({ data: { name: "default" } });
  }
  return user.id;
}

async function main() {
  const userId = await getUserId();

  // ─── 1. Seed PracticeTopics ───
  console.log("Seeding PracticeTopics...");
  const topicDefs = [
    { name: "排煙", description: "排煙設備の設置基準・有効開口・機械排煙" },
    { name: "採光", description: "居室の採光面積・有効採光面積の算定" },
    { name: "換気", description: "居室の換気設備・火使用室の換気" },
    { name: "防火区画", description: "面積区画・堅穴区画・異種用途区画・竪穴区画" },
    { name: "避難", description: "避難階段・避難経路・避難安全検証" },
    { name: "内装制限", description: "特殊建築物等の内装・難燃材料" },
    { name: "耐火構造", description: "耐火性能・準耐火性能の技術的基準" },
    { name: "用途地域", description: "用途地域ごとの建築制限" },
    { name: "容積率・建ぺい率", description: "容積率・建ぺい率の算定と制限" },
    { name: "斜線制限", description: "道路斜線・隣地斜線・北側斜線" },
    { name: "接道義務", description: "建築物の敷地と道路の関係" },
    { name: "防火設備", description: "防火戸・防火シャッター・防火ダンパー" },
    { name: "構造計算", description: "構造計算適合性判定・構造方法の技術的基準" },
    { name: "天井高さ", description: "居室の天井高さ・床高さ" },
    { name: "便所", description: "便所の設置基準・構造" },
  ];

  const topicIds: Record<string, string> = {};
  for (const t of topicDefs) {
    const topic = await prisma.practiceTopic.upsert({
      where: { name: t.name },
      update: { description: t.description },
      create: { name: t.name, description: t.description, source: "manual" },
    });
    topicIds[t.name] = topic.id;
  }

  // ─── 2. Seed DrawingNoteTemplates ───
  console.log("Seeding DrawingNoteTemplates...");
  const templateDefs = [
    {
      articleId: "art_005041", // 防火区画
      title: "防火区画 根拠条文",
      templateText:
        "建築基準法施行令第112条に基づき、面積区画・竪穴区画を適切に設定している。",
      tags: ["防火区画", "確認申請"],
    },
    {
      articleId: "art_005041",
      title: "面積区画の注記",
      templateText:
        "令第112条第1項により、主要構造部を耐火構造とした床面積の合計により区画を検討した。",
      tags: ["防火区画", "面積区画"],
    },
    {
      articleId: "art_005360", // 避難階段
      title: "避難階段 根拠条文",
      templateText:
        "建築基準法施行令第122条に基づき、避難階段の設置基準を満たしている。",
      tags: ["避難", "確認申請"],
    },
    {
      articleId: "art_003132", // 居室の採光
      title: "採光計算 根拠条文",
      templateText:
        "建築基準法施行令第19条に基づき、有効採光面積 = 窓面積 × 採光補正係数を算定した。",
      tags: ["採光", "確認申請"],
    },
    {
      articleId: "art_000864", // 防火地域内の建築物
      title: "防火地域 根拠条文",
      templateText:
        "建築基準法第61条に基づき、防火地域内の建築制限に適合している。",
      tags: ["防火地域", "確認申請"],
    },
  ];

  for (const tpl of templateDefs) {
    const exists = await prisma.drawingNoteTemplate.findFirst({
      where: { articleId: tpl.articleId, title: tpl.title },
    });
    if (!exists) {
      await prisma.drawingNoteTemplate.create({ data: tpl });
    }
  }

  // ─── 3. Seed system packs ───
  console.log("Seeding system packs...");

  // --- Pack A: 小規模住宅の確認項目 ---
  const packAArticles = [
    "art_002930", // 令第2条（面積、高さ等の算定方法）
    "art_003132", // 令第19条（居室の採光）
    "art_003348", // 令第21条（居室の天井の高さ）
    "art_003442", // 令第28条（便所の採光及び換気）
    "art_003351", // 令第22条（居室の床の高さ及び防湿方法）
    "art_003313", // 令第20条の8（ホルムアルデヒド対策）
    "art_007246", // 令第145条（道路内建築制限）
    "art_006216", // 令第132条（二以上の前面道路がある場合）
    "art_005472", // 令第128条（敷地内の通路）
  ];

  // --- Pack B: 非住宅・特殊建築物の確認項目 ---
  const packBArticles = [
    "art_005500", // 令第128条の4（制限を受けない特殊建築物等）
    "art_005539", // 令第128条の5（特殊建築物等の内装）
    "art_004786", // 令第107条（耐火性能に関する技術的基準）
    "art_004846", // 令第107条の2（準耐火性能に関する技術的基準）
    "art_003538", // 令第36条（構造方法に関する技術的基準）
    "art_003560", // 令第36条の3（構造設計の原則）
    "art_006770", // 令第136条の9（簡易な構造の建築物の指定）
    "art_006823", // 令第137条の2の2（大規模建築物の主要構造部等）
    "art_000864", // 法第61条（防火地域及び準防火地域内の建築物）
    "art_006464", // 令第136条の2（防火地域又は準防火地域内の建築物の壁、柱等）
  ];

  // --- Pack C: 防火・避難・排煙 ---
  const packCArticles = [
    "art_005041", // 令第112条（防火区画）
    "art_000476", // 法第26条（防火壁等）
    "art_004918", // 令第109条（防火戸その他の防火設備）
    "art_005360", // 令第122条（避難階段の設置）
    "art_005364", // 令第123条（避難階段及び特別避難階段の構造）
    "art_005392", // 令第124条（物品販売業を営む店舗における避難階段等の幅）
    "art_006877", // 令第137条の6の4（防火壁及び防火区画関係）
    "art_006964", // 令第137条の13（技術的基準から除かれる防火区画）
    "art_000526", // 法第35条（特殊建築物等の避難及び消火に関する技術的基準）
    "art_000528", // 法第35条の2（特殊建築物等の内装）
    "art_003087", // 令第13条の2（避難施設等に関する工事に含まれない軽易な工事）
    "art_005143", // 令第115条の2（防火壁又は防火床の設置を要しない建築物）
    "art_007058", // 令第139条（煙突及び煙突の支線）
  ];

  const packDefs = [
    { name: "小規模住宅の確認項目", type: "system" as const, articles: packAArticles },
    {
      name: "非住宅・特殊建築物の確認項目",
      type: "system" as const,
      articles: packBArticles,
    },
    {
      name: "防火・避難・排煙の確認項目",
      type: "system" as const,
      articles: packCArticles,
    },
  ];

  for (const packDef of packDefs) {
    let pack = await prisma.pack.findFirst({
      where: { name: packDef.name, type: "system" },
    });
    if (!pack) {
      pack = await prisma.pack.create({
        data: { name: packDef.name, type: packDef.type, ownerId: userId },
      });
    }

    // Add articles to pack
    for (let i = 0; i < packDef.articles.length; i++) {
      const articleId = packDef.articles[i];
      await prisma.packItem.upsert({
        where: { packId_articleId: { packId: pack.id, articleId } },
        update: { sortOrder: i },
        create: { packId: pack.id, articleId, sortOrder: i },
      });
    }
    console.log(`  Pack "${packDef.name}": ${packDef.articles.length} articles`);
  }

  // ─── 4. Link PracticeTopics to articles ───
  console.log("Linking PracticeTopics to articles...");

  const topicArticleLinks: [string, string][] = [
    // 排煙
    ["排煙", "art_005041"],
    ["排煙", "art_007058"],
    ["排煙", "art_006964"],
    // 採光
    ["採光", "art_003132"],
    ["採光", "art_003442"],
    // 換気
    ["換気", "art_003248"],
    ["換気", "art_003218"],
    ["換気", "art_003313"],
    // 防火区画
    ["防火区画", "art_005041"],
    ["防火区画", "art_006877"],
    ["防火区画", "art_006964"],
    ["防火区画", "art_006788"],
    // 避難
    ["避難", "art_003077"],
    ["避難", "art_005360"],
    ["避難", "art_005364"],
    ["避難", "art_005392"],
    ["避難", "art_000526"],
    // 内装制限
    ["内装制限", "art_005539"],
    ["内装制限", "art_000528"],
    // 耐火構造
    ["耐火構造", "art_004786"],
    ["耐火構造", "art_004846"],
    ["耐火構造", "art_003538"],
    // 用途地域
    ["用途地域", "art_005948"],
    // 斜線制限
    ["斜線制限", "art_006210"],
    ["斜線制限", "art_006216"],
    // 接道義務
    ["接道義務", "art_006216"],
    ["接道義務", "art_007246"],
    ["接道義務", "art_005472"],
    // 防火設備
    ["防火設備", "art_004918"],
    ["防火設備", "art_000864"],
    ["防火設備", "art_006464"],
    // 構造計算
    ["構造計算", "art_003538"],
    ["構造計算", "art_003560"],
    // 天井高さ
    ["天井高さ", "art_003348"],
    ["天井高さ", "art_003351"],
    // 便所
    ["便所", "art_003442"],
    ["便所", "art_003449"],
  ];

  for (const [topicName, articleId] of topicArticleLinks) {
    const topicId = topicIds[topicName];
    if (!topicId) continue;
    await prisma.articlePracticeTopic.upsert({
      where: { articleId_topicId: { articleId, topicId } },
      update: {},
      create: { articleId, topicId, source: "manual" },
    });
  }

  console.log("Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
