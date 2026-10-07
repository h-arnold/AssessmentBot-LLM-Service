/**
 * Maximum decoded size of one image, in bytes.
 */
export const MAX_IMAGE_SIZE_BYTES = 1024 * 1024;

/**
 * Maximum JSON request size: three base64-encoded images plus 1 MiB for data URI
 * headers, padding, and other JSON overhead, rounded up to whole MiB.
 */
export const MAX_JSON_PAYLOAD_SIZE = `${Math.ceil(
  (MAX_IMAGE_SIZE_BYTES * (4 / 3) * 3 + 1024 * 1024) / (1024 * 1024),
)}mb`;
