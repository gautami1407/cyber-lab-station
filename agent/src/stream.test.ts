import { describe, expect, it } from "vitest";
import { getStreamFrameMetadata } from "./index.js";

describe("screen stream frame metadata", () => {
  it("uses decoded bytes for frame length and chunking", () => {
    const frameBytes = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const metadata = getStreamFrameMetadata(frameBytes, 8 * 1024);

    expect(metadata.totalBytes).toBe(frameBytes.length);
    expect(metadata.payload.length).not.toBe(frameBytes.length);
    expect(metadata.totalChunks).toBeGreaterThan(0);
  });
});
