import { fireEvent, render, screen } from "@testing-library/react";
import { SelectField } from "./SelectField";

describe("SelectField", () => {
  it("renders a labelled native select and reports changes", () => {
    const onChange = jest.fn();

    render(
      <SelectField
        label="Glucose display unit"
        onChange={onChange}
        options={[
          { label: "mg/dL", value: "mgdl" },
          { label: "mmol/L", value: "mmol" },
        ]}
        defaultValue="mgdl"
      />,
    );

    const select = screen.getByRole("combobox", {
      name: "Glucose display unit",
    });
    fireEvent.change(select, { target: { value: "mmol" } });

    expect(select).toHaveValue("mmol");
    expect(onChange).toHaveBeenCalled();
  });
});
