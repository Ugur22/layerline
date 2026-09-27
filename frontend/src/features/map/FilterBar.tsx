import { useState } from 'react'
import type { LayerFilterComparator } from '@/api/types'
import { Button } from '@/components/ui/button'
import { useImportSession } from '@/features/imports/importSession'

// Mirror the API limits (docs/api-contracts.md) so the form cannot build a request it rejects.
const MAX_VALUE_LENGTH = 500

// Same grammar the API requires of `value` for a non-'=' comparator (docs/api-contracts.md §3).
const NUMERIC_VALUE = /^-?\d+(\.\d+)?$/

const COMPARATORS: { value: LayerFilterComparator; label: string }[] = [
  { value: '=', label: 'Equals' },
  { value: '>', label: 'Greater than' },
  { value: '>=', label: 'At least' },
  { value: '<', label: 'Less than' },
  { value: '<=', label: 'At most' },
]

const CONTROL = 'h-8 rounded-md border bg-background px-2 text-sm'

export function FilterBar({ propertyKeys }: { propertyKeys: string[] }) {
  const { filter, setFilter } = useImportSession()
  const [property, setProperty] = useState(filter?.property ?? propertyKeys[0] ?? '')
  const [comparator, setComparator] = useState<LayerFilterComparator>(filter?.comparator ?? '=')
  const [value, setValue] = useState(filter?.value ?? '')

  if (propertyKeys.length === 0) {
    return <p className="text-sm text-muted-foreground">This layer has no properties to filter.</p>
  }

  const numeric = comparator !== '='
  const invalid = numeric && value !== '' && !NUMERIC_VALUE.test(value)

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        // Sent as typed either way (spaces significant for '='); a numeric comparator just refuses
        // to submit non-numeric input up front, via `invalid` below.
        // Comparator omitted for '=' so the stored filter shape is unchanged from before it existed.
        if (value !== '' && !invalid) {
          setFilter({ property, value, ...(comparator !== '=' ? { comparator } : {}) })
        }
      }}
    >
      <label className="flex flex-col gap-1 text-xs">
        Property
        <select
          className={CONTROL}
          value={property}
          onChange={(event) => {
            setProperty(event.target.value)
          }}
        >
          {propertyKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Comparator
        <select
          className={CONTROL}
          value={comparator}
          onChange={(event) => {
            setComparator(event.target.value as LayerFilterComparator)
          }}
        >
          {COMPARATORS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Value
        <input
          className={CONTROL}
          inputMode={numeric ? 'decimal' : 'text'}
          maxLength={MAX_VALUE_LENGTH}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
          }}
        />
        {invalid && <span className="text-xs text-destructive">Must be a number.</span>}
      </label>
      <Button type="submit" size="sm" disabled={value === '' || invalid}>
        Apply filter
      </Button>
      {filter && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setValue('')
            setFilter(null)
          }}
        >
          Clear
        </Button>
      )}
    </form>
  )
}
