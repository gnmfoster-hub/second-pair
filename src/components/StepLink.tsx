"use client";

import Link from "next/link";
import { SETUP_FLAG } from "@/components/SetupReturn";

/**
 * A step's button, which also leaves a way back.
 *
 * The steps send somebody off into Settings, where there are eight tabs and
 * nothing saying where they were. Marking the trip here is what lets every
 * page they land on show "Back to set-up" until they come back or close it.
 */
export function StepLink({
  href,
  external,
  className,
  children,
}: {
  href: string;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const mark = () => {
    try {
      window.sessionStorage.setItem(SETUP_FLAG, "1");
    } catch {
      // Private window: the page still works, just without the way back.
    }
  };

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children} ↗
      </a>
    );
  }

  return (
    <Link href={href} onClick={mark} className={className}>
      {children}
    </Link>
  );
}
