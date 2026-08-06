import { fireEvent, render, screen } from "@testing-library/react";
import { ConnectionStatusBanner } from "./ConnectionStatusBanner";

describe("ConnectionStatusBanner", () => {
  it("stays hidden while the connection is healthy", () => {
    const { container } = render(
      <ConnectionStatusBanner isReconnecting={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("announces an error and emits retry", () => {
    const onReconnect = jest.fn();
    render(
      <ConnectionStatusBanner
        errorMessage="Connection failed"
        hasError
        isReconnecting={false}
        onReconnect={onReconnect}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Connection failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("can be dismissed when configured", () => {
    render(
      <ConnectionStatusBanner dismissible hasError isReconnecting={false} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
