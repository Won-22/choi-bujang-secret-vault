import { observedApi } from '../src/observe.mjs';
import { findRows } from '../src/observe-runtime.mjs';

export default observedApi({ find: findRows });
