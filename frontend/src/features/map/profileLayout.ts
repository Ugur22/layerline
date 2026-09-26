// The chart's own layout. Pointing at it is worked out from these, so they must match what the
// chart draws; the tests check the dots against them. No imports on purpose: the end-to-end tests
// read this file too, and they cannot resolve the app's aliases.
export const PROFILE_Y_AXIS_WIDTH = 44
export const PROFILE_MARGIN = { top: 28, right: 16, bottom: 4, left: 0 }
