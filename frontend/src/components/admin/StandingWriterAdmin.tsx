import { useState, type FormEvent } from "react";
import { Client, networks } from "@milepost/record";
import { useWallet } from "../../context/useWallet";
import { useContractRead, useContractResult } from "../../hooks/useContractRead";
import { useTransaction } from "../../hooks/useTransaction";
import { looksLikeAddress, truncateAddress } from "../../lib/format";
import { TransactionOutcome } from "../state/AsyncStates";
import { Badge, Button, Card, Field } from "../ui";

const recordClient = new Client({
  ...networks.testnet,
  rpcUrl: "https://soroban-testnet.stellar.org",
});

export function StandingWriterAdmin() {
  const wallet = useWallet();
  const [writerInput, setWriterInput] = useState<string>("");
  const [writerToCheck, setWriterToCheck] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const adminReq = useContractResult(() => recordClient.get_admin(), [], {
    contract: "record",
  });

  const writerStatusReq = useContractRead(
    () => {
      if (!writerToCheck || !looksLikeAddress(writerToCheck)) {
        return Promise.resolve({ result: false });
      }
      return recordClient.is_writer({ addr: writerToCheck });
    },
    [writerToCheck],
    { contract: "record" },
  );

  const admin = adminReq.data;
  const isAdmin = Boolean(
    wallet.address &&
    admin &&
    wallet.address.toLowerCase() === admin.toLowerCase(),
  );

  const addTx = useTransaction({
    contract: "record",
    onSuccess: () => writerStatusReq.refetch(),
  });
  const removeTx = useTransaction({
    contract: "record",
    onSuccess: () => writerStatusReq.refetch(),
  });

  const handleAddWriter = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!looksLikeAddress(writerInput)) {
      setValidationError("Enter a valid writer contract address.");
      return;
    }

    await addTx.send(async () => {
      return recordClient.add_writer({ writer: writerInput });
    });

    if (!addTx.error) {
      setWriterInput("");
      setWriterToCheck(writerInput);
    }
  };

  const handleRemoveWriter = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!looksLikeAddress(writerInput)) {
      setValidationError("Enter a valid writer contract address.");
      return;
    }

    await removeTx.send(async () => {
      return recordClient.remove_writer({ writer: writerInput });
    });

    if (!removeTx.error) {
      setWriterInput("");
      setWriterToCheck(writerInput);
    }
  };

  return (
    <Card>
      <div style={{ padding: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "start",
            marginBottom: "1rem",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                marginBottom: "0.5rem",
              }}
            >
              Standing Writer Administration
            </h2>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--color-muted)",
                margin: 0,
              }}
            >
              Manage which contracts may write recipient standing
            </p>
          </div>
          <Badge tone={isAdmin ? "accent" : "neutral"}>
            {isAdmin ? "Admin" : "Read-Only"}
          </Badge>
        </div>

        <div
          style={{
            padding: "1rem",
            backgroundColor: "var(--color-warning-bg, #fff3cd)",
            border: "1px solid var(--color-warning, #ffc107)",
            borderRadius: "var(--radius-md)",
            marginBottom: "1.5rem",
          }}
        >
          <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 500 }}>
            <strong>Critical Permission:</strong> Writer contracts can credit
            standing for any recipient. Granting write access allows a contract
            to create track records that other funders will trust when
            underwriting future applications. Only authorize contracts you
            control or fully trust.
          </p>
        </div>

        {!isAdmin && wallet.address && (
          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--color-surface)",
              borderRadius: "var(--radius-md)",
              marginBottom: "1.5rem",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.875rem" }}>
              You are viewing in <strong>read-only</strong> mode. Connected
              wallet ({truncateAddress(wallet.address)}) is not the record admin
              ({admin ? truncateAddress(admin) : "loading..."}).
            </p>
          </div>
        )}

        {admin && (
          <div style={{ marginBottom: "1.5rem" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "0.5rem 1rem",
                padding: "1rem",
                backgroundColor: "var(--color-surface)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <span style={{ fontWeight: 500 }}>Record Admin:</span>
              <span className="mono" title={admin}>
                {truncateAddress(admin)}
              </span>
            </div>
          </div>
        )}

        <div style={{ marginBottom: "1.5rem" }}>
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
            }}
          >
            Check Writer Status
          </h3>
          <Field
            label="Contract Address"
            hint="Enter a contract address to check its writer status"
          >
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                className="input-text"
                value={writerToCheck}
                onChange={(e) => setWriterToCheck(e.target.value.trim())}
                placeholder="C..."
                style={{ flex: 1 }}
              />
              {writerToCheck && looksLikeAddress(writerToCheck) && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: "0.5rem",
                  }}
                >
                  {writerStatusReq.loading ? (
                    <Badge tone="neutral">Checking...</Badge>
                  ) : (
                    <Badge tone={writerStatusReq.data ? "success" : "neutral"}>
                      {writerStatusReq.data
                        ? "Authorized Writer"
                        : "Not a Writer"}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </Field>
        </div>

        {validationError && (
          <div
            style={{
              padding: "0.75rem",
              backgroundColor: "var(--color-error-bg, #f8d7da)",
              border: "1px solid var(--color-error, #dc3545)",
              borderRadius: "var(--radius-md)",
              marginBottom: "1rem",
            }}
          >
            {validationError}
          </div>
        )}

        {isAdmin && (
          <div>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 600,
                marginBottom: "0.75rem",
              }}
            >
              Admin Controls
            </h3>

            <form onSubmit={handleAddWriter} style={{ marginBottom: "1rem" }}>
              <Field
                label="Add Writer"
                hint="Grant standing write permission to a contract"
              >
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    className="input-text"
                    value={writerInput}
                    onChange={(e) => setWriterInput(e.target.value.trim())}
                    placeholder="C..."
                    style={{ flex: 1 }}
                  />
                  <Button type="submit" loading={addTx.busy}>
                    Add Writer
                  </Button>
                </div>
              </Field>
              <TransactionOutcome
                phase={addTx.phase}
                error={addTx.error}
                successTitle="Writer added"
              />
            </form>

            <form onSubmit={handleRemoveWriter}>
              <Field
                label="Remove Writer"
                hint="Revoke standing write permission from a contract"
              >
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    className="input-text"
                    value={writerInput}
                    onChange={(e) => setWriterInput(e.target.value.trim())}
                    placeholder="C..."
                    style={{ flex: 1 }}
                  />
                  <Button
                    type="submit"
                    loading={removeTx.busy}
                    variant="danger"
                  >
                    Remove Writer
                  </Button>
                </div>
              </Field>
              <TransactionOutcome
                phase={removeTx.phase}
                error={removeTx.error}
                successTitle="Writer removed"
              />
            </form>
          </div>
        )}
      </div>
    </Card>
  );
}
