import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { DELETE } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    savedCommute: {
      deleteMany: vi.fn(),
    },
  },
}));

describe("DELETE /api/commute", () => {
  beforeEach(() => {
    vi.mocked(prisma.savedCommute.deleteMany).mockReset();
  });

  it("deletes the saved commute and clears the root session cookie", async () => {
    vi.mocked(prisma.savedCommute.deleteMany).mockResolvedValue({ count: 1 });
    const request = new NextRequest("http://localhost/api/commute", {
      method: "DELETE",
      headers: { cookie: "framme_session=session-123" },
    });

    const response = await DELETE(request);

    expect(prisma.savedCommute.deleteMany).toHaveBeenCalledWith({
      where: { anonymousSessionId: "session-123" },
    });
    await expect(response.json()).resolves.toEqual({ data: { deleted: true } });
    expect(response.headers.get("set-cookie")).toContain("framme_session=;");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
  });

  it("still clears a stale cookie when there is no saved commute", async () => {
    const request = new NextRequest("http://localhost/api/commute", { method: "DELETE" });

    const response = await DELETE(request);

    expect(prisma.savedCommute.deleteMany).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ data: { deleted: false } });
    expect(response.headers.get("set-cookie")).toContain("Path=/");
  });
});
