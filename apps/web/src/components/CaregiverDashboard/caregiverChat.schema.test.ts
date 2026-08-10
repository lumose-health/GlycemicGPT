import { caregiverChatSchema } from "./caregiverChat.schema";

describe("caregiverChatSchema", () => {
  it("trims a valid question", () => {
    expect(caregiverChatSchema.parse({ message: "  How are they?  " })).toEqual(
      {
        message: "How are they?",
      },
    );
  });

  it("rejects empty and oversized questions", () => {
    expect(caregiverChatSchema.safeParse({ message: " " }).success).toBe(false);
    expect(
      caregiverChatSchema.safeParse({ message: "x".repeat(2001) }).success,
    ).toBe(false);
  });
});
