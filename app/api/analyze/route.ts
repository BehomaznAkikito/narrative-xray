import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { Analysis, Annotation, Entity, NarrativePattern, Relationship } from "@/lib/types";
import { buildMockAnalysis } from "@/lib/mock";

export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
// 2段階目(ナラティブパターン分類)は入力が引用群のみで小さいため、精度優先でSonnetを使う
const PATTERN_MODEL = process.env.ANTHROPIC_PATTERN_MODEL || "claude-sonnet-5";
const MAX_CHARS = 6000;

const SYSTEM_PROMPT = `あなたはテキストに埋め込まれた「序列構造」と「内集団/外集団の構図」を分析する批評的読解(critical discourse analysis)の専門家です。ユーザーが貼り付けたテキスト(ニュース記事、企業発表、演説、宗教的テキストなど)を分析し、次を抽出してください。

1. entities: テキストの主題に関わる主要な主体・集団(人物、国、組織、宗教、性別、世代など)を最大8個。
   **網羅性が最優先。主要な主体を漏れなく挙げること。** 次に該当する主体はすべて含める: 行為の主語または対象になっている主体、発言・声明が引用されている主体、比較・対比の対象として言及される主体、影響を受ける集団として言及される主体(「国民」「消費者」のような総称集団も含む)。ニュース記事なら通常4〜8個の主体が登場する。3個以下になるのは、テキストが本当に少数の主体しか含まない場合のみ。両軸の判定が難しいことを理由に主体を省略してはならない(判定に迷う場合はその主体を含めた上で "neutral" や中間的なaltitudeを付ければよい)。除外してよいのは一度だけ付随的に言及される些末な固有名詞のみ。
   - id: "e1"のような短いID
   - label: テキスト中に**実際に登場する固有名詞・呼称**(組織名、国名、人名、製品名など)をそのまま使うこと。テキスト内の表記を優先する(例: 「米商務省」「アンソロピック」)。「主体A」「われわれ」「かれら」「観察者」「第三者」のような抽象的なカテゴリ名・一般化ラベルは禁止。固有名詞がなく総称でしか登場しない集団(例: 「若者」「株主」)の場合のみ、テキスト中のその総称をそのまま使う
   - role: そのテキスト内での位置づけの説明(例: "above / out-group")
   - altitude: 0〜100の整数。**力関係の序列(above/below)の軸**。そのテキストの中で、その主体が実際に権力・主導権を行使している度合いで判定する(規制する側/される側、決定する側/従う側、資源を配分する側/受け取る側など)。100=権力・主導権を行使する側、0=行使される側
   - group: **語り手の視点(in-group/out-group)の軸**。altitudeとは完全に独立して判定すること。判定基準は語り口そのもの: どちらの主張を地の文で「事実」として扱い、どちらの主張に「〜と反発している」「〜と主張している」のような距離を置く表現(hedging)を使っているか。どちらに好意的な形容・正当化の言葉を与え、どちらに否定的・懐疑的な形容を与えているか。"in"=語り手が視点を共有し好意的に描く側、"out"=距離を置き懐疑的に描く側、"neutral"=どちらでもない

**重要: 2つの軸は独立している。**「権力を行使する上位の主体だが、語り手からは批判的に描かれている(above / out-group)」「権力を行使される下位の主体だが、語り手が同情的・共感的に描いている(below / in-group)」という組み合わせも正当な判定結果としてあり得る。above=in-group、below=out-groupと機械的に連動させないこと。テキストごとに両軸を別々の証拠に基づいて判定する。

2. relationships: 主体間の関係。
   - type "hierarchy": 力関係の序列。splitFrom + splitTo = 100 となる整数で配分(例: 72/28)
   - type "in-out-group": 語り手が引く内外集団の境界。inGroup/outGroupに該当エンティティのidを入れる

3. annotations: 上記の判定の根拠となるテキスト箇所を4〜10個。
   - quote: 元テキストからの**一字一句そのままの連続した引用**(15〜60字程度。改変・要約・省略は禁止。この文字列で元テキストを検索して位置を特定するため、正確に写すこと)
   - start / end: 元テキスト内でのおおよその開始・終了文字インデックス
   - entityId: 主に関係するエンティティのid
   - function: その箇所の言説機能を表す短い英語タグ(例: "otherizing", "elevating", "diminishing", "legitimizing", "boundary-drawing")
   - note: なぜその箇所がその序列・内外構造を示すかの解説(日本語で40字程度)

これは事実としての優劣の判定ではなく、テキストの言葉選び・構成が構築するナラティブの分析です。特定の実在の個人の人格や信条を断定的に評価せず、テキストの構造分析に徹してください。`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          role: { type: "string" },
          altitude: { type: "integer" },
          group: { type: "string", enum: ["in", "out", "neutral"] },
        },
        required: ["id", "label", "role", "altitude", "group"],
        additionalProperties: false,
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          type: { type: "string", enum: ["hierarchy", "in-out-group"] },
          splitFrom: { type: "integer" },
          splitTo: { type: "integer" },
          inGroup: { type: "string" },
          outGroup: { type: "string" },
        },
        required: ["from", "to", "type"],
        additionalProperties: false,
      },
    },
    annotations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: { type: "integer" },
          end: { type: "integer" },
          quote: { type: "string" },
          entityId: { type: "string" },
          function: { type: "string" },
          note: { type: "string" },
        },
        required: ["start", "end", "quote", "entityId", "function", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["entities", "relationships", "annotations"],
  additionalProperties: false,
} as const;

