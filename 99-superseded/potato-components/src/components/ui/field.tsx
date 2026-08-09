import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Plain-language message. Say what's wrong AND how to fix it. */
  error?: string;
  hint?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, hint, className, id: idProp, ...props }, ref) => {
    const auto = useId();
    const id = idProp ?? auto;
    const msgId = `${id}-msg`;
    const message = error ?? hint;

    return (
      <div className="mb-4">
        <label htmlFor={id} className="block text-sm font-medium text-primary mb-[7px]">
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? msgId : undefined}
          className={cn(
            "w-full bg-surface-high border rounded-sm px-[14px] py-[13px]",
            "text-primary font-body text-[0.9375rem] placeholder:text-tertiary",
            "transition-[border-color,box-shadow] duration-fast ease-out",
            "focus:outline-none focus:border-signal focus:shadow-[0_0_0_3px_rgba(95,212,196,0.14)]",
            error && "border-error",
            !error && "border-border-subtle",
            className
          )}
          {...props}
        />
        {message && (
          <p
            id={msgId}
            className={cn("text-[0.8125rem] mt-1.5", error ? "text-error" : "text-tertiary")}
          >
            {message}
          </p>
        )}
      </div>
    );
  }
);
Field.displayName = "Field";
