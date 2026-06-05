import { isAuth } from "./email_pass_store";
import { oauth2Client } from "./email_server";
import { authenticate } from "./email_init";
import { google } from "googleapis";
import chalk from "chalk";
import { generateText } from "ai";
import { getAgentModel } from "../config/ai.config";
import type {
  SendMailInput,
  ReadMailInput,
  SearchMailInput,
  ReplyMailInput,
  DraftMailInput,
  DeleteMailInput,
  ArchiveMailInput,
  LabelMailInput,
  WatchInput,
  ClassifyInput,
  ExtractTasksInput,
  BulkActionInput,
  DigestInput,
  ScheduleSendInput,
  ThreadInput,
  EmailMessage,
} from "./types";

// ─── Gmail client ────────────────────────────────────────────────────────────

const getGmailClient = async () => {
  let ref = isAuth();
  if (ref === null) {
    console.log(chalk.green.bold("Authentication Started"));
    const { tokens } = (await authenticate()) as any;
    ref = tokens.refresh_token;
  }
  oauth2Client.setCredentials({ refresh_token: ref });
  return google.gmail({ version: "v1", auth: oauth2Client });
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Base64url-encode a raw RFC 2822 message string */
function encodeMessage(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Build a raw RFC 2822 message */
function buildRawMessage(
  to: string | string[],
  subject: string,
  body: string,
  extra: { cc?: string[]; bcc?: string[]; replyTo?: string; inReplyTo?: string; references?: string } = {}
): string {
  const lines: string[] = [];
  lines.push(`To: ${Array.isArray(to) ? to.join(", ") : to}`);
  if (extra.cc?.length) lines.push(`Cc: ${extra.cc.join(", ")}`);
  if (extra.bcc?.length) lines.push(`Bcc: ${extra.bcc.join(", ")}`);
  if (extra.inReplyTo) lines.push(`In-Reply-To: ${extra.inReplyTo}`);
  if (extra.references) lines.push(`References: ${extra.references}`);
  lines.push(`Subject: ${subject}`);
  lines.push("Content-Type: text/plain; charset=utf-8");
  lines.push("");
  lines.push(body);
  return lines.join("\n");
}

/** Decode a Gmail message payload into plain text */
function decodeMessageBody(payload: any): string {
  if (!payload) return "";
  const tryDecode = (data: string) =>
    Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return tryDecode(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return tryDecode(part.body.data);
      }
    }
    // fallback: first part with data
    for (const part of payload.parts) {
      if (part.body?.data) return tryDecode(part.body.data);
    }
  }
  return "";
}

/** Extract a header value from a message */
function getHeader(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Map a Gmail message resource to our EmailMessage type */
function mapMessage(msg: any): EmailMessage {
  const headers = msg.payload?.headers ?? [];
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader(headers, "from"),
    to: getHeader(headers, "to"),
    subject: getHeader(headers, "subject"),
    body: decodeMessageBody(msg.payload),
    date: getHeader(headers, "date"),
    labelIds: msg.labelIds ?? [],
  };
}

// ─── Functions ───────────────────────────────────────────────────────────────

/** Send an email */
export async function sendMail(input: SendMailInput) {
  const gmail = await getGmailClient();
  const raw = buildRawMessage(input.to, input.subject, input.body, {
    cc: input.cc,
    bcc: input.bcc,
  });
  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodeMessage(raw) },
    });
    return res.data;
  } catch (e) {
    console.error(chalk.red.bold("sendMail error: " + e));
    throw e;
  }
}

/** Read a single message by ID */
export async function readMail(input: ReadMailInput): Promise<EmailMessage> {
  const gmail = await getGmailClient();
  const res = await gmail.users.messages.get({
    userId: "me",
    id: input.messageId,
    format: "full",
  });
  return mapMessage(res.data);
}

/** Search messages using Gmail query syntax */
export async function searchMail(input: SearchMailInput): Promise<EmailMessage[]> {
  const gmail = await getGmailClient();
  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: input.query,
    maxResults: input.maxResults ?? 10,
  });

  const ids = listRes.data.messages ?? [];
  const messages = await Promise.all(
    ids.map((m) =>
      gmail.users.messages.get({ userId: "me", id: m.id!, format: "full" }).then((r) => mapMessage(r.data))
    )
  );
  return messages;
}

/** Summarize a message using LLM */
export async function summarizeMail(input: ReadMailInput): Promise<string> {
  const msg = await readMail(input);
  const { text } = await generateText({
    model: getAgentModel(),
    prompt: `Summarize this email concisely in 2-3 sentences:\n\nFrom: ${msg.from}\nSubject: ${msg.subject}\n\n${msg.body}`,
  });
  return text;
}

/** Reply to a message */
export async function replyMail(input: ReplyMailInput) {
  const gmail = await getGmailClient();
  const original = await readMail({ messageId: input.messageId });

  // Get the original message resource for Message-ID header
  const msgRes = await gmail.users.messages.get({ userId: "me", id: input.messageId, format: "metadata" });
  const messageIdHeader = getHeader(msgRes.data.payload?.headers ?? [], "message-id");

  const raw = buildRawMessage(
    original.from,
    original.subject.startsWith("Re:") ? original.subject : `Re: ${original.subject}`,
    input.body,
    { inReplyTo: messageIdHeader, references: messageIdHeader }
  );

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeMessage(raw),
      threadId: original.threadId,
    },
  });
  return res.data;
}

