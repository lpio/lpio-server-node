/**
 * Client should just reconnect.
 */
export const RECONNECT = 0

/**
 * There are messages for the client.
 */
export const NEW_MESSAGES = 1

/**
 * Something went wrong.
 */
export const ERROR = 2

/**
 * Server has been destroyed. For e.g. for a gracefull shutdown.
 */
export const SERVER_DESTROYED = 3

/**
 * Client aborted the request. Client won't see it, but message handler serverside will.
 */
export const CLIENT_ABORT = 4
