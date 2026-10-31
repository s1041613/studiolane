"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CircleCheckIcon, XIcon } from "lucide-react";
import { addDays, shortDate, shortDateParts } from "@/server/logic/date";
import {
  ruleDayLabel,
  ruleRoomLabel,
  rulesForWeek,
  sortRulesForList,
  visibleInWeek,
  weekStartOf,
} from "@/server/logic/rental-rules";
import type { WeekDay } from "@/server/logic/rental-rules";
import type { RentalRule } from "@/server/logic/booking-rules";
import { Button } from "@/components/ui/button";
import { ruleLine, useRuleToggle, type ToggleFailure } from "@/components/shared/rules/rule-toggle";
import { ActionFailure } from "@/components/shared/failures/action-failure";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ShowArchivedToggle } from "@/components/ui/show-archived-toggle";
import { StatusBadge, archivedRowClass } from "@/components/ui/status-badge";
import { WeekTimeline } from "@/components/shared/schedule/week-timeline";
import type { TimelineDay, TimelineItem } from "@/components/shared/schedule/week-timeline";
import { RentalRuleDialog } from "@/components/shared/rules/rental-rule-dialog";
import type { RuleDialogMode } from "@/components/shared/rules/rental-rule-dialog";
import { Card, CardScroll } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RowAction, RowActions } from "@/components/ui/row-action";
import { Toolbar, ToolbarActions, ToolbarFilters } from "@/components/ui/toolbar";
import { SettingsBoard } from "@/components/ui/settings-board";
import { ReadOnlyNotice } from "@/components/ui/read-only-notice";
import { FailedList } from "@/components/shared/failures/section-failure";
import type { Failure } from "@/lib/result";

type Room = "A" | "B";
type View = "week" | "list";

const ROOM_OPTIONS = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
] as const;
const VIEW_OPTIONS = [
  { value: "week", label: "週視圖" },
  { value: "list", label: "清單" },
] as const;
function weekRangeLabel(weekStart: string): string {
  return `${weekStart.slice(0, 4)}/${shortDateParts(weekStart).monthDay} – ${shortDateParts(addDays(weekStart, 6)).monthDay}`;
}

function toTimelineItem({ rule, start, end, lifted }: WeekDay["entries"][number]): TimelineItem {
  const tone = rule.effect === "open" ? "open" : rule.onDate ? "block" : "muted";
  return { id: `${rule.id}-${start}`, start, end, label: rule.reason, tone, struck: lifted };
}

function toTimelineDays(week: WeekDay[]): TimelineDay[] {
  return week.map((day) => ({ key: day.date, label: shortDate(day.date), items: day.entries.map(toTimelineItem) }));
}

function WeekLegend() {
  const swatch = "inline-block size-3 rounded-sm align-[-1px]";
  return (
    <ul aria-label="圖例" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={`${swatch} bg-(image:--eb-cal-blocked)`} />
        不能租
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={`${swatch} border border-cal-available-border bg-(image:--eb-cal-available)`} />
        可租
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={`${swatch} border border-dashed border-cal-oneday-border`} />
        只有某一天
      </li>
    </ul>
  );
}

// Gone after 4s; hovering pauses it and leaving restarts the 4s. The ref
// keeps a parent re-render from resetting the timer.
function SuccessToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismissRef.current(), 4000);
    return () => clearTimeout(timer);
  }, [paused]);

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-(--eb-shadow-popover)"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <CircleCheckIcon className="mt-0.5 text-success" />
      {message}
    </div>
  );
}

type OpenDialog = { key: number; mode: RuleDialogMode };

