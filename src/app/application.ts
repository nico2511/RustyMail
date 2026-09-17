import "../styles.css";

import { registerAllAppModules } from "./mail/appModuleRegistry";

registerAllAppModules();

export { boot } from "./mail/appBootRun";
