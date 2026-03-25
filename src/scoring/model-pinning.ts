/**
 * Heuristics for whether agent config text indicates an explicit model or effort choice.
 * Input must be lowercased. Avoids generic prose ("data model:", "effort: team") and
 * path segments like src/model/.
 */
export function configContentSuggestsPinnedModel(lower: string): boolean {
  if (/\bcaliber_model\b/.test(lower) || /\bcaliber_fast_model\b/.test(lower)) return true;
  if (/(?:^|[\s`'"\n])\/model(?:[\s`'"\n]|$)/.test(lower)) return true;
  if (/claude-(sonnet|opus|haiku)([-.@\d]|\b)/.test(lower)) return true;
  if (/\bgpt-[45]([-._\d]|\b)/.test(lower)) return true;
  if (/\bsonnet-4\.[\d.]+\b/.test(lower)) return true;
  if (/\b(high|medium|low)\s+effort\b/.test(lower)) return true;
  return false;
}
