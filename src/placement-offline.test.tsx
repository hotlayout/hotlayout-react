/**
 * A scheduled placement keeps working when the network is lost: the documents of every window are
 * read ahead of time, and the clock alone opens the next window.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CONTRACT_DIR } from "../test-support/paths";

import { HotlayoutPlacement } from "./HotlayoutPlacement";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const MAP_URL = "https://cdn.test/placements/published.json";
const documentUrl = (id: string): string =>
  `https://cdn.test/documents/${id}/published.json`;

const HERO = readFileSync(
  join(CONTRACT_DIR, "fixtures", "hero-screens.json"),
  "utf8",
);
const documentWith = (id: string): unknown =>
  JSON.parse(
    HERO.replace('"documentId": "hero"', `"documentId": "${id}"`).replaceAll(
      '"Offer"',
      `"DOC-${id}"`,
    ),
  );

const map = (from: string, until: string): string =>
  JSON.stringify({
    placementsVersion: "1.1.0",
    placements: {
      "home.banner": {
        documentId: "base",
        schedule: [{ documentId: "promo", from, until }],
      },
    },
  });

describe("a scheduled placement without a network", () => {
  it("opens the window of the next promotion from the documents read ahead of time", async () => {
    let online = true;
    const fakeFetch = ((input: RequestInfo | URL): Promise<Response> => {
      if (!online) return Promise.reject(new TypeError("offline"));
      const url = String(input);
      if (url === MAP_URL)
        return Promise.resolve(
          new Response(map("2026-11-01T10:00:00Z", "2026-11-01T11:00:00Z")),
        );
      const id = /documents\/([^/]+)\//.exec(url)?.[1] ?? "";
      return Promise.resolve(new Response(JSON.stringify(documentWith(id))));
    }) as typeof fetch;
    let remembered: string | undefined;
    const store = {
      read: () => remembered,
      write: (text: string) => {
        remembered = text;
      },
    };
    let offset = 0;
    const start = Date.parse("2026-11-01T09:00:00Z");
    const clock = (): number => start + offset;
    const shown = (): string | undefined =>
      /DOC-(?:base|promo)/.exec(document.body.textContent ?? "")?.[0];

    render(
      <HotlayoutPlacement
        name="home.banner"
        mapUrl={MAP_URL}
        documentUrl={documentUrl}
        fetch={fakeFetch}
        lastKnown={store}
        clock={clock}
      />,
    );
    await waitFor(() => {
      expect(shown()).toBe("DOC-base");
    });
    // Let the background reads finish, then lose the network and come back to the page an hour on.
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50));
    });
    online = false;
    offset = Date.parse("2026-11-01T10:30:00Z") - start;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((done) => setTimeout(done, 50));
    });
    await waitFor(() => {
      expect(shown()).toBe("DOC-promo");
    });
    // The promotion ends: the permanent document stands again, still without the network.
    offset = Date.parse("2026-11-01T11:00:01Z") - start;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((done) => setTimeout(done, 50));
    });
    await waitFor(() => {
      expect(shown()).toBe("DOC-base");
    });
  });
});
