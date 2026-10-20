import { useEffect, useState } from "react";
import { checkPayeeCanHold } from "../lib/trustlineCheck";
import { explain } from "../lib/errors";

interface Payee {
  id: string;
  name: string;
  address: string;
}

interface AllocatedSpendingCheckProps {
  payees: Payee[];
  assetCode: string;
  assetIssuer: string;
  selectedPayeeId: string;
  onPayeeSelect: (id: string) => void;
}

interface PayeeStatus {
  [id: string]: { canHold: boolean; reason?: string };
}

export function AllocatedSpendingCheck({
  payees,
  assetCode,
  assetIssuer,
  selectedPayeeId,
  onPayeeSelect,
}: AllocatedSpendingCheckProps) {
  const [payeeStatus, setPayeeStatus] = useState<PayeeStatus>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAllPayees();
  }, [payees, assetCode, assetIssuer]);

  async function checkAllPayees() {
    setLoading(true);
    const statuses: PayeeStatus = {};

    for (const payee of payees) {
      try {
        const result = await checkPayeeCanHold(payee.address, assetCode, assetIssuer);
        statuses[payee.id] = result;
      } catch (error) {
        statuses[payee.id] = {
          canHold: false,
          reason: "Unable to verify trustline",
        };
      }
    }

    setPayeeStatus(statuses);
    setLoading(false);
  }

  async function handlePayeeSelect(payeeId: string) {
    // Re-check selected payee before allowing selection
    const payee = payees.find((p) => p.id === payeeId);
    if (payee) {
      const result = await checkPayeeCanHold(payee.address, assetCode, assetIssuer);
      if (result.canHold) {
        onPayeeSelect(payeeId);
      }
    }
  }

  if (loading) {
    return <div>Checking payees...</div>;
  }

  return (
    <fieldset>
      <legend>Select Payee</legend>
      {payees.map((payee) => {
        const status = payeeStatus[payee.id] || { canHold: false };
        const isDisabled = !status.canHold;

        return (
          <div key={payee.id} className="payee-option">
            <label>
              <input
                type="radio"
                name="payee"
                value={payee.id}
                checked={selectedPayeeId === payee.id}
                onChange={() => handlePayeeSelect(payee.id)}
                disabled={isDisabled}
              />
              <span>{payee.name}</span>
            </label>
            {isDisabled && status.reason && (
              <p className="warning">{status.reason}</p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
