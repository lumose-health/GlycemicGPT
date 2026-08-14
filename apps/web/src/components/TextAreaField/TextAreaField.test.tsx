import { fireEvent, render, screen } from "@testing-library/react";
import { TextAreaField } from "./TextAreaField";

describe("TextAreaField", () => {
  it("associates its label and emits changes", () => {
    const onChange = jest.fn();
    render(
      <TextAreaField
        label="Message"
        onChange={onChange}
        placeholder="Ask a question"
      />,
    );

    const input = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(input, { target: { value: "How am I doing?" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("connects error text to the textarea", () => {
    render(
      <TextAreaField
        errorMessage="Message failed"
        id="message"
        label="Message"
      />,
    );

    expect(screen.getByRole("textbox", { name: "Message" })).toHaveAttribute(
      "aria-describedby",
      "message-error",
    );
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
