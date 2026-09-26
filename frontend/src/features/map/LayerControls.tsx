import { useId } from 'react'

// Up to this many properties fit as one row of buttons; more would crowd the map, so they get a menu.
export const MAX_SEGMENTED_KEYS = 5

interface ControlProps {
  label: string
  value: string
  keys: string[]
  disabled: boolean
  onChange: (value: string) => void
}

const SELECT_CLASS = 'h-7 rounded-md border bg-background px-1 text-xs'

export function SelectControl({ label, value, keys, disabled, onChange }: ControlProps) {
  return (
    <label className="flex items-center gap-2 text-xs whitespace-nowrap">
      {label}
      <select
        className={SELECT_CLASS}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      >
        <option value="">None</option>
        {keys.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
    </label>
  )
}

// Native radio inputs, hidden behind styled labels, keep the arrow-key and screen-reader behaviour.
export function SegmentedControl({ label, value, keys, disabled, onChange }: ControlProps) {
  const name = useId()
  const labelId = useId()
  return (
    <div className="flex items-center gap-2 text-xs whitespace-nowrap">
      <span id={labelId}>{label}</span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5"
      >
        {/* An empty name would collide with None, which is the empty choice. */}
        {['', ...keys.filter((key) => key !== '')].map((key) => (
          <label
            key={key}
            title={key === '' ? undefined : key}
            className="flex h-6 max-w-32 cursor-pointer items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-50"
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={key}
              checked={value === key}
              disabled={disabled}
              onChange={() => {
                onChange(key)
              }}
            />
            <span className="truncate">{key === '' ? 'None' : key}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
