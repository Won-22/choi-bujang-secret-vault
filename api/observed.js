import { observedApi } from '../src/observe.mjs';
import { findRows, recentRows } from '../src/observe-runtime.mjs';

export default observedApi({ find: findRows, recent: recentRows });
