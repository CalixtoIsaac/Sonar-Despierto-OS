import { Sparkles } from "lucide-react";
import { PageHeader, Panel, Pill } from "@/components/sd/ui";
import { MODULE_INFO, type ModuleKey } from "@/lib/domain/access";
import { usePageTitle } from "@/lib/page-title";

/** Pantalla provisional de un módulo que llega en una fase posterior. */
export function ModulePlaceholder({
  module,
  title,
  description,
}: {
  module: ModuleKey;
  title?: string;
  description?: string;
}) {
  const info = MODULE_INFO[module];
  const heading = title ?? info.label;
  usePageTitle(heading);

  return (
    <>
      <PageHeader title={heading} />
      <Panel>
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-sun/40">
            <Sparkles className="size-7 text-secondary" aria-hidden />
          </span>
          <p className="max-w-lg text-lg">{description ?? info.description}</p>
          <Pill tone="sun">Próximamente · Fase {info.phase}</Pill>
        </div>
      </Panel>
    </>
  );
}
