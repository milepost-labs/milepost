import { useState, useEffect } from "react";
import { checkPayeeCanHold } from "../lib/trustlineCheck";
import { explain } from "../lib/errors";
import { useTransaction } from "../hooks/useTransaction";

interface Award {
  id: string;
  payee: string;
  amount: string;
}

interface FinalizeCheckProps {
  award: Award;
  assetCode: string;
  assetIssuer: string;
  onFinalize: () => Promise<void>;
  disabled?: boolean;
}

export function FinalizeCheck({
  award,
  assetCode,
  assetIssuer,
  onFinalize,
  disabled = false,
}: FinalizeCheckProps) {
  const [canFinalize, setCanFinalize] = useState(true);
  const [reason, setReason] = useState<string>();
  const [checking, setChecking] = useState(false);
  const { execute, pending, error } = useTransaction();

  useEffect(() => {
    checkPayeeTrustline();
  }, [award.payee, assetCode, assetIssuer]);

  async function checkPayeeTrustline() {
    if (!award.payee) {
      setCanFinalize(false);
      setReason("Payee address required");
      return;
    }

    setChecking(true);
    try {
      const result = await checkPayeeCanHold(award.payee, assetCode, assetIssuer);
      setCanFinalize(result.canHold);
      if (!result.canHold) {
        setReason(`Cannot finalize: all releases on this award would fail. ${result.reason}`);
      } else {
        setReason(undefined);
      }
    } catch (err) {
      setCanFinalize(false);
      setReason("Unable to verify payee trustline");
    } finally {
      setChecking(false);
    }
  }

  async function handleFinalize() {
    // Re-check before signing
    const preSignCheck = await checkPayeeCanHold(award.payee, assetCode, assetIssuer);
    if (!preSignCheck.canHold) {
      setReason(`Cannot finalize: ${preSignCheck.reason}`);
      return;
    }

    await execute(onFinalize);
  }

  if (error) {
    return <div className="error">{explain(error)}</div>;
  }

  return (
    <div className="finalize-row">
      <button
        onClick={handleFinalize}
        disabled={disabled || !canFinalize || checking || pending}
        title={reason}
      >
        {pending ? "Finalizing..." : "Finalize"}
      </button>
      {reason && <p className="reason finalize-reason">{reason}</p>}
    </div>
  );
}
