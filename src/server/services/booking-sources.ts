import type { Result } from "@/lib/result";
import { RulesRepository } from "@/server/repositories/rules-repository";
import { RosterRepository } from "@/server/repositories/roster-repository";
import { PricingRepository } from "@/server/repositories/pricing-repository";
import { RentalRepository } from "@/server/repositories/rental-repository";
import { PurposeSettingsRepository } from "@/server/repositories/purpose-settings-repository";
import { rentableRoster } from "@/server/logic/roster";
import { loadSection } from "@/server/services/section";
import type { RentalRule } from "@/server/logic/booking-rules";
import type { PricingPlan, RosterEntry } from "@/server/logic/pricing";
import type { PurposeSetting } from "@/server/logic/purpose-rules";
import type { RentalSummary } from "@/server/types/home";

const rulesRepo = new RulesRepository();
const rosterRepo = new RosterRepository();
const pricingRepo = new PricingRepository();
const rentalRepo = new RentalRepository();
const purposeSettingsRepo = new PurposeSettingsRepository();

// Everything a booking check reads. Both the form page and the submit
// action load through here, so adding a new source means adding it in this
// one place.
export type BookingSourceData = {
  rules: RentalRule[];
  // Archived people included — the form narrows to active ones, but the
  // server re-check needs them to explain why a stale form fails.
  roster: RosterEntry[];
  plans: PricingPlan[];
  existingRentals: RentalSummary[];
  // Archived purposes included, so a stale form gets told why.
  purposeSettings: PurposeSetting[];
};

type BookingSourceKey = keyof BookingSourceData;

const bookingSources: { [K in BookingSourceKey]: () => Promise<BookingSourceData[K]> } = {
  rules: () => rulesRepo.listAll(),
  roster: async () => rentableRoster(await rosterRepo.listAll()),
  plans: () => pricingRepo.listAll(),
  existingRentals: () => rentalRepo.listAll(),
  purposeSettings: () => purposeSettingsRepo.listAll(),
};

const SOURCE_KEYS = Object.keys(bookingSources) as BookingSourceKey[];

async function loadEach<R>(settle: (load: () => Promise<unknown>) => Promise<R>): Promise<Record<BookingSourceKey, R>> {
  const results = await Promise.all(SOURCE_KEYS.map((key) => settle(bookingSources[key])));
  return Object.fromEntries(SOURCE_KEYS.map((key, i) => [key, results[i]])) as Record<BookingSourceKey, R>;
}

// Submit action: all or nothing — any failing source fails the submit.
export async function loadBookingSources(): Promise<BookingSourceData> {
  return (await loadEach((load) => load())) as BookingSourceData;
}

export type BookingSourceSections = { [K in BookingSourceKey]: Result<BookingSourceData[K]> };

// Form page: each source degrades to its own error state (loadSection).
export async function loadBookingSections(): Promise<BookingSourceSections> {
  return (await loadEach(loadSection)) as BookingSourceSections;
}
