import type { ReactNode } from "react";

import type { PrimaryButtonProps } from "@/components/PrimaryButton";

export type SaveButtonState = "idle" | "saving" | "saved";

export type SaveButtonProps = Omit<PrimaryButtonProps, "children"> & {
  label?: ReactNode;
  savedLabel?: ReactNode;
  savingLabel?: ReactNode;
  state: SaveButtonState;
};
