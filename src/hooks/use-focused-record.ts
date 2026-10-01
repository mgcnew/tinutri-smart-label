import { useEffect, useRef } from "react";

/** Abre o cadastro vindo de uma ação sem sobrescrever uma edição em andamento. */
export function useFocusedRecord<T extends { id: string }>(
  id: string | null,
  records: T[],
  onFocus: (record: T) => void,
) {
  const appliedId = useRef<string | null>(null);
  useEffect(() => {
    if (!id || appliedId.current === id) return;
    const record = records.find((item) => item.id === id);
    if (record) {
      appliedId.current = id;
      onFocus(record);
    }
  }, [id, records, onFocus]);
}
