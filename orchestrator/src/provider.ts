import { env } from "./env.js";
import type { AegisProvider } from "./types.js";
import { MockAegisProvider } from "./adapters/mock.js";
import { T3AegisProvider } from "./adapters/t3.js";

export function createProvider(): AegisProvider {
  return env.provider === "t3" ? new T3AegisProvider() : new MockAegisProvider();
}
