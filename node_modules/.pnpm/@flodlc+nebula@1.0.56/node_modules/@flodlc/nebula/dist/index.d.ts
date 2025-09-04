import { SystemConfig } from "./types";
import { Nebula } from "./View/Nebula";
export { Nebula } from "./View/Nebula";
export { ReactNebula } from "./View/ReactNebula";
export declare const createNebula: (element: HTMLElement, config: Omit<SystemConfig, "bgColor">) => Nebula;
