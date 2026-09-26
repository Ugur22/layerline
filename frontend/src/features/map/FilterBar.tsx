import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useImportSession } from '@/features/imports/importSession'

// Mirror the API limits (docs/api-contracts.md) so the form cannot build a request it rejects.
const MAX_VALUE_LENGTH = 500

const CONTROL = 'h-8 rounded-md border bg-background px-2 text-sm'

export function FilterBar({ propertyKeys }: { propertyKeys: string[] }) {
  const { filter, setFilter } = useImportSession()
  const [property, setProperty] = useState(filter?.property ?? propertyKeys[0] ?? '')
  const [value, setValue] = useState(filter?.value ?? '')

  if (propertyKeys.length === 0) {
    return <p className="text-sm text-muted-foreground">This layer has no properties to filter.</p>
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        // Exact match, so the value is sent as typed: spaces are significant.
        if (value !== '') setFilter({ property, value })
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
        Equals
        <input
          className={CONTROL}
          maxLength={MAX_VALUE_LENGTH}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
          }}
        />
      </label>
      <Button type="submit" size="sm" disabled={value === ''}>
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
