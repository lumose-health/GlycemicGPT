export type TimeRangeQuickSelectOption<Value extends string = string> = {
  accessibleLabel: string;
  label: string;
  value: Value;
};

export type TimeRangeQuickSelectProps<Value extends string = string> = {
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  onChange: (value: Value) => void;
  options: readonly TimeRangeQuickSelectOption<Value>[];
  value?: Value | null;
};
