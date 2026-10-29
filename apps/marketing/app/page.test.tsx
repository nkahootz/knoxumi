import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  const html = renderToStaticMarkup(<HomePage />);

  it("shows the coming soon message", () => {
    expect(html).toContain("Knoxumi Waiver");
    expect(html).toContain("is coming soon!");
  });

  it("shows the cat logo", () => {
    expect(html).toContain("knoxumi-welcome.png");
    expect(html).toContain('alt="Knoxumi cat mascot waving hello"');
  });
});
