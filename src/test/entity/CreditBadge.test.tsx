import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CreditBadge } from "@/atlas/entity/CreditBadge";

describe("CreditBadge", () => {
  it("renders the credit string as visible text", () => {
    render(<CreditBadge credit="Art by Jane Doe" />);
    expect(screen.getByText("Art by Jane Doe")).toBeInTheDocument();
  });

  it("applies the atlas-credit-badge CSS class", () => {
    const { container } = render(<CreditBadge credit="Art by Jane Doe" />);
    expect(container.firstChild).toHaveClass("atlas-credit-badge");
  });

  it("sets the title attribute to the full credit string", () => {
    render(<CreditBadge credit="Illustration © Studio XYZ" />);
    expect(screen.getByRole("note")).toHaveAttribute("title", "Illustration © Studio XYZ");
  });

  it("sets aria-label to 'Image credit: <credit>'", () => {
    render(<CreditBadge credit="Photo by J. Smith" />);
    expect(screen.getByRole("note")).toHaveAttribute(
      "aria-label",
      "Image credit: Photo by J. Smith"
    );
  });

  it("exposes role=note so screen readers announce it as a note", () => {
    render(<CreditBadge credit="Art by Jane Doe" />);
    expect(
      screen.getByRole("note", { name: /Image credit: Art by Jane Doe/i })
    ).toBeInTheDocument();
  });
});
