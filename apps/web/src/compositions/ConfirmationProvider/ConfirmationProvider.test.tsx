import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import { ConfirmationProvider, useConfirmation } from "./ConfirmationProvider";

function ConfirmationHarness() {
  const { confirm } = useConfirmation();
  const [result, setResult] = useState<string>("");

  const requestConfirmation = async () => {
    const confirmed = await confirm({
      confirmLabel: "Delete item",
      description: "This item will be permanently removed.",
      title: "Delete this item?",
      tone: "destructive",
    });
    setResult(String(confirmed));
  };

  return (
    <>
      <button onClick={requestConfirmation} type="button">
        Open confirmation
      </button>
      <output aria-label="Confirmation result">{result}</output>
    </>
  );
}

function renderHarness() {
  return render(
    <ConfirmationProvider>
      <ConfirmationHarness />
    </ConfirmationProvider>,
  );
}

describe("ConfirmationProvider", () => {
  it("renders a darkened, blurred modal and resolves a confirmed request", async () => {
    renderHarness();

    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("alertdialog", {
      name: "Delete this item?",
    });
    const overlay = screen.getByTestId("confirmation-overlay");
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const confirmButton = screen.getByRole("button", { name: "Delete item" });
    const title = screen.getByRole("heading", { name: "Delete this item?" });
    const description = screen.getByText(
      "This item will be permanently removed.",
    );
    const actions = cancelButton.parentElement;
    const cancelIcon = cancelButton.querySelector("use");
    const confirmIcon = confirmButton.querySelector("use");

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(
      "This item will be permanently removed.",
    );
    expect(overlay).toHaveClass("bg-overlay-primary", "backdrop-blur-sm");
    expect(title).toHaveClass("font_poppins", "font_header_3");
    expect(description).toHaveClass("font_poppins", "font_body_2");
    expect(cancelButton).toHaveClass("font_poppins", "font_body_2");
    expect(confirmButton).toHaveClass(
      "font_poppins",
      "font_body_2",
      "bg-accent",
      "text-accent-foreground",
    );
    expect(actions).toHaveClass("flex-wrap", "justify-start");
    expect(cancelIcon).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#x",
    );
    expect(cancelIcon?.closest("svg")).toHaveClass("h-3", "w-3");
    expect(confirmIcon).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#trash",
    );
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    await waitFor(() => expect(cancelButton).toHaveFocus());

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByLabelText("Confirmation result")).toHaveTextContent(
        "true",
      );
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
    expect(trigger).toHaveFocus();
  });

  it("cancels with Escape and restores focus", async () => {
    renderHarness();

    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("alertdialog");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.getByLabelText("Confirmation result")).toHaveTextContent(
        "false",
      );
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("cancels when the backdrop is pressed", async () => {
    renderHarness();

    fireEvent.click(screen.getByRole("button", { name: "Open confirmation" }));
    fireEvent.mouseDown(screen.getByTestId("confirmation-overlay"));

    await waitFor(() => {
      expect(screen.getByLabelText("Confirmation result")).toHaveTextContent(
        "false",
      );
    });
  });
});
