import { useEffect } from "react";

export const APP_TITLE = "Soñar Despierto Veracruz";

/** Título de la pestaña del navegador: "<título> · Soñar Despierto Veracruz". */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · ${APP_TITLE}`;
  }, [title]);
}
