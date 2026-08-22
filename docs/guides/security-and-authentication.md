# Security And Authentication

Kommander supports transport-level security settings for the node-to-node REST traffic and gRPC traffic. You configure them through `RaftConfiguration.TransportSecurity`.

This page tells you three things. It gives the supported authentication modes. It tells you how Kommander enforces TLS. It tells you how to configure mutual TLS when each node needs its own transport identity.

## The Primary Configuration Object

`RaftTransportSecurityOptions` holds the security settings of the network transport:

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

The primary fields are:

- `NodeAuthenticationMode`
- `SharedSecret`
- `HeaderName`
- `RequireTls`
- `AllowInsecureCertificateValidation`
- `AllowedClockSkew`
- `TrustedServerCertificateThumbprints`
- `TrustedClientCertificateThumbprints`
- `ClientCertificatePath`
- `ClientCertificatePassword`
- `ClientCertificate`

## Authentication Modes

Kommander gives three authentication modes:

- `Disabled`
- `SharedSecret`
- `MutualTls`

### Disabled

`Disabled` means that Kommander does not enforce transport authentication.

That mode is convenient for local development and in-memory tests. It is not correct for production network traffic.

### SharedSecret

`SharedSecret` signs the node-to-node requests with a cluster secret. It then validates these items:

- the signature
- the sender node id
- the timestamp
- the nonce
- the permitted clock skew
- the protection against a replay
- the presence of TLS, if you configure that requirement.

This mode authenticates the membership in the cluster. It does not authenticate a specific node identity. Each node with the shared secret can sign as a cluster member. Therefore, rotate the secret as a credential of the full cluster.

### MutualTls

`MutualTls` authenticates the peers during the TLS handshake.

In this mode:

- The client presents a node certificate with a private key.
- The server validates the client certificate.
- The client validates the server certificate.
- No shared-secret signature goes with each request.

Use mutual TLS when you need a credential for each node. Also use it for certificate rotation by node. It gives stronger protection after the compromise of one node credential.

```csharp
RaftConfiguration configuration = new()
{
    Host = "node-a",
    Port = 2070,
    TransportSecurity = new()
    {
        NodeAuthenticationMode = RaftNodeAuthenticationMode.MutualTls,
        ClientCertificatePath = "/etc/kommander/node-a.pfx",
        ClientCertificatePassword = Environment.GetEnvironmentVariable("NODE_CERT_PASSWORD"),
        TrustedClientCertificateThumbprints =
        [
            "5E9B...",
            "A31C...",
            "7F02..."
        ],
        TrustedServerCertificateThumbprints =
        [
            "5E9B...",
            "A31C...",
            "7F02..."
        ]
    }
};
```

An embedded host that already loaded an `X509Certificate2` can set `ClientCertificate` directly. That field has precedence over `ClientCertificatePath`.

With the server executable, `--client-certificate` points to the PKCS#12 certificate for the peers. In `MutualTls` mode, the server presents `--https-certificate` if you omit that flag.

Kommander loads the client certificate one time. It then caches it for the life of the process. To rotate a certificate, add the new thumbprint to the trust list of every node first. Then restart each node with the new certificate.

## Legacy Bearer Token Compatibility

`HttpAuthBearerToken` is still on `RaftConfiguration`. It is a legacy compatibility setting.

Internally, `GetEffectiveTransportSecurity()` uses `HttpAuthBearerToken` in these conditions:

- `TransportSecurity.SharedSecret` is empty.
- `HttpAuthBearerToken` has a value.
- `NodeAuthenticationMode` is not `MutualTls`.

That fallback keeps the older REST-based configurations valid. A new configuration must use `TransportSecurity.SharedSecret`.

## What Shared-Secret Authentication Checks

For an authenticated network request, Kommander signs and validates fields that include:

- the HTTP method or the gRPC method
- the request path or the RPC name
- the sender node
- the timestamp
- the nonce
- the bytes of the request body, for REST.

The validation can fail with a status such as:

- `TlsRequired`
- `MissingFields`
- `MalformedFields`
- `InvalidSignature`
- `TimestampSkewExceeded`
- `ReplayDetected`

This gives the runtime basic protection against:

- an unsigned request
- a forged signature
- authentication data in a bad form
- a request with a clock skew
- a request that an attacker replays.

## TLS Requirements

`RequireTls` controls one rule: authenticated traffic must arrive over TLS.

With `RequireTls = true`, Kommander rejects an authenticated request that does not use a secure transport.

Keep this setting enabled for a production cluster.

## Certificate Relaxation For Development Only

`AllowInsecureCertificateValidation` makes local development and some lab environments easier.

With this setting enabled on the client side, the creation of a gRPC channel can bypass the normal certificate validation.

