import {
  getPasswordValidationErrors,
  passwordSchema,
} from "./passwordSchema";

describe("passwordSchema", () => {
  it("accepts a matching password with every requirement", () => {
    expect(
      passwordSchema.safeParse({
        confirmPassword: "SecurePassword1",
        currentPassword: "CurrentPassword1",
        newPassword: "SecurePassword1",
      }).success,
    ).toBe(true);
  });

  it("returns every unmet new password requirement", () => {
    expect(
      getPasswordValidationErrors({
        confirmPassword: "A",
        currentPassword: "CurrentPassword1",
        newPassword: "A",
      }).newPassword,
    ).toEqual([
      "New password must be at least 8 characters.",
      "Include at least one lowercase letter.",
      "Include at least one number.",
    ]);
  });

  it("assigns a mismatch error to the confirmation field", () => {
    expect(
      getPasswordValidationErrors({
        confirmPassword: "DifferentPassword1",
        currentPassword: "CurrentPassword1",
        newPassword: "SecurePassword1",
      }).confirmPassword,
    ).toEqual(["New passwords do not match."]);
  });
});
