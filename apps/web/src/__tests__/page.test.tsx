import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Page from "../../app/page";

describe("Home Page", () => {
  it("renders the CodeBeast heading", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: /codebeast/i })).toBeDefined();
  });

  it("renders the product tagline", () => {
    render(<Page />);
    expect(
      screen.getByText(
        /turns customer support tickets and sentry errors into validated pull requests/i,
      ),
    ).toBeDefined();
  });
});
