import { defaultFilter } from "cmdk";

// Keyed by roster id so namesakes stay separate items; only the name is
// passed as a keyword, so cmdk's fuzzy ranking never matches on id.
export function scoreRosterKeywords(_value: string, search: string, keywords: string[] = []): number {
  return defaultFilter(keywords.join(" "), search);
}