const PATTERN_SYSTEM_PROMPT = `あなたはナラティブの正当化構造を分類する専門家です。テキストから抽出された「正当化レトリックの引用群」を受け取り、そのテキストが最も強く依拠している「内集団の正当化パターン」を、道徳基盤理論(Moral Foundations Theory)ベースの以下の分類から1つだけ判定してください。

1. 権威・秩序防衛型(authority/subversion) — 例:「わが国の秩序」「責任ある措置」
2. 被害・加害保護型(care/harm) — 例:「弱者を守るため」「被害を受けている」
3. 純粋性・汚染排除型(purity/degradation) — 例:「伝統を汚す」「不健全な影響」
4. 忠誠・裏切り型(loyalty/betrayal) — 例:「身内を裏切った」「同胞への義務」
5. 公正・不正型(fairness/cheating) — 例:「不公平な優遇」「ズルをしている」
6. 自由・抑圧型(liberty/oppression) — 例:「自己決定権の侵害」「押し付け」
7. その他/新規パターン — 上記のいずれにも当てはまらない場合。そのパターンにあなたが適切な日本語名を付けてよい

出力:
- narrativeFramePattern: パターン名(上記1〜6はその名称をそのまま使う。7の場合は自由に命名)
- patternDescription: なぜこの引用群がこのパターンに該当するかの説明(100字程度の日本語。引用中の具体的な言い回しに言及すること)`;

const PATTERN_SCHEMA = {
  type: "object",
  properties: {
    narrativeFramePattern: { type: "string" },
    patternDescription: { type: "string" },
  },
  required: ["narrativeFramePattern", "patternDescription"],
  additionalProperties: false,
} as const;

/**
 * 2段階目: 抽出済みの引用群のみを入力に、正当化パターンを分類する。
 * 元テキスト全文は渡さない(トークン節約)。失敗しても1段階目の結果は返すため、
 * エラー時は null を返すだけにする。
 */
