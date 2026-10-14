'use client';

import * as React from 'react';
import { DropdownMenu as DM, Tabs as TabsPrimitive, Accordion as AccordionPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;

export function DropdownMenuContent({ className, align = 'end', sideOffset = 6, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={sideOffset}
        className={cn('z-50 min-w-48 rounded-xl border border-line bg-surface p-1.5 text-ink shadow-xl data-[state=open]:animate-fade-in', className)}
        {...props}
      />
    </DM.Portal>
  );
}

export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentProps<typeof DM.Item> & { destructive?: boolean }) {
  return (
    <DM.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted',
        destructive && 'text-danger data-[highlighted]:bg-danger/5 [&_svg]:text-danger',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn('px-2.5 py-1.5 text-xs font-medium text-muted', className)} {...props} />;
}

export function DropdownMenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-line" />;
}

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex items-center gap-1 rounded-full bg-surface-2 p-1', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'rounded-full px-3.5 py-1.5 text-sm font-medium text-muted transition-colors hover:text-ink data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;

export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item className={cn('border-b border-line', className)} {...props} />;
}

export function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn('flex flex-1 items-center justify-between gap-4 py-4 text-left text-sm font-medium transition-colors hover:text-ink-2 [&[data-state=open]>svg]:rotate-180', className)}
        {...props}
      >
        {children}
        <ChevronDown className="size-4 shrink-0 text-muted transition-transform duration-200" aria-hidden />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content className="overflow-hidden text-sm" {...props}>
      <div className={cn('pb-4 text-muted', className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-xs rounded-lg bg-ink px-2.5 py-1.5 text-xs text-paper shadow-lg data-[state=delayed-open]:animate-fade-in">
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
