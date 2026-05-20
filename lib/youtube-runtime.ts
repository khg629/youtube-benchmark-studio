import vm from "node:vm";
import { Platform } from "youtubei.js";

let installed = false;

export function installYtJsEvaluator(): void {
  if (installed) return;
  installed = true;

  const current = Platform.shim;
  const evaluator: typeof current.eval = (data, env) => {
    const exportsObj = data.exported
      .map((n) => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`)
      .join(", ");
    const wrapped = `(function(){ ${data.output}\nreturn { ${exportsObj} }; })()`;
    const context: Record<string, unknown> = { ...env };
    vm.createContext(context);
    const result = new vm.Script(wrapped).runInContext(context, { timeout: 5000 });
    return result as Record<string, unknown>;
  };

  Platform.load({ ...current, eval: evaluator });
}
