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
      expect(screen.getAllByText(source).length).toBeGreaterThan(0);
    }

    expect(screen.getAllByText("Jira ticket").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GitHub PR").length).toBeGreaterThan(0);
  });

  it("links to the console", () => {
    render(<Page />);
    const links = screen.getAllByRole("link", { name: /open the console/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.getAttribute("href")).toBe("/login");
  });

  it("keeps the no-deploy guarantee visible", () => {
    render(<Page />);
    expect(
      screen.getAllByText(/never deploys or merges/i).length,
    ).toBeGreaterThan(0);
  });
});
