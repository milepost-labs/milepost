import { Account, Keypair, Networks, TransactionBuilder, Operation } from "@stellar/js-sdk";
import { contract } from "@stellar/js-sdk";
import { rpc } from "./rpc";

export async function canHoldAsset(
  accountId: string,
  assetCode: string,
  issuerAccountId: string
): Promise<boolean> {
  // Native XLM (no trustline needed)
  if (assetCode === "XLM") {
    return true;
  }

  // Contract addresses (C...) can hold SAC without trustline
  if (accountId.startsWith("C")) {
    return true;
  }

  // For G... accounts with non-native assets, check trustline
  try {
    const account = await rpc.getAccount(accountId);
    const balances = account.balances || [];

    const hasTrustline = balances.some(
      (balance: any) =>
        balance.asset_code === assetCode && balance.asset_issuer === issuerAccountId
    );

    return hasTrustline;
  } catch (error) {
    // Account not found or error
    return false;
  }
}

export async function checkPayeeCanHold(
  payeeAddress: string,
  assetCode: string,
  assetIssuer: string
): Promise<{ canHold: boolean; reason?: string }> {
  if (!payeeAddress) {
    return { canHold: false, reason: "Payee address is required" };
  }

  // Native XLM always works
  if (assetCode === "XLM") {
    return { canHold: true };
  }

  // Contract addresses always work
  if (payeeAddress.startsWith("C")) {
    return { canHold: true };
  }

  // G... accounts need trustline for non-native assets
  const canHold = await canHoldAsset(payeeAddress, assetCode, assetIssuer);

  if (!canHold) {
    return {
      canHold: false,
      reason: `${payeeAddress.slice(0, 4)}...${payeeAddress.slice(-4)} needs a trustline for ${assetCode} to receive payments`,
    };
  }

  return { canHold: true };
}

export async function recheckPayeeTrustline(
  payeeAddress: string,
  assetCode: string,
  assetIssuer: string
): Promise<{ stillValid: boolean; reason?: string }> {
  return checkPayeeCanHold(payeeAddress, assetCode, assetIssuer);
}
