// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PersonPicker, type PersonPick } from "@/components/shared/people/person-picker";
import { TEACHER } from "@/server/logic/test-fixtures";

afterEach(cleanup);

// base-ui's Popover positions itself via ResizeObserver, which jsdom doesn't
// implement; cmdk's list also calls scrollIntoView while filtering. Neither
// affects what this test asserts (the picker's options, not its placement).
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", StubResizeObserver);
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

const people = [{ ...TEACHER, id: "t1", name: "uu" }];

function openPicker() {
  fireEvent.click(screen.getByRole("button"));
}

describe("PersonPicker", () => {
  it("closed mode offers no 「新增」 row for a name that isn't listed", async () => {
    const onChange = vi.fn<(pick: PersonPick) => void>();
    render(
      <PersonPicker people={people} selectedLabel="" placeholder="選老師" create={{ kind: "closed" }} onChange={onChange} />,
    );
    openPicker();
    fireEvent.change(screen.getByPlaceholderText("搜尋姓名…"), { target: { value: "小美" } });
    expect(screen.queryByText(/新增/)).not.toBeInTheDocument();
  });

  it("open mode offers a 「新增」 row for a name that isn't listed, and reports it as a new pick", async () => {
    const onChange = vi.fn<(pick: PersonPick) => void>();
    render(
      <PersonPicker people={people} selectedLabel="" placeholder="選擇租借人…" create={{ kind: "open" }} onChange={onChange} />,
    );
    openPicker();
    fireEvent.change(screen.getByPlaceholderText("搜尋姓名…"), { target: { value: "小美" } });
    const offerRow = await screen.findByText("新增「小美」");
    fireEvent.click(offerRow);
    expect(onChange).toHaveBeenCalledWith({ kind: "new", name: "小美" });
  });

  it("picking a listed person reports it as an existing pick", async () => {
    const onChange = vi.fn<(pick: PersonPick) => void>();
    render(
      <PersonPicker people={people} selectedLabel="" placeholder="選老師" create={{ kind: "closed" }} onChange={onChange} />,
    );
    openPicker();
    const row = await screen.findByText("uu");
    fireEvent.click(row);
    expect(onChange).toHaveBeenCalledWith({ kind: "existing", person: people[0] });
  });
});
