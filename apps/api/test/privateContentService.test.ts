// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/errors/AppError";
import { withBrowserContext } from "../src/services/scrapers/browserManager";
import { privateContentService } from "../src/services/privateContentService";

vi.mock("../src/services/scrapers/browserManager", () => ({ withBrowserContext: vi.fn() }));

const COOKIE = "4815162342%3AsEcReTtOkEn%3A27%3Azz";
const DECODED_COOKIE = decodeURIComponent(COOKIE);
const POST_URL = "https://www.instagram.com/reel/C123abc/";

interface Identity {
  id: string;
  username: string;
}

interface FixtureOptions {
  viewer?: Identity;
  owner?: Identity;
  bodyText?: string;
}

// Instagram embeds identity in data-sjs relay JSON. These fixtures put
// each piece in its own script tag, nested the way real relay data nests
// it, so the service's deep search is exercised for real.
function renderFixture({ viewer, owner, bodyText = "" }: FixtureOptions): void {
  const scripts = [
    viewer && { require: [["Relay", { viewer }]] },
    owner && { data: { xdt_shortcode_media: { shortcode: "C123abc", owner } } },
  ]
    .filter(Boolean)
    .map((payload) => `<script type="application/json" data-sjs>${JSON.stringify(payload)}</script>`)
    .join("");

  document.documentElement.innerHTML = `
    <head>
      <meta property="og:image" content="https://scontent.cdninstagram.com/v/t51/111_222_333_n.jpg">
      <meta property="og:description" content="3 likes, 1 comments - parsed_name on January 5, 2026: &quot;mine&quot;">
    </head>
    <body><main>${bodyText}</main>${scripts}</body>`;
}

interface FakeSession {
  addCookies: ReturnType<typeof vi.fn>;
  newPage: ReturnType<typeof vi.fn>;
}

// A Playwright stand-in whose evaluate() runs the service's real in-page
// scripts against the jsdom document above.
function useFakeBrowser({ landedOn = POST_URL, gotoError }: { landedOn?: string; gotoError?: Error } = {}) {
  const page = {
    on: vi.fn(),
    goto: vi.fn(async () => {
      if (gotoError) throw gotoError;
      return null;
    }),
    waitForTimeout: vi.fn(async () => {}),
    url: () => landedOn,
    evaluate: async (script: string) => (0, eval)(script),
    locator: () => ({ first: () => ({ isVisible: async () => false, click: async () => {} }) }),
  };
  const session: FakeSession = {
    addCookies: vi.fn(async () => {}),
    newPage: vi.fn(async () => page),
  };
  vi.mocked(withBrowserContext).mockImplementation(async (run) => run(session as never));
  return session;
}

const me: Identity = { id: "1001", username: "me" };
const someoneElse: Identity = { id: "2002", username: "someone_else" };

beforeAll(() => {
  // jsdom doesn't implement innerText; the service reads it for markers.
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent ?? "";
    },
  });
});

beforeEach(() => {
  vi.mocked(withBrowserContext).mockReset();
});

describe("own-private-content ownership gate", () => {
  it("returns the post when the owner is the logged-in viewer", async () => {
    renderFixture({ viewer: me, owner: me });
    useFakeBrowser();

    const post = await privateContentService.fetchOwnPrivateContent(COOKIE, POST_URL);
    expect(post.author.username).toBe("me");
    expect(post.shortcode).toBe("C123abc");
    expect(post.media[0]).toMatchObject({ type: "image" });
  });

  it("refuses someone else's content with 403 ACCESS_DENIED", async () => {
    renderFixture({ viewer: me, owner: someoneElse });
    useFakeBrowser();

    await expect(privateContentService.fetchOwnPrivateContent(COOKIE, POST_URL)).rejects.toMatchObject({
      statusCode: 403,
      code: "ACCESS_DENIED",
    });
  });

  it("fails closed when the owner can't be determined", async () => {
    renderFixture({ viewer: me });
    useFakeBrowser();

    await expect(privateContentService.fetchOwnPrivateContent(COOKIE, POST_URL)).rejects.toMatchObject({
      statusCode: 403,
      code: "ACCESS_DENIED",
    });
  });

  it("treats an unidentifiable viewer as an expired session", async () => {
    renderFixture({ owner: me });
    useFakeBrowser();

    await expect(privateContentService.fetchOwnPrivateContent(COOKIE, POST_URL)).rejects.toMatchObject({
      statusCode: 401,
      code: "SESSION_EXPIRED",
    });
  });

  it("treats a login redirect as an expired session", async () => {
    renderFixture({ viewer: me, owner: me });
    useFakeBrowser({ landedOn: "https://www.instagram.com/accounts/login/?next=%2Freel%2FC123abc%2F" });

    await expect(privateContentService.fetchOwnPrivateContent(COOKIE, POST_URL)).rejects.toMatchObject({
      statusCode: 401,
      code: "SESSION_EXPIRED",
    });
  });

  it("reports a deleted post as not found", async () => {
    renderFixture({ viewer: me, owner: me, bodyText: "Post isn't available" });
    useFakeBrowser();

    await expect(privateContentService.fetchOwnPrivateContent(COOKIE, POST_URL)).rejects.toMatchObject({
      statusCode: 404,
      code: "INVALID_URL",
    });
  });
});

describe("session cookie isolation", () => {
  it("sets the cookie only on the request's own context, scoped to Instagram", async () => {
    renderFixture({ viewer: me, owner: me });
    const session = useFakeBrowser();

    await privateContentService.fetchOwnPrivateContent(COOKIE, POST_URL);
    expect(session.addCookies).toHaveBeenCalledTimes(1);
    expect(session.addCookies).toHaveBeenCalledWith([
      {
        name: "sessionid",
        value: COOKIE,
        domain: ".instagram.com",
        path: "/",
        httpOnly: true,
        secure: true,
      },
    ]);
  });

  it("never logs or returns the cookie, even if a library error contains it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    renderFixture({ viewer: me, owner: me });
    useFakeBrowser({
      gotoError: new Error(`net::ERR_FAILED cookie=${COOKIE} decoded=${DECODED_COOKIE}`),
    });

    const failure = await privateContentService
      .fetchOwnPrivateContent(COOKIE, POST_URL)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ statusCode: 502, code: "SERVER_ERROR" });
    expect((failure as AppError).message).not.toContain("sEcReTtOkEn");

    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).toContain("[redacted]");
    expect(logged).not.toContain("sEcReTtOkEn");
  });
});
