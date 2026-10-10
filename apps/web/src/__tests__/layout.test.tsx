import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RootLayout from "../../app/layout";

describe("RootLayout", () => {
  it("renders children", () => {
    render(
      <RootLayout>
        <div>Test content</div>
      </RootLayout>,
    );
    expect(screen.getByText("Test content")).toBeDefined();
  });

  it("exports metadata with title and description", async () => {
    const mod = await import("../../app/layout");
    expect(mod.metadata.title).toBe("MeatHouse");
    expect(mod.metadata.description).toBe("MeatHouse application");
  });
});
