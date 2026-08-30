"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

/**
 * Theme picker for the user menu.
 *
 * `attribute="class"` in the provider puts `.dark` on <html>, which is exactly
 * what the `@custom-variant dark (&:is(.dark *))` in app/globals.css expects,
 * so the palette that was already defined there needs no CSS change.
 */
export function ThemeMenu() {
  const { theme, setTheme } = useTheme();

  return (
    <>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
        <DropdownMenuRadioItem value="light">
          <SunIcon />
          Light
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">
          <MoonIcon />
          Dark
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system">
          <MonitorIcon />
          System
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );
}
