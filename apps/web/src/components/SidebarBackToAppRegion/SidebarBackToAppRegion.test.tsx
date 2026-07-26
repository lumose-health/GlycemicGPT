import { fireEvent, render, screen } from "@testing-library/react";

import { SidebarBackToAppRegion } from "./SidebarBackToAppRegion";

jest.mock("next/link", () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

describe("SidebarBackToAppRegion", () => {
  it("preserves the compact spacer when hidden", () => {
    const { container } = render(<SidebarBackToAppRegion isVisible={false} />);

    expect(container.firstChild).toHaveClass("h-3", "border-transparent");
    expect(
      screen.queryByRole("link", { name: "Go back to app" }),
    ).not.toBeInTheDocument();
  });

  it("renders a collapsible dashboard link and emits clicks", () => {
    const handleClick = jest.fn();
    render(
      <SidebarBackToAppRegion collapsed isVisible onClick={handleClick} />,
    );

    const link = screen.getByRole("link", { name: "Go back to app" });

    expect(link).toHaveAttribute("href", "/dashboard");
    expect(link).toHaveClass("gap-0", "pl-[22px]", "pr-0");
    expect(link.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#chevron",
    );

    fireEvent.click(link);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
