# Support Types

Kommander exposes a few utility types used internally and available to callers.

## Parallelization Extensions

`Kommander.Support.Parallelization` contains `ForEachAsync` extensions for `IEnumerable<T>`, `IAsyncEnumerable<T>`, `List<T>`, arrays, and `HashSet<T>`.

```csharp
using Kommander.Support.Parallelization;

await items.ForEachAsync(maxDegreeOfParallelism: 8, async item =>
{
    await Process(item);
});
```

## SmallDictionary

`SmallDictionary<TKey, TValue>` is a fixed-capacity, non-thread-safe dictionary optimized for very small maps.

Use it where the expected key count is small and predictable.
