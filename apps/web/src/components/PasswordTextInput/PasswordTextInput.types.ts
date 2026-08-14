import type { TextInputProps } from "@/components/TextInput";

export type PasswordTextInputProps = Omit<
  TextInputProps,
  "trailingAdornment" | "type"
> & {
  hidePasswordLabel?: string;
  showPasswordLabel?: string;
};
