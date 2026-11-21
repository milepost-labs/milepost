import { useEffect, useSyncExternalStore } from 'react';
import { Modal } from '../ui';
import {
  currentRestoreRequest,
  registerRestoreHost,
  subscribeRestoreRequests,
} from '../../lib/restoreConsent';
import { TxRestore } from './TxStatus';

/**
 * Shows the restore question for any write, wherever it was started. Mounted
 * once, in the layout, so a screen does not need its own copy.
 */
export function RestoreConsentHost() {
  const request = useSyncExternalStore(subscribeRestoreRequests, currentRestoreRequest, currentRestoreRequest);
  useEffect(() => registerRestoreHost(), []);

  return (
    <Modal
      open={request !== null}
      onClose={() => request?.answer(false)}
      eyebrow="Before sending"
      title="Restore archived data"
    >
      {request && (
        <TxRestore
          feeStroops={request.feeStroops}
          onRestore={() => request.answer(true)}
          onDecline={() => request.answer(false)}
        />
      )}
    </Modal>
  );
}
