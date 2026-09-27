import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import type { PointFeature } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useMapView } from './mapView'
import { buildStory, type StoryCallout } from './story/buildStory'

// Callouts name a point by its index in the chapter's own feature list; resolved to ids up front,
// so the map and chart can find them again in whichever features they show.
function withIds(features: readonly PointFeature[], callouts: readonly StoryCallout[]) {
  return callouts
    .map((callout) => {
      const id = features[callout.index]?.id
      return id ? { id, text: callout.text } : null
    })
    .filter((callout): callout is { id: string; text: string } => callout !== null)
}

interface StoryPanelProps {
  // The whole layer, not a filtered view, so the story does not change while filtering.
  features: readonly PointFeature[]
  propertyKeys: readonly string[]
}

// Walks through what the layer shows, one chapter at a time (ADR 0012). Opening a chapter sets the
// map to show it; the controls over the map still work afterwards.
export function StoryPanel({ features, propertyKeys }: StoryPanelProps) {
  const chapters = useMemo(() => buildStory(features, propertyKeys), [features, propertyKeys])
  const [position, setPosition] = useState(0)
  const titleId = useId()
  const last = chapters.length - 1
  const current = Math.min(position, last)
  const chapter = chapters[current]
  // The chapter the story opens on, and its callouts already resolved. Held apart from `chapters`,
  // which is rebuilt whenever the data arrives again, so that only the reader moving between
  // chapters changes the map — not a fresh-but-equal `features` array turning up.
  const [{ opening, openingCallouts }] = useState(() => {
    const first = chapters[0]
    return { opening: first, openingCallouts: first ? withIds(features, first.callouts) : [] }
  })

  // The panel is remounted for each layer, so this starts that layer from a clean view instead of
  // whatever the previous one left behind, then shows the opening chapter.
  useEffect(() => {
    const view = useMapView.getState()
    view.reset()
    if (opening) view.apply(opening.style, openingCallouts)
  }, [opening, openingCallouts])

  function go(index: number) {
    const target = chapters[index]
    if (!target) return
    setPosition(index)
    useMapView.getState().apply(target.style, withIds(features, target.callouts))
  }

  if (!chapter) return null
  const atStart = current === 0
  const atEnd = current === last
  const single = chapters.length === 1

  return (
    <Card size="sm" role="region" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span id={titleId}>What you are looking at</span>
          <span className="tabular-nums normal-case">
            {current + 1} / {chapters.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!single && (
          <div className="flex gap-1.5">
            {chapters.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Chapter ${String(index + 1)}: ${item.id === 'overview' ? 'Overview' : item.id}`}
                aria-current={index === current ? 'step' : undefined}
                onClick={() => {
                  go(index)
                }}
                className="flex h-5 flex-1 items-center"
              >
                <span
                  className={`h-1 w-full rounded-full transition-colors ${index <= current ? 'bg-foreground' : 'bg-border'}`}
                />
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-1" aria-live="polite">
          <p className="text-xs text-muted-foreground">{chapter.kicker}</p>
          <h2 className="text-lg leading-tight font-semibold text-balance">{chapter.title}</h2>
          <p className="text-sm leading-relaxed text-pretty">{chapter.body}</p>
        </div>
        <div className="flex gap-2">
          {chapter.stats.map((stat) => (
            <div
              key={stat.label}
              title={`${stat.value} ${stat.label}`}
              className="min-w-0 flex-1 rounded-lg bg-muted px-2.5 py-2"
            >
              <div className="truncate text-base font-semibold tabular-nums">{stat.value}</div>
              <div className="text-[11px] leading-tight text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
        {!single && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              aria-disabled={atStart}
              onClick={() => {
                if (!atStart) go(current - 1)
              }}
            >
              <ChevronLeft />
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                go(atEnd ? 0 : current + 1)
              }}
            >
              {atEnd ? 'Start over' : 'Next'}
              <ChevronRight />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
