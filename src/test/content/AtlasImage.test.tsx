import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AtlasImage } from "@/atlas/content/AtlasImage";

describe("AtlasImage", () => {
  it("renders the img normally with no fallback", () => {
    render(<AtlasImage src="a.png" alt="A thing" />);
    expect(screen.getByRole("img", { name: "A thing" })).toBeInTheDocument();
    expect(screen.queryByText("Image missing")).not.toBeInTheDocument();
  });

  it("swaps to the 'Image missing' fallback on error, with a title naming the src", () => {
    render(<AtlasImage src="broken.png" alt="A thing" />);
    fireEvent.error(screen.getByRole("img", { name: "A thing" }));
    const fallback = screen.getByText("Image missing");
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveAttribute("title", "Image failed to load: broken.png");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("resets and re-attempts loading when src changes after a failure", () => {
    const { rerender } = render(<AtlasImage src="broken.png" alt="A thing" />);
    fireEvent.error(screen.getByRole("img", { name: "A thing" }));
    expect(screen.getByText("Image missing")).toBeInTheDocument();

    rerender(<AtlasImage src="fresh.png" alt="A thing" />);
    expect(screen.queryByText("Image missing")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "A thing" })).toHaveAttribute("src", "fresh.png");
  });
});
