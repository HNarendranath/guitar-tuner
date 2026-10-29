interface StepperProps {
  value: number;
  min: number;
  max: number;
  /** Accessible name, e.g. "Capo". */
  label: string;
  onChange(value: number): void;
  format?: (value: number) => string;
  step?: number;
}

export function Stepper({ value, min, max, label, onChange, format = String, step = 1 }: StepperProps) {
  return (
    <div class="stepper" role="group" aria-label={label}>
      <button
        type="button"
        class="stepper-button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        −
      </button>
      <output class="stepper-value" aria-live="polite">
        {format(value)}
      </output>
      <button
        type="button"
        class="stepper-button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        +
      </button>
    </div>
  );
}