/** Save a draft */
export async function draftMail(input: DraftMailInput) {
  const gmail = await getGmailClient();
  const raw = buildRawMessage(input.to, input.subject, input.body, {
    cc: input.cc,
    bcc: input.bcc,
  });
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw: encodeMessage(raw) } },
  });
  return res.data;
}

/** Permanently delete a message */
export async function deleteMail(input: DeleteMailInput) {
  const gmail = await getGmailClient();
  await gmail.users.messages.delete({ userId: "me", id: input.messageId });
  return { deleted: input.messageId };
}

/** Archive a message (remove INBOX label) */
export async function archiveMail(input: ArchiveMailInput) {
  const gmail = await getGmailClient();
  const res = await gmail.users.messages.modify({
    userId: "me",
    id: input.messageId,
    requestBody: { removeLabelIds: ["INBOX"] },
  });
  return res.data;
}

/** Add/remove labels on a message */
export async function labelMail(input: LabelMailInput) {
  const gmail = await getGmailClient();
  const res = await gmail.users.messages.modify({
    userId: "me",
    id: input.messageId,
    requestBody: {
      addLabelIds: input.labelIds,
      removeLabelIds: input.removeLabelIds ?? [],
    },
  });
  return res.data;
}

/** Set up Gmail push notifications via Pub/Sub */
export async function watchMail(input: WatchInput) {
  const gmail = await getGmailClient();
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: input.topicName,
      labelIds: input.labelIds ?? ["INBOX"],
    },
  });
  return res.data;
}

/** Classify a message into a category using LLM */
export async function classifyMail(input: ClassifyInput): Promise<string> {
  const msg = await readMail({ messageId: input.messageId });
  const { text } = await generateText({
    model: getAgentModel(),
    prompt: `Classify this email into exactly one category from: [work, personal, newsletter, spam, finance, travel, support, social, other].
Reply with only the category name.

From: ${msg.from}
Subject: ${msg.subject}
Body: ${msg.body.slice(0, 500)}`,
  });
  return text.trim().toLowerCase();
}

/** Extract action items / tasks from a message using LLM */
export async function extractTasks(input: ExtractTasksInput): Promise<string[]> {
  const msg = await readMail({ messageId: input.messageId });
  const { text } = await generateText({
    model: getAgentModel(),
    prompt: `Extract all action items or tasks from this email. Return one task per line, no numbering or bullets.
If there are no tasks, return "NONE".

From: ${msg.from}
Subject: ${msg.subject}
Body: ${msg.body}`,
  });
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== "NONE");
  return lines;
}

/** Perform an action on multiple messages */
export async function bulkAction(input: BulkActionInput) {
  const results = await Promise.allSettled(
    input.messageIds.map((id) => {
      switch (input.action) {
        case "delete":
          return deleteMail({ messageId: id });
        case "archive":
          return archiveMail({ messageId: id });
        case "markRead":
          return labelMail({ messageId: id, labelIds: [], removeLabelIds: ["UNREAD"] });
        case "markUnread":
          return labelMail({ messageId: id, labelIds: ["UNREAD"] });
        case "label":
          return labelMail({ messageId: id, labelIds: input.labelIds ?? [] });
      }
    })
  );
  return results.map((r, i) => ({
    messageId: input.messageIds[i],
    status: r.status,
    ...(r.status === "rejected" ? { error: String((r as any).reason) } : {}),
  }));
}

/** Generate a digest summary of recent/queried emails using LLM */
export async function digest(input: DigestInput): Promise<string> {
  const messages = await searchMail({
    query: input.query ?? "is:unread in:inbox",
    maxResults: input.maxResults ?? 10,
  });

  if (messages.length === 0) return "No messages found.";

  const summary = messages
    .map((m, i) => `${i + 1}. From: ${m.from} | Subject: ${m.subject} | ${m.body.slice(0, 100)}`)
    .join("\n");

  const { text } = await generateText({
    model: getAgentModel(),
    prompt: `Create a brief digest of these emails. Group by topic where relevant, highlight anything urgent.\n\n${summary}`,
  });
  return text;
}

/** Schedule a send (stores draft + returns a reminder — true scheduling needs a job queue) */
export async function scheduleSend(input: ScheduleSendInput): Promise<{ draftId: string; scheduledFor: string }> {
  // Gmail API doesn't natively support scheduled send via REST yet.
  // We save a draft and return the scheduled time so the caller can handle the trigger.
  const draft = await draftMail({
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    body: input.body,
  });
  console.log(
    chalk.yellow(`[scheduleSend] Draft saved. Trigger sendDraft("${draft.id}") at ${input.sendAt.toISOString()}`)
  );
  return { draftId: draft.id!, scheduledFor: input.sendAt.toISOString() };
}

/** Send a saved draft by draft ID */
export async function sendDraft(draftId: string) {
  const gmail = await getGmailClient();
  const res = await gmail.users.drafts.send({
    userId: "me",
    requestBody: { id: draftId },
  });
  return res.data;
}

/** Get all messages in a thread */
export async function getThread(input: ThreadInput): Promise<EmailMessage[]> {
  const gmail = await getGmailClient();
  const res = await gmail.users.threads.get({
    userId: "me",
    id: input.threadId,
    format: "full",
  });
  return (res.data.messages ?? []).map(mapMessage);
}
