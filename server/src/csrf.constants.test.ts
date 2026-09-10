import { describe, expect, it } from "vitest";
import { CSRF_COOKIE, CSRF_HEADER } from "./middleware/csrf.js";

describe("csrf constants", () => {
  it("uses a dedicated cookie and header", () => {
    expect(CSRF_COOKIE).toBe("cyberlab.csrf");
    expect(CSRF_HEADER).toBe("x-csrf-token");
  });
});
