# API Key Management

This document outlines best practices for managing API keys within the Assessment Bot LLM Service, covering generation, rotation, usage, and security considerations.

## 1. API Key Generation Best Practices

API keys should be treated as sensitive credentials. Follow these guidelines for generation:

- **Randomness**: Always use a cryptographically secure random string generator. Avoid predictable patterns or sequential keys.
  - _Example (OpenSSL)_: `openssl rand -base64 32` (generates a 32-byte base64 encoded key)
- **Length**: Ensure keys are sufficiently long to prevent brute-force attacks. A minimum of 32 characters (256 bits) is recommended.
- **Uniqueness**: Each API key should be unique.

## 2. Key Rotation Procedures

Regular key rotation is crucial for security. Implement a process to:

- **Schedule Rotation**: Define a regular schedule for key rotation (e.g., every 90 days).
- **Grace Period**: Provide a grace period where both the old and new keys are valid to allow for smooth transitions in client applications.
- **Revocation**: Immediately revoke compromised or unused keys.

## 3. API Key Usage in Requests

API keys are used to authenticate requests to protected endpoints. The key must be included in the `Authorization` header of your HTTP requests.

- **Header Format**: Use the `Bearer` scheme, followed by a space, and then your API key.

**Note:** `Bearer` is case sensitive, so it must be capitalized.

```
Authorization: Bearer <your_api_key_here>
```

- **Example (cURL)**:

  ```bash
  curl -X GET \
    https://your-api-url.com/protected-endpoint \
    -H 'Authorization: Bearer your_api_key_here'
  ```

## 4. Security Considerations

- **Never Commit to Version Control**: API keys are secrets and must never be committed to public or private source code repositories.
- **Environment Variables**: Store API keys as environment variables on your server or in secure configuration management systems.
- **Access Control**: Limit access to API keys to only those who absolutely need them.
- **Logging**: Be cautious about logging API keys. Ensure they are not exposed in plain text in application logs.
- **HTTPS**: Always use HTTPS to encrypt communication and protect API keys in transit.

## 5. Rate Limiting Recommendations

Implement rate limiting to protect your API from abuse and denial-of-service attacks. While specific rate limits depend on your application's needs, consider:

- **Per-Key Limits**: Apply rate limits per API key to prevent a single compromised key from overwhelming your service.
- **Burst Limits**: Allow for short bursts of requests, but enforce stricter limits over longer periods.
- **Clear Responses**: Provide clear HTTP status codes (e.g., `429 Too Many Requests`) and `Retry-After` headers when rate limits are exceeded.
