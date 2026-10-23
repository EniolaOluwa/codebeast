import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Page from "../../app/page";

describe("Home Page", () => {
  it("renders the hero", () => {
    render(<Page />);
    expect(
      screen.getByRole("heading", { name: /bugs find you/i }),
    ).toBeDefined();
  });

  it("shows the pipeline with sources and destinations", () => {
    render(<Page />);

    for (const source of ["Sentry", "Slack", "Discord", "Freshdesk"]) {
      expect(screen.getByText(source)).toBeDefined();
    }

    expect(screen.getByText("Jira ticket")).toBeDefined();
    expect(screen.getByText("GitHub PR")).toBeDefined();
  });

  it("links to the console", () => {
    render(<Page />);
    const links = screen.getAllByRole("link", { name: /open the console/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.getAttribute("href")).toBe("/login");
  });

  it("keeps the no-deploy guarantee visible", () => {
    render(<Page />);
    expect(screen.getByText(/never deploys or merges/i)).toBeDefined();
  });
});
