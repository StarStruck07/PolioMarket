"use client";

import { useEffect } from "react";

/**
 * Reveals elements with class `.reveal` as they scroll into view (adds `.in`).
 * Robust: watches for dynamically-added nodes and has a safety timeout so
 * content is never left hidden if the observer misses something.
 */
export default function ScrollReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
    const scan = () =>
      document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    const failSafe = window.setTimeout(
      () => document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in")),
      2500,
    );
    return () => {
      io.disconnect();
      mo.disconnect();
      window.clearTimeout(failSafe);
    };
  }, []);
  return null;
}
