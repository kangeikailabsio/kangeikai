/**
 * Application-defined WebSocket close code (4000+ is reserved for apps) the office room uses when
 * the same account joins again from another tab or device: the older connection is closed with it,
 * so the client can say so instead of showing a generic disconnect (issue #232).
 */
export const CLOSE_CODE_SESSION_REPLACED = 4001
