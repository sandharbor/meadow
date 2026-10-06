/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { ButtonHTMLAttributes } from 'react';

/** Modal navigation and count badges shared by Preview and identity review. */
export function ModalTab({ selected, count, loading, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected: boolean; count?: number; loading?: boolean;
}) {
  return <button type="button" {...props} className={`pb-2 px-1 border-b-2 font-medium text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-main-500 ${
    selected ? 'border-main-500 text-main-600' : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
  } ${className}`}>
    {children}
    {loading ? <span className="ml-1.5 animate-spin h-3.5 w-3.5 border-2 border-neutral-300 border-t-main-500 rounded-full inline-block relative top-[3px]" />
      : count !== undefined && <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-neutral-200 text-neutral-700 rounded-full">{count}</span>}
  </button>;
}
