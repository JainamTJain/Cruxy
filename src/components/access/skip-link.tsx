"use client";

/** First focusable control: jump past chrome into main content. */
export function SkipLink() {
  return (
    <a href="#main-content" className="sr-only">
      Skip to content
    </a>
  );
}
