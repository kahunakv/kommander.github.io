# Security And Authentication

Kommander supports transport-level security settings for node-to-node REST and gRPC traffic through `RaftConfiguration.TransportSecurity`.

This page explains what each option does, how requests are authenticated today, and which parts of the API surface are not fully implemented yet.

## The Main Configuration Object

Network transport security is configured through `RaftTransportSecurityOptions`:

```csharp
RaftConfiguration configuration = new()
{
    Host = "node-a",
    Port = 2070,
    TransportSecurity = new()
    {
        NodeAuthenticationMode = RaftNodeAuthenticationMode.SharedSecret,
        SharedSecret = "replace-with-a-real-cluster-secret",
        RequireTls = true
    }
};
```

The key fields are:

- `NodeAuthenticationMode`
- `SharedSecret`
- `HeaderName`
- `RequireTls`
- `AllowInsecureCertificateValidation`
- `AllowedClockSkew`
- `TrustedServerCertificateThumbprints`
- `TrustedClientCertificateThumbprints`

## Authentication Modes

Kommander currently exposes three authentication modes in the API:

- `Disabled`
- `SharedSecret`
- `MutualTls`

### Disabled

`Disabled` means transport authentication is not enforced.

That is convenient for local development and in-memory testing, but it is not appropriate for production network traffic.

### SharedSecret

`SharedSecret` is the mode that is currently implemented end to end.

In this mode, Kommander signs node-to-node requests using a cluster secret and validates:

- the signature
- the sender node id
- the timestamp
- the nonce
- the allowed clock skew
- replay protection
- and, when configured, the presence of TLS.

This is the practical production-ready authentication mode in the current codebase.

### MutualTls

`MutualTls` exists in the public enum, but it is not implemented yet in `RaftTransportAuthenticator`.

If you configure `NodeAuthenticationMode = MutualTls`, the authenticator currently throws `NotSupportedException`.

That means the docs should treat `MutualTls` as declared API surface, not as a working production feature yet.

## Legacy Bearer Token Compatibility

`HttpAuthBearerToken` still exists on `RaftConfiguration`, but it is a legacy compatibility setting.

Internally, `GetEffectiveTransportSecurity()` falls back to `HttpAuthBearerToken` when:

- `TransportSecurity.SharedSecret` is empty
- and `HttpAuthBearerToken` is set.

That fallback is there to preserve older REST-based configurations. New configurations should prefer `TransportSecurity.SharedSecret`.

## What Shared-Secret Authentication Actually Checks

For authenticated network requests, Kommander signs and validates fields that include:

- HTTP method or gRPC method
- request path or RPC name
- sender node
- timestamp
- nonce
- request body bytes for REST.

Validation can fail with statuses such as:

- `TlsRequired`
- `MissingFields`
- `MalformedFields`
- `InvalidSignature`
- `TimestampSkewExceeded`
- `ReplayDetected`

This gives the runtime basic protection against:

- unsigned requests
- forged signatures
- badly formed authentication data
- clock-skewed requests
- and replayed requests.

## TLS Requirements

`RequireTls` controls whether authenticated traffic must arrive over TLS.

When `RequireTls = true`, Kommander rejects authenticated requests that are not on a secure transport.

For production clusters, this should stay enabled.

## Development-Only Certificate Relaxation

`AllowInsecureCertificateValidation` exists to make local development and some lab environments easier.

When enabled on the client side, gRPC channel creation can bypass normal certificate validation.

That is useful for self-signed development certificates, but it should not be enabled in production.

## Certificate Thumbprint Pinning

`TrustedServerCertificateThumbprints` lets the gRPC client trust only a specific allow-list of server certificate thumbprints.

This is applied when shared gRPC channels are created.

`TrustedClientCertificateThumbprints` exists in the configuration object as an allow-list for trusted client certificates, but the implementation does not provide complete mutual-TLS support around it. Treat it as reserved configuration surface.

## REST Authentication Flow

For REST, `MapRestRaftRoutes()` installs middleware that authenticates `/v1/raft/*` requests before they reach the Raft handlers.

When authentication is enabled:

- the request body is buffered
- the configured signature header is read
- sender node, timestamp, and nonce headers are read
- the request is validated by `RaftTransportAuthenticator`
- unauthenticated requests return `401 Unauthorized`.

This means REST authentication is enforced at the hosting layer, not manually inside each endpoint handler.

## gRPC Authentication Flow

For gRPC, `RaftService` calls `ValidateAuth()` at the beginning of each RPC handler.

When authentication is enabled:

- metadata is read from the request
- the current transport security settings are resolved
- the request is validated by `RaftTransportAuthenticator`
- failed authentication raises `RpcException` with `StatusCode.Unauthenticated`.

On the client side, gRPC request metadata is also signed when the mode is `SharedSecret`.

## Recommended Setups

### Local Development

Use:

- `NodeAuthenticationMode = Disabled`

or, if you want to test the auth path:

- `NodeAuthenticationMode = SharedSecret`
- `RequireTls = false`
- `AllowInsecureCertificateValidation = true` only if you are working with self-signed certificates

### Production

Use:

- `NodeAuthenticationMode = SharedSecret`
- a strong `SharedSecret`
- `RequireTls = true`
- real certificate validation
- optional `TrustedServerCertificateThumbprints` if you need certificate pinning

Do not rely on `HttpAuthBearerToken` for new production deployments.

## Current Limitations

The most important current limitations are:

- `MutualTls` is not implemented yet in the authenticator.
- `TrustedClientCertificateThumbprints` is not enough by itself to provide mutual TLS today.
- the dedicated modern configuration path is `TransportSecurity`; older bearer-token settings are compatibility behavior.

## Related Pages

- [Configuration](../reference/configuration.md)
- [Hosting Endpoints](hosting-endpoints.md)
