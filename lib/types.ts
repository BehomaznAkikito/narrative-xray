export type EntityGroup = "in" | "out" | "neutral";

export interface Entity {
  id: string;
  label: string;
  /** 例: "in-group / above" — スペック互換の説明的ラベル */
  role: string;
  /** 0-100。100に近いほど上位/優位に描かれている(高度計と同じ数値ロジック) */
  altitude: number;
  group: EntityGroup;
}

export interface Relationship {
  from: string;
  to: string;
  type: "hierarchy" | "in-out-group";
  /** hierarchy のとき。splitFrom + splitTo = 100 */
  splitFrom?: number;
  splitTo?: number;
  /** in-out-group のとき */
  inGroup?: string;
  outGroup?: string;
}

export interface Annotation {
  start: number;
  end: number;
  /** 元テキストからの逐語的な引用。インデックス補正に使用する */
  quote: string;
  entityId: string;
  /** 例: "otherizing", "elevating", "diminishing" */
  function: string;
  note: string;
}

/** 2段階目(claude-sonnet-5)で判定するナラティブの正当化パターン */
export interface NarrativePattern {
  narrativeFramePattern: string;
  patternDescription: string;
}

export interface Analysis {
  entities: Entity[];
  relationships: Relationship[];
  annotations: Annotation[];
  /** 2段階目の分類結果。失敗時・注釈ゼロ時は null */
  pattern?: NarrativePattern | null;
}
