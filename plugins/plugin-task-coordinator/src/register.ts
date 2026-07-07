/**
 * Registration side-effect module — imported for effect, not exports. Activates
 * the slot-registry fills (`register-slots`) that give the `@elizaos/ui`
 * empty-slot defaults their real components, and, when running without a DOM
 * (the Node agent / terminal host), lazily registers the two tri-modal views
 * into the terminal registry so they render inline in the terminal.
 */
import { logger } from "@elizaos/core";
import "./register-slots.js";

