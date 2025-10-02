'use strict'

const EXPIRY_MS = 15 * 60 * 1000

const interactions = new Map()

function registerInteraction(token, meta) {
  prune()
  interactions.set(token, {
    ...meta,
    createdAt: Date.now(),
  })
}

function consumeInteraction(token) {
  prune()
  const entry = interactions.get(token)
  if (!entry) {
    return null
  }
  interactions.delete(token)
  return entry
}

function prune() {
  const cutoff = Date.now() - EXPIRY_MS
  for (const [token, meta] of interactions.entries()) {
    if (!meta?.createdAt || meta.createdAt < cutoff) {
      interactions.delete(token)
    }
  }
}

module.exports = {
  registerInteraction,
  consumeInteraction,
}
