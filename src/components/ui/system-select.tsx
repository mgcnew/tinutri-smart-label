import {
  Children,
  isValidElement,
  useId,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Option = { value: string; label: ReactNode; disabled: boolean };
function collectOptions(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)
    )
      return [];
    if (child.type === "option")
      return [
        {
          value: String(child.props.value ?? ""),
          label: child.props.children,
          disabled: Boolean(child.props.disabled),
        },
      ];
    return collectOptions(child.props.children);
  });
}

/** Themed dropdown with a native form control for validation and change events. */
export function SystemSelect({
  children,
  value,
  defaultValue,
  onChange,
  className,
  id,
  disabled,
  required,
  name,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const errorId = useId();
  const native = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [localValue, setLocalValue] = useState(String(defaultValue ?? ""));
  const [invalid, setInvalid] = useState(false);
  const current = String(value ?? localValue);
  const options = collectOptions(children);
  return (
    <>
      <Select
        value={`option:${current}`}
        disabled={disabled}
        onValueChange={(next) => {
          if (!native.current) return;
          native.current.value = next.slice(7);
          native.current.dispatchEvent(new Event("change", { bubbles: true }));
        }}
      >
        <SelectTrigger
          ref={trigger}
          id={id}
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
          aria-describedby={
            [props["aria-describedby"], invalid ? errorId : undefined].filter(Boolean).join(" ") ||
            undefined
          }
          aria-required={required}
          aria-invalid={invalid || props["aria-invalid"]}
          title={props.title}
          className={cn("system-select-trigger", className)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={5} className="system-select-content">
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={`option:${option.value}`}
              disabled={option.disabled}
              className="system-select-option"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <select
        {...props}
        ref={native}
        value={current}
        name={name}
        disabled={disabled}
        required={required}
        hidden
        tabIndex={-1}
        aria-hidden="true"
        className="system-select-native"
        onChange={(event) => {
          setLocalValue(event.target.value);
          setInvalid(false);
          onChange?.(event);
        }}
        onInvalid={(event) => {
          event.preventDefault();
          setInvalid(true);
          trigger.current?.focus();
        }}
      >
        {children}
      </select>
      {invalid && (
        <span id={errorId} role="alert" className="mt-1 block text-xs text-destructive">
          Selecione uma opção.
        </span>
      )}
    </>
  );
}
