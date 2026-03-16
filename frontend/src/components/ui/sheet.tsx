import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
      <Dialog.Content
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-full max-w-xl border-l border-border bg-card p-6 shadow-soc outline-none",
          className
        )}
      >
        {children}
        <Dialog.Close className="absolute right-4 top-4 rounded-md p-2 text-muted hover:bg-background">
          <X className="h-4 w-4" />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function SheetTitle({ children }: { children: ReactNode }) {
  return <Dialog.Title className="text-lg font-semibold text-foreground">{children}</Dialog.Title>;
}
