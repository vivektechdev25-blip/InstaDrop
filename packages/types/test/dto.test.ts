import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  ApiResponse,
  InstagramPost,
  MediaItem,
  ReelSaveNowErrorCode,
} from "../src";

// These are compile-time assertions: `pnpm typecheck` (tsconfig.typecheck.json
// covers test/) is what fails if the contract drifts. Both apps branch on
// exactly these shapes - the frontend switches on `success` and `code`.
describe("shared DTO contract", () => {
  it("narrows ApiResponse on `success`", () => {
    function inspect(response: ApiResponse<InstagramPost>): void {
      if (response.success) {
        expectTypeOf(response.data).toEqualTypeOf<InstagramPost>();
        expectTypeOf(response.errors).toEqualTypeOf<null>();
      } else {
        expectTypeOf(response.data).toEqualTypeOf<null>();
        expectTypeOf(response.code).toEqualTypeOf<ReelSaveNowErrorCode | undefined>();
      }
    }
    expect(inspect).toBeTypeOf("function");
  });

  it("exposes exactly the error codes the frontend handles", () => {
    expectTypeOf<ReelSaveNowErrorCode>().toEqualTypeOf<
      | "INVALID_URL"
      | "PRIVATE_ACCOUNT"
      | "RATE_LIMITED"
      | "SERVER_ERROR"
      | "NO_AUDIO"
      | "SESSION_EXPIRED"
      | "ACCESS_DENIED"
    >();
  });

  it("limits media to images and videos", () => {
    expectTypeOf<MediaItem["type"]>().toEqualTypeOf<"image" | "video">();
  });
});
