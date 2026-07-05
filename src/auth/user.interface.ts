/**
 * Represents an authenticated user in the system.
 *
 * This interface defines the structure of a user object that is created
 * after successful API key authentication. It contains the validated
 * API key that was used for authentication.
 */
export interface User {
  /** The validated API key that was used to authenticate the user. */
  apiKey: string;
}
