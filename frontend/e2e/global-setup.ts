const API_HEALTH = 'http://127.0.0.1:8000/api/v1/health'

export default async function globalSetup() {
  try {
    const response = await fetch(API_HEALTH)
    if (response.ok) return
  } catch {
    // Fall through to the explanatory error below.
  }
  throw new Error(
    `The API is not reachable at ${API_HEALTH}. End-to-end tests need the stack: run \`make up\` first.`,
  )
}
