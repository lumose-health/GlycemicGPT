import {
  getLoginValidationErrors,
  getRegisterValidationErrors,
  loginSchema,
  registerSchema,
} from "./authFormSchemas";

describe("auth form schemas", () => {
  it("trims and validates login values", () => {
    expect(
      loginSchema.parse({
        email: "  daniel@example.com  ",
        password: "Password1",
      }),
    ).toEqual({
      email: "daniel@example.com",
      password: "Password1",
    });

    expect(
      getLoginValidationErrors({ email: "not-an-email", password: "" }),
    ).toEqual({
      email: ["Enter a valid email address."],
      password: ["Enter your password."],
    });
  });

  it("returns every unmet registration password requirement", () => {
    expect(
      getRegisterValidationErrors({
        confirmPassword: "weak",
        email: "daniel@example.com",
        password: "weak",
      }),
    ).toEqual({
      confirmPassword: [],
      email: [],
      password: [
        "Password must be at least 8 characters.",
        "Include at least one uppercase letter.",
        "Include at least one number.",
      ],
    });
  });

  it("assigns password mismatch errors to confirmation", () => {
    const result = registerSchema.safeParse({
      confirmPassword: "Different1",
      email: "daniel@example.com",
      password: "Password1",
    });

    expect(result.success).toBe(false);
    expect(
      getRegisterValidationErrors({
        confirmPassword: "Different1",
        email: "daniel@example.com",
        password: "Password1",
      }).confirmPassword,
    ).toEqual(["Passwords do not match."]);
  });
});
