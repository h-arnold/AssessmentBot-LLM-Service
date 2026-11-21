# API Key Management

## API Key Generation Best Practices

API keys should be treated as sensitive credentials. Follow these guidelines for generation:

- **Randomness**: Use a cryptographically secure random string generator; avoid predictable patterns or sequential keys.
- **Format and generation**: The required prefix, 32-character base64url body and generator command are defined in [environment configuration](../configuration/environment.md#api-key-format).
- **Uniqueness**: Each API key should be unique.

## Key Rotation Procedures

Regular key rotation is crucial for security. Implement a process to:

- **Schedule Rotation**: Define a regular schedule for key rotation (e.g., every 90 days).
- **Grace Period**: Provide a grace period where both the old and new keys are valid to allow for smooth transitions in client applications.
- **Revocation**: Immediately revoke compromised or unused keys.

## API Key Usage in Requests

API keys are used to authenticate requests to protected endpoints. The key must be included in the `Authorization` header of your HTTP requests.

- **Header Format**: Use the `Bearer` scheme, followed by a space, and then your API key.

**Note:** `Bearer` is case sensitive, so it must be capitalised.

```http
Authorization: Bearer <your_api_key_here>
```

- **Example (cURL)**:

  ```bash
  curl -H 'Authorization: Bearer your_api_key_here' https://your-api-url.com
  ```

## Security Considerations

- **Never Commit to Version Control**: API keys are secrets and must never be committed to public or private source code repositories.
- **Environment Variables**: Store API keys as environment variables on your server or in secure configuration management systems.
- **Access Control**: Limit access to API keys to only those who absolutely need them.
- **Logging**: Be cautious about logging API keys. Ensure they are not exposed in plain text in application logs.
- **HTTPS**: Always use HTTPS to encrypt communication and protect API keys in transit.

## Rate Limiting

The service applies throttling to protect against abuse. See [Rate Limiting](../api/rate-limiting.md) for the enforced limits and response behaviour.
