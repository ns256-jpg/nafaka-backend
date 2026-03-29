import axios from "axios";

const MPESA_BASE_URL = "https://sandbox.safaricom.co.ke";

// ─── Get OAuth Token ─────────────────────────────────────────
export const getMpesaToken = async (): Promise<string> => {
  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const response = await axios.get(
    `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  return response.data.access_token;
};

// ─── Generate Password ───────────────────────────────────────
const generatePassword = (): { password: string; timestamp: string } => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  const raw = `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`;
  const password = Buffer.from(raw).toString("base64");
  return { password, timestamp };
};

// ─── STK Push (Deposit) ──────────────────────────────────────
export const initiateSTKPush = async (
  phone: string,
  amount: number,
  accountRef: string,
  description: string
): Promise<{ CheckoutRequestID: string; ResponseCode: string; CustomerMessage: string }> => {
  const token = await getMpesaToken();
  const { password, timestamp } = generatePassword();

  // Normalize phone: 07xx -> 2547xx
  const normalizedPhone = phone.startsWith("0")
    ? `254${phone.slice(1)}`
    : phone;

  const response = await axios.post(
    `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: normalizedPhone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: normalizedPhone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: accountRef,
      TransactionDesc: description,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return response.data;
};

// ─── Query STK Push Status ───────────────────────────────────
export const querySTKStatus = async (
  checkoutRequestId: string
): Promise<{ ResultCode: string; ResultDesc: string }> => {
  const token = await getMpesaToken();
  const { password, timestamp } = generatePassword();

  const response = await axios.post(
    `${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return response.data;
};

// ─── B2C (Withdrawal) ────────────────────────────────────────
export const initiateB2C = async (
  phone: string,
  amount: number,
  occasion: string
): Promise<{ ConversationID: string; OriginatorConversationID: string; ResponseDescription: string }> => {
  const token = await getMpesaToken();

  const normalizedPhone = phone.startsWith("0")
    ? `254${phone.slice(1)}`
    : phone;

  const response = await axios.post(
    `${MPESA_BASE_URL}/mpesa/b2c/v1/paymentrequest`,
    {
      InitiatorName: process.env.MPESA_B2C_INITIATOR_NAME,
      SecurityCredential: process.env.MPESA_B2C_SECURITY_CREDENTIAL,
      CommandID: "BusinessPayment",
      Amount: Math.round(amount),
      PartyA: process.env.MPESA_SHORTCODE,
      PartyB: normalizedPhone,
      Remarks: occasion,
      QueueTimeOutURL: process.env.MPESA_B2C_QUEUE_TIMEOUT_URL,
      ResultURL: process.env.MPESA_B2C_RESULT_URL,
      Occasion: occasion,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return response.data;
};
