# ASP.NET Core Sample Server

`Kommander.Server` is a ready-made ASP.NET Core host in the Kommander repository. Use it to run a Kommander cluster before you write any host code of your own. Start several instances on your machine, and you can watch leader election, replication, and failover.

The server is also a reference. When you build your own host, compare your wiring with `Kommander.Server/Program.cs`. It is a sample, not a product: it has no application API, and it writes only demo entries.

The host does these steps:

1. It creates a `RaftManager`.
2. It uses static discovery.
3. It creates the selected durable WAL (write-ahead log) adapter.
4. It uses `GrpcCommunication`.
5. It maps the REST and gRPC Raft routes.
6. It starts a background replication service. Every 20 seconds, this service writes demo `Greeting` entries to the partitions that the node leads. It then writes a checkpoint.

Important command-line options:

| Option | Description |
| --- | --- |
| `--host`, `-h` | The host for the incoming ASP.NET Core connections. Default: `*`. |
| `--initial-cluster` | The endpoints of the other nodes for static discovery. |
| `--initial-cluster-partitions` | The initial count of user partitions. Default: `16`. |
| `--raft-nodename` | The stable node name. |
| `--raft-nodeid` | The integer node id. |
| `--raft-host` | The host advertised for the Raft traffic. Default: `localhost`. |
| `--raft-port` | The port advertised for the Raft traffic. Default: `2070`. |
| `--http-ports`, `-p` | The HTTP ports to bind. Kestrel listens on `8004` if you omit this option. |
| `--https-ports` | The HTTPS ports to bind. Kestrel listens on `8005` if you omit this option. |
| `--https-certificate` | The path of the HTTPS certificate. |
| `--https-certificate-password` | The password of the HTTPS certificate. Default: empty. |
| `--wal-adapter` | The WAL backend to construct. Supported values: `rocksdb` and `sqlite`. Default: `rocksdb`. |
| `--rocksdb-wal-path` | The RocksDB WAL directory. It applies with `--wal-adapter rocksdb`. |
| `--rocksdb-wal-revision` | The revision component of the RocksDB WAL path. Use it with `--rocksdb-wal-path`. |
| `--sqlite-wal-path` | The SQLite WAL directory. It applies with `--wal-adapter sqlite`. |
| `--sqlite-wal-revision` | The revision component of the SQLite WAL path. Use it with `--sqlite-wal-path`. |

The server keeps compatibility with an older configuration of the sample server. The path options of the selected adapter can be empty while the path options of the other adapter have values. The server then uses the other path and prints a warning. Set the path flag and the revision flag that match `--wal-adapter`. The configuration then says exactly where the server stores the WAL.
