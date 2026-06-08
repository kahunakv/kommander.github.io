# ASP.NET Core Sample Server

`Kommander.Server` is a runnable ASP.NET Core host in the Kommander repository. It creates a `RaftManager`, uses static discovery, uses `RocksDbWAL`, uses `GrpcCommunication`, maps REST and gRPC Raft routes, and starts a background replication service.

Important command-line options:

| Option | Description |
| --- | --- |
| `--host`, `-h` | Host to bind incoming ASP.NET Core connections to. Default: `*`. |
| `--initial-cluster` | Other node endpoints for static discovery. |
| `--initial-cluster-partitions` | Initial user partition count. Default: `16`. |
| `--raft-nodename` | Stable node name. |
| `--raft-nodeid` | Integer node id. |
| `--raft-host` | Host advertised for Raft traffic. Default: `localhost`. |
| `--raft-port` | Port advertised for Raft traffic. Default: `2070`. |
| `--http-ports`, `-p` | HTTP ports to bind. If omitted, Kestrel listens on `8004`. |
| `--https-ports` | HTTPS ports to bind. If omitted, Kestrel listens on `8005`. |
| `--https-certificate` | HTTPS certificate path. |
| `--https-certificate-password` | HTTPS certificate password. Default: empty. |
| `--wal-adapter` | Parsed option with default `rocksdb`; the current server construction path always creates `RocksDbWAL`. |
| `--rocksdb-wal-path` | Parsed RocksDB WAL path option. Not used by the current server construction path. |
| `--rocksdb-wal-revision` | Parsed RocksDB WAL revision option. Not used by the current server construction path. |
| `--sqlite-wal-path` | WAL path currently passed to `RocksDbWAL`. |
| `--sqlite-wal-revision` | WAL revision currently passed to `RocksDbWAL`. |

The current server construction path uses `RocksDbWAL` with the configured SQLite path and revision option names. Prefer constructing your own host if you need exact storage-option naming.
