import { useEffect, useState } from "react";

export type PageResult<T, M = undefined> = { rows: T[]; total: number; meta?: M };
type Loader<T, M> = (
  offset: number,
  size: number,
  signal: AbortSignal,
) => Promise<PageResult<T, M>>;

/** A filter change starts at page one; canceled requests never replace newer results. */
export function usePaginatedQuery<T, M = undefined>(key: string, load: Loader<T, M>, revision = 0) {
  const [position, setPosition] = useState({ key, page: 1, size: 20 });
  const page = position.key === key ? position.page : 1;
  const size = position.size;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<PageResult<T, M>>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completedKey, setCompletedKey] = useState("");
  const requestKey = JSON.stringify([key, page, size, attempt, revision]);
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setPosition((current) =>
      current.key === key ? current : { key, page: 1, size: current.size },
    );
    setLoading(true);
    setError(null);
    void load((page - 1) * size, size, controller.signal)
      .then((data) => {
        if (!alive) return;
        if (controller.signal.aborted) throw new Error("Tempo de resposta excedido.");
        const lastPage = Math.max(1, Math.ceil(data.total / size));
        if (page > lastPage) {
          setPosition({ key, page: lastPage, size });
          return;
        }
        setResult(data);
        setCompletedKey(requestKey);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError("Não foi possível carregar os registros. Tente novamente.");
        setCompletedKey(requestKey);
        setLoading(false);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [load, key, page, size, attempt, revision, requestKey]);
  return {
    ...result,
    rows: completedKey === requestKey && !error ? result.rows : [],
    loading: loading || completedKey !== requestKey,
    error,
    page,
    size,
    setPage: (value: number) => setPosition({ key, page: Math.max(1, value), size }),
    setSize: (value: number) => setPosition({ key, page: 1, size: value }),
    reload: () => setAttempt((value) => value + 1),
  };
}

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);
  return settled;
}
