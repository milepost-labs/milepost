import { useState, useEffect } from "react";
import { checkPayeeCanHold } from "../lib/trustlineCheck";
import { explain } from "../lib/errors";
import { useTransaction } from "../hooks/useTransaction";

interface ReleaseCheckProps {
  payeeAddress: string;
  assetCode: string;
  assetIssuer: string;
  onRelease: () => Promise<void>;
  disabled?: boolean;
}

export function ReleaseCheck({
  payeeAddress,
  assetCode,
  assetIssuer,
  onRelease,
  disabled = false,
}: ReleaseCheckProps) {
  const [canRelease, setCanRelease] = useState(true);
  const [reason, setReason] = useState<string>();
  const [checking, setChecking] = useState(false);
  const { execute, pending, error } = useTransaction();

  useEffect(() => {
    checkTrustline();
  }, [payeeAddress, assetCode, assetIssuer]);

  async function checkTrustline() {
    if (!payeeAddress) {
      setCanRelease(false);
      setReason("Payee address required");
      return;
    }

    setChecking(true);
    try {
      const result = await checkPayeeCanHold(payeeAddress, assetCode, assetIssuer);
      setCanRelease(result.canHold);
      setReason(result.reason);
    } catch (err) {
      setCanRelease(false);
      setReason("Unable to verify trustline");
    } finally {
      setChecking(false);
    }
  }

  async function handleRelease() {
    // Re-check before signing
    const preSignCheck = await checkPayeeCanHold(payeeAddress, assetCode, assetIssuer);
    if (!preSignCheck.canHold) {
      setReason(preSignCheck.reason);
      return;
    }

    await execute(onRelease);
  }

  if (error) {
    return <div className="error">{explain(error)}</div>;
  }

  return (
    <div>
      <button
        onClick={handleRelease}
        disabled={disabled || !canRelease || checking || pending}
      >
        {pending ? "Releasing..." : "Release"}
      </button>
      {reason && <p className="reason">{reason}</p>}
    </div>
  );
}