async function classifyPattern(
  client: Anthropic,
  analysis: Analysis,
): Promise<NarrativePattern | null> {
  if (analysis.annotations.length === 0) return null;
  const entityById = new Map(analysis.entities.map((e) => [e.id, e]));
  const quoteList = analysis.annotations
    .map((a) => {
      const label = entityById.get(a.entityId)?.label ?? "?";
      return `- 「${a.quote}」(対象: ${label} / 機能: ${a.function})`;
    })
    .join("\n");

  try {
    const response = await client.messages.create({
      model: PATTERN_MODEL,
      max_tokens: 1024,
      thinking: { type: "disabled" },
      system: PATTERN_SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: PATTERN_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        {
          role: "user",
          content: `以下は、あるテキストから抽出された正当化レトリックの引用群です。このテキストの正当化パターンを分類してください。\n\n${quoteList}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const parsed = JSON.parse(block.text.replace(/```json|```/g, "").trim());
    if (
      typeof parsed.narrativeFramePattern !== "string" ||
      typeof parsed.patternDescription !== "string"
    ) {
      return null;
    }
    return {
      narrativeFramePattern: parsed.narrativeFramePattern,
      patternDescription: parsed.patternDescription,
    };
  } catch (err) {
    console.error("Pattern classification failed:", err);
    return null;
  }
}

/**
 * モデルが返した文字インデックスは信頼できないため、quote(逐語引用)で
 * 元テキストを検索して位置を確定する。見つからないアノテーションは捨てる。
 */
function resolveAnnotations(text: string, annotations: Annotation[]): Annotation[] {
  const resolved: Annotation[] = [];
  for (const a of annotations) {
    if (typeof a.quote !== "string" || a.quote.length === 0) continue;
    let quote = a.quote;
    let idx =
      text.slice(a.start, a.end) === quote ? a.start : text.indexOf(quote);
    if (idx === -1) {
      quote = quote.trim();
      idx = text.indexOf(quote);
    }
    if (idx === -1 || quote.length === 0) continue;
    resolved.push({ ...a, quote, start: idx, end: idx + quote.length });
  }
  // 開始位置でソートし、重なる箇所は先勝ちで除外(ハイライト描画を単純化するため)
  resolved.sort((x, y) => x.start - y.start);
  const nonOverlapping: Annotation[] = [];
  let lastEnd = -1;
  for (const a of resolved) {
    if (a.start >= lastEnd) {
      nonOverlapping.push(a);
      lastEnd = a.end;
    }
  }
  return nonOverlapping;
}

function sanitize(text: string, raw: Analysis): Analysis {
  const entities: Entity[] = (raw.entities ?? []).slice(0, 8).map((e) => ({
    ...e,
    altitude: Math.max(0, Math.min(100, Math.round(Number(e.altitude) || 50))),
    group: e.group === "in" || e.group === "out" ? e.group : "neutral",
  }));
  const ids = new Set(entities.map((e) => e.id));
  const relationships: Relationship[] = (raw.relationships ?? []).filter(
    (r) => ids.has(r.from) && ids.has(r.to),
  );
  const annotations = resolveAnnotations(text, raw.annotations ?? []).filter((a) =>
    ids.has(a.entityId),
  );
  return { entities, relationships, annotations };
}

export async function POST(req: NextRequest) {
  let text: string;
  let mock: boolean;
  try {
    const body = await req.json();
    text = typeof body.text === "string" ? body.text : "";
    mock = body.mock === true;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  if (text.trim().length < 20) {
    return NextResponse.json(
      { error: "分析するには20文字以上のテキストを貼り付けてください。" },
      { status: 400 },
    );
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `テキストが長すぎます(${MAX_CHARS.toLocaleString()}字まで)。` },
      { status: 400 },
    );
  }

  if (mock) {
    return NextResponse.json({ analysis: buildMockAnalysis(text), mock: true });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "サーバーにANTHROPIC_API_KEYが設定されていません。UIの確認だけなら ?mock=1 を付けてアクセスしてください。",
      },
      { status: 503 },
    );
  }

  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        {
          role: "user",
          content: `次のテキストの序列・内外集団構造を分析してください。\n\n<text>\n${text}\n</text>`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "このテキストの分析は安全上の理由で行えませんでした。別のテキストで試してください。" },
        { status: 422 },
      );
    }
    if (response.stop_reason === "max_tokens") {
      return NextResponse.json(
        { error: "分析結果が長すぎて途中で切れました。テキストを短くして試してください。" },
        { status: 502 },
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "AIから分析結果を取得できませんでした。もう一度試してください。" },
        { status: 502 },
      );
    }

    let parsed: Analysis;
    try {
      parsed = JSON.parse(textBlock.text.replace(/```json|```/g, "").trim());
    } catch {
      return NextResponse.json(
        { error: "分析結果の解析に失敗しました。もう一度試してください。" },
        { status: 502 },
      );
    }

    const analysis = sanitize(text, parsed);
    // 2段階目: 引用群からナラティブパターンを分類(失敗しても1段階目の結果は返す)
    analysis.pattern = await classifyPattern(client, analysis);
    return NextResponse.json({ analysis, mock: false });
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      return NextResponse.json(
        { error: "分析がタイムアウトしました。テキストを短くして試してください。" },
        { status: 504 },
      );
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return NextResponse.json(
        { error: "AIサービスへの接続に失敗しました。しばらくしてから試してください。" },
        { status: 502 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "リクエストが混み合っています。少し待ってから試してください。" },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", err.status, err.message);
      return NextResponse.json(
        { error: "AIサービスでエラーが発生しました。もう一度試してください。" },
        { status: 502 },
      );
    }
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました。" },
      { status: 500 },
    );
  }
}
