import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Page from "../../app/page";

describe("Home Page", () => {
  it("renders the heading", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: /meathouse/i })).toBeDefined();
  });

  it("renders the welcome text", () => {
    render(<Page />);
    expect(
      screen.getByText(/welcome to the meathouse application/i),
    ).toBeDefined();
  });
});
