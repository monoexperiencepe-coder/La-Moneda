import { assertNotProduction } from './helpers/qa';
import { resetQaRegistry } from './helpers/qa-registry';

export default async function globalSetup(): Promise<void> {
  assertNotProduction();
  resetQaRegistry();
}
