import { describe, expect, it } from "vitest";
import {
  getAvailableQaris,
  resolvePlayableQariId,
} from "./audio";

describe("Islam Sobhi removal", () => {
  it("is not listed in available qaris", () => {
    expect(getAvailableQaris().some((q) => q.id === "islam_sobhi")).toBe(
      false
    );
    expect(getAvailableQaris()).toHaveLength(20);
  });

  it("legacy preference falls back to Alafasy", () => {
    expect(resolvePlayableQariId("islam_sobhi")).toBe("alafasy");
  });

  it("RTL grid order: top 10 + Banna + Ghamadi last", () => {
    const list = getAvailableQaris();
    expect(list[0]?.id).toBe("alafasy");
    expect(list[1]?.id).toBe("minshawi");
    expect(list[2]?.id).toBe("husary");
    expect(list[3]?.id).toBe("dosari");
    expect(list[8]?.id).toBe("banna");
    expect(list[9]?.id).toBe("neana");
    expect(list[list.length - 1]?.id).toBe("ghamadi");
  });
});
