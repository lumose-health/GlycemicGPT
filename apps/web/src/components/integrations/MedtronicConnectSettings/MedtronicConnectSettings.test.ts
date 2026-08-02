import { buildHelperCommand } from "./MedtronicConnectSettings";
import {
  medtronicIntervalSchema,
  medtronicPairingSchema,
} from "./medtronicConnectSettings.schema";

describe("Medtronic Connect settings", () => {
  it("validates the pairing fields before installation", () => {
    expect(
      medtronicPairingSchema.safeParse({
        apiUrl: "invalid",
        region: "US",
        username: "",
      }).success,
    ).toBe(false);
    expect(
      medtronicPairingSchema.safeParse({
        apiUrl: "https://lumose.example.com",
        region: "EU",
        username: "carelink-user",
      }).success,
    ).toBe(true);
  });

  it("quotes helper command arguments and validates sync intervals", () => {
    expect(
      buildHelperCommand(
        "https://example.com/install.sh",
        "linux-mac",
        "/Applications/My Browser",
      ),
    ).toContain("'/Applications/My Browser'");
    expect(medtronicIntervalSchema.safeParse(30).success).toBe(true);
    expect(medtronicIntervalSchema.safeParse(30.5).success).toBe(false);
  });
});