That behavior is useful for a self-signed development certificate. Do not enable it in production.

## Certificate Thumbprint Pinning

`TrustedServerCertificateThumbprints` lets a network client trust a specific allow-list of server certificate thumbprints only.

Kommander applies that list when it creates a shared gRPC channel. It also applies the list when a REST client builds its peer handlers.

`TrustedClientCertificateThumbprints` is the allow-list for an incoming `MutualTls` request. Use SHA-256 thumbprints in hexadecimal. Do not use `X509Certificate2.Thumbprint` as the source of truth, because .NET gives the SHA-1 thumbprint there.

An empty list of trusted clients is dangerous for node authentication. It accepts each client certificate that completes the TLS handshake. The server executable rejects `MutualTls` without a minimum of one `--trusted-client-cert-thumbprint`. An embedded host must keep the same rule.

## REST Authentication Flow

For REST, `MapRestRaftRoutes()` installs middleware. The middleware authenticates each `/v1/raft/*` request before it reaches the Raft handlers.

With `SharedSecret` authentication enabled:

1. The middleware buffers the request body.
2. It reads the configured signature header.
3. It reads the sender node header, the timestamp header, and the nonce header.
4. `RaftTransportAuthenticator` validates the request.
5. An unauthenticated request receives `401 Unauthorized`.

With `MutualTls` authentication enabled, the REST middleware validates the client certificate from the TLS connection instead. Therefore, the host layer enforces the REST authentication. Each endpoint handler does not enforce it manually.

## gRPC Authentication Flow

For gRPC, `RaftService` calls `ValidateAuth()` at the start of each RPC handler.

With `SharedSecret` authentication enabled:

1. The handler reads the metadata from the request.
2. It resolves the current transport security settings.
3. `RaftTransportAuthenticator` validates the request.
4. A failed authentication raises an `RpcException` with `StatusCode.Unauthenticated`.

On the client side, Kommander also signs the gRPC request metadata in the `SharedSecret` mode.

With `MutualTls` authentication enabled, `RaftService` validates the client certificate from the gRPC `HttpContext`. A gRPC client also presents the configured client certificate when it opens a shared channel.

## Recommended Setups

### Local Development

Use this setting:

- `NodeAuthenticationMode = Disabled`

Use these settings instead to test the authentication path:

- `NodeAuthenticationMode = SharedSecret`
- `RequireTls = false`
- `AllowInsecureCertificateValidation = true`, but only with a self-signed certificate

### Production

Use the shared-secret authentication when one credential for the full cluster is sufficient:

- `NodeAuthenticationMode = SharedSecret`
- a strong `SharedSecret`
- `RequireTls = true`
- real certificate validation
- optional `TrustedServerCertificateThumbprints`, if you need certificate pinning

Use mutual TLS when each node must prove its own identity:

- `NodeAuthenticationMode = MutualTls`
- `RequireTls = true`
- `ClientCertificatePath` or `ClientCertificate`
- `TrustedClientCertificateThumbprints`
- optional `TrustedServerCertificateThumbprints`, for the pinning of an outbound peer.

Do not use `HttpAuthBearerToken` for a new production deployment.

## Fail-Closed Startup Checks

Kommander fails the startup for a dangerous combination:

- the `SharedSecret` mode without a shared secret
- `MutualTls` without a client certificate
- `MutualTls` together with `AllowInsecureCertificateValidation`
- `MutualTls` on a cleartext listener
- mutual TLS in the server executable without a trusted client certificate thumbprint

These checks make a configuration mistake fail at the start of the node. The mistake does not appear later as an unexplained failure of a peer connection.

## Server CLI Flags

| Flag | Description |
| --- | --- |
| `--node-auth-mode` | `Disabled`, `SharedSecret`, or `MutualTls`. |
| `--node-shared-secret` | The shared secret of the `SharedSecret` mode. |
| `--node-auth-header` | The name of the header or the metadata for a shared-secret signature. |
| `--trusted-server-cert-thumbprint` | The SHA-256 thumbprint allow-list for the server certificates of the peers. |
| `--trusted-client-cert-thumbprint` | The SHA-256 thumbprint allow-list for the client certificates of the peers in `MutualTls` mode. |
| `--client-certificate` | The PKCS#12 client certificate for the peers in `MutualTls` mode. It defaults to `--https-certificate`. |
| `--client-certificate-password` | The password of the client certificate archive. |
| `--allow-insecure-certificate-validation` | A bypass of the outbound certificate validation, for development only. Kommander rejects it with `MutualTls`. |

## Related Pages

- [Configuration](../reference/configuration.md)
- [Hosting Endpoints](hosting-endpoints.md)
