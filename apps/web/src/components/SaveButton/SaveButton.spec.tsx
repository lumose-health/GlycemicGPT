import { STATIC_ASSET_ICON_SPRITE_PATH } from "@/lib/staticAssets";
import { act, render, screen } from "@testing-library/react";

import { SaveButton } from "./SaveButton";

describe("SaveButton", () => {
  it("renders an enabled submit action while idle", () => {
    render(<SaveButton state="idle" />);

    const button = screen.getByRole("button", { name: "Save Changes" });

    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("type", "submit");
    expect(button).not.toHaveAttribute("aria-busy");
  });

  it("disables and announces the saving state", () => {
    render(<SaveButton state="saving" />);

    const button = screen.getByRole("button", { name: "Saving..." });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("displays a confirmed state with a checkmark", () => {
    const { container } = render(<SaveButton disabled state="saved" />);

    const button = screen.getByRole("button", { name: "Saved" });
    const checkmark = container.querySelector(
      `use[href="${STATIC_ASSET_ICON_SPRITE_PATH}#check"]`,
    );

    expect(button).toBeDisabled();
    expect(button).toHaveClass(
      "border-signal-check-text",
      "bg-surface-primary",
      "text-signal-check-text",
      "disabled:opacity-100",
    );
    expect(button.querySelector('[aria-live="polite"]')).toBeInTheDocument();
    expect(checkmark?.closest("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("resizes before fading in the regular disabled label", () => {
    jest.useFakeTimers();
    const getBoundingClientRect = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const width = this.textContent?.includes("Save Changes") ? 96 : 64;

        return {
          bottom: 20,
          height: 20,
          left: 0,
          right: width,
          top: 0,
          width,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      });

    try {
      render(<SaveButton disabled state="saved" />);

      const savedLabel = screen.getByText("Saved");
      const regularLabel = screen.getByText("Save Changes");
      const labelContainer = regularLabel.parentElement;

      expect(savedLabel).toHaveClass("opacity-100", "duration-300");
      expect(savedLabel).toHaveAttribute("aria-hidden", "false");
      expect(regularLabel).toHaveClass("opacity-0", "duration-300");
      expect(regularLabel).toHaveAttribute("aria-hidden", "true");
      expect(labelContainer).toHaveClass(
        "overflow-hidden",
        "transition-[width]",
        "duration-300",
      );
      expect(labelContainer).toHaveStyle({ width: "64px" });

      act(() => {
        jest.advanceTimersByTime(2999);
      });
      expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();

      act(() => {
        jest.advanceTimersByTime(1);
      });

      expect(labelContainer).toHaveStyle({ width: "96px" });
      expect(savedLabel).toHaveClass("opacity-0");
      expect(savedLabel).toHaveAttribute("aria-hidden", "true");
      expect(regularLabel).toHaveClass("opacity-0");
      expect(regularLabel).toHaveAttribute("aria-hidden", "false");
      expect(
        screen.getByRole("button", { name: "Save Changes" }),
      ).toBeDisabled();

      act(() => {
        jest.advanceTimersByTime(299);
      });
      expect(
        screen.getByRole("button", { name: "Save Changes" }),
      ).toBeDisabled();
      expect(regularLabel).toHaveClass("opacity-0");

      act(() => {
        jest.advanceTimersByTime(1);
      });

      const button = screen.getByRole("button", { name: "Save Changes" });
      expect(button).toBeDisabled();
      expect(button).not.toHaveClass("border-signal-check-text");
      expect(savedLabel).toHaveAttribute("aria-hidden", "true");
      expect(regularLabel).toHaveClass("opacity-100");
      expect(regularLabel).toHaveAttribute("aria-hidden", "false");
    } finally {
      getBoundingClientRect.mockRestore();
      jest.useRealTimers();
    }
  });

  it("supports custom labels and caller styling", () => {
    render(
      <SaveButton
        className="w-full"
        label="Save Thresholds"
        savedLabel="Thresholds Saved"
        savingLabel="Saving Thresholds..."
        state="saved"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Thresholds Saved" }),
    ).toHaveClass("w-full");
  });

  it("restores the idle label after a fast failed save", () => {
    jest.useFakeTimers();

    try {
      const { rerender } = render(
        <SaveButton label="Sync now" state="idle" type="button" />,
      );

      rerender(
        <SaveButton label="Sync now" state="saving" type="button" />,
      );
      rerender(
        <SaveButton label="Sync now" state="idle" type="button" />,
      );

      act(() => {
        jest.runOnlyPendingTimers();
      });

      expect(screen.getByText("Sync now")).toHaveClass("opacity-100");
      expect(
        screen.getByRole("button", { name: "Sync now" }),
      ).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
  });
});
