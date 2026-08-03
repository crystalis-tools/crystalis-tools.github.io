import {flagLabel, namedFlagIds} from '../rom/flagnames';

export {flagLabel};

/** Every flag id with a known name, in id order - the only ones worth
 *  showing in a browsable list. */
export function allNamedFlagIds(): number[] {
  return namedFlagIds();
}
