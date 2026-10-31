import { defaultFilter } from "cmdk";

// Rows are keyed by roster id so namesakes stay separate items; search
// scores only the name passed as a keyword, with cmdk's own fuzzy ranking,
// so the id never causes a match.
export function scoreRosterKeywords(_value: string, search: string, keywords: string[] = []): number {
  return defaultFilter(keywords.join(" "), search);
}