// canEdit false hides every edit control; the server refuses writes anyway.
export function RentalRulesBoard({
  rules,
  today,
  readFailure = null,
  canEdit = true,
}: {
  rules: RentalRule[];
  today: string;
  // The read failed: the toolbar stays (filters off), the list says why.
  readFailure?: Failure | null;
  canEdit?: boolean;
}) {
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today));
  const [room, setRoom] = useState<Room>("A");
  // null until chosen: the list on phones, the week view on wider screens.
  const [view, setView] = useState<View | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<ToggleFailure | null>(null);
  const toggle = useRuleToggle(setNotice, setFailure);

  // 租借規則 only; 上課時段 would be managed on its own page, not yet built.
  const forRoom = rules.filter((r) => r.kind === "rental" && (r.room === null || r.room === room));
  const inWeek = forRoom.filter((r) => visibleInWeek(r, weekStart));
  const archivedCount = inWeek.filter((r) => r.archivedAt !== null).length;
  const listed = sortRulesForList(inWeek.filter((r) => showArchived || r.archivedAt === null));
  const week = toTimelineDays(rulesForWeek(rules, weekStart, room));

  function open(mode: RuleDialogMode) {
    setNotice(null);
    setFailure(null);
    setDialog((d) => ({ key: (d?.key ?? 0) + 1, mode }));
  }

  function askToggle(rule: RentalRule) {
    setNotice(null);
    setFailure(null);
    void toggle.ask(rule);
  }

  const viewToggle = (fallback: View, className: string) => (
    <div className={className}>
      <SegmentedControl<View> aria-label="檢視方式" options={VIEW_OPTIONS} value={view ?? fallback} onValueChange={setView} />
    </div>
  );
  const visibility = (which: View) =>
    view === null ? (which === "week" ? "hidden sm:block" : "sm:hidden") : view === which ? "" : "hidden";

  return (
    <SettingsBoard>
      {!canEdit && <ReadOnlyNotice />}

      <Card padding="none" fill className="relative">
        {/* Floats so clearing it can't shift the row under the pointer. */}
        {(notice || failure) && (
          <div className="fixed inset-x-8 bottom-8 z-40 flex flex-col items-stretch gap-2 md:absolute md:inset-x-auto md:right-5 md:bottom-8 md:left-auto md:w-96 md:items-end">
            {notice && <SuccessToast key={notice} message={notice} onDismiss={() => setNotice(null)} />}
            {failure && (
              <div className="relative w-full rounded-md bg-popover shadow-(--eb-shadow-popover)">
                <ActionFailure failure={failure} className="pr-10" />
                <Button
                  variant="row-action"
                  size="icon-xs"
                  aria-label="關閉"
                  className="absolute top-2 right-2"
                  onClick={() => setFailure(null)}
                >
                  <XIcon />
                </Button>
              </div>
            )}
          </div>
        )}

        <Toolbar disabled={readFailure !== null}>
          <ToolbarFilters>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="上一週" onClick={() => setWeekStart((w) => addDays(w, -7))}>
                <ChevronLeftIcon />
              </Button>
              <span className="min-w-36 text-center text-sm font-medium tabular-nums">{weekRangeLabel(weekStart)}</span>
              <Button variant="ghost" size="icon-sm" aria-label="下一週" onClick={() => setWeekStart((w) => addDays(w, 7))}>
                <ChevronRightIcon />
              </Button>
              {weekStart !== weekStartOf(today) && (
                <Button variant="ghost" size="sm" onClick={() => setWeekStart(weekStartOf(today))}>
                  本週
                </Button>
              )}
            </div>
            <SegmentedControl<Room> aria-label="教室" options={ROOM_OPTIONS} value={room} onValueChange={setRoom} />
            {viewToggle("list", "sm:hidden")}
            {viewToggle("week", "hidden sm:block")}
            <div className={visibility("list")}>
              <ShowArchivedToggle archivedCount={archivedCount} checked={showArchived} onCheckedChange={setShowArchived} />
            </div>
          </ToolbarFilters>
          {canEdit && (
            <ToolbarActions>
              <Button size="lg" onClick={() => open("create")}>
                新增
              </Button>
            </ToolbarActions>
          )}
        </Toolbar>

        {readFailure ? (
          <FailedList message="租借時段暫時讀不到" failure={readFailure} />
        ) : (
          <>
            <CardScroll role="region" aria-label="週視圖" className={`px-5 pt-4 pb-5 ${visibility("week")}`}>
              <div className="overflow-x-auto">
                <WeekTimeline days={week} background="available" className="min-w-[40rem]" />
              </div>
              <WeekLegend />
            </CardScroll>

            <CardScroll role="region" aria-label="清單" className={`px-5 pb-5 ${visibility("list")}`}>
              {listed.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">這週沒有租借時段</div>
              ) : (
                <Table>
                  <TableHeader sticky>
                    <tr>
                      <TableHead>星期／日期</TableHead>
                      <TableHead>時段</TableHead>
                      <TableHead>教室</TableHead>
                      <TableHead>原因</TableHead>
                      <TableHead align="actions">
                        <span className="sr-only">操作</span>
                      </TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {listed.map((rule) => (
                      <TableRow key={rule.id} className={archivedRowClass(rule.archivedAt)}>
                        <TableCell className="whitespace-nowrap">{ruleDayLabel(rule)}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {rule.start}–{rule.end}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{ruleRoomLabel(rule.room)}</TableCell>
                        <TableCell>
                          {rule.effect === "open" && <span className="mr-2 text-xs text-muted-foreground">例外開放</span>}
                          {rule.reason}
                          <StatusBadge archivedAt={rule.archivedAt} />
                        </TableCell>
                        <TableCell align="actions">
                          {canEdit && (
                            <RowActions>
                              <RowAction
                                action="edit"
                                target={ruleLine(rule)}
                                disabledReason={rule.archivedAt === null ? undefined : "已停用，啟用後才能編輯"}
                                onClick={() => open({ edit: rule })}
                              />
                              <RowAction
                                action={rule.archivedAt === null ? "archive" : "reactivate"}
                                target={ruleLine(rule)}
                                disabled={toggle.checking}
                                onClick={() => askToggle(rule)}
                              />
                            </RowActions>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardScroll>
          </>
        )}
      </Card>

      {dialog && (
        <RentalRuleDialog
          key={dialog.key}
          mode={dialog.mode}
          today={today}
          onClose={() => setDialog(null)}
          onSaved={(message) => {
            setDialog(null);
            setNotice(message);
          }}
        />
      )}

      {toggle.dialogs}
    </SettingsBoard>
  );
}
