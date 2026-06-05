import { tool } from "ai";
import { z } from "zod";
import {
  sendMail,
  readMail,
  searchMail,
  summarizeMail,
  replyMail,
  draftMail,
  deleteMail,
  archiveMail,
  labelMail,
  classifyMail,
  extractTasks,
  bulkAction,
  digest,
  scheduleSend,
  sendDraft,
  getThread,
} from "./email_functions";

export function createEmailTools() {
  return {
    email_send: tool({
      description: "Send an email to one or more recipients.",
      inputSchema: z.object({
        to: z.union([z.string(), z.array(z.string())]).describe("Recipient email(s)"),
        subject: z.string(),
        body: z.string().describe("Plain text body"),
        cc: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
      }),
      execute: async (input) => sendMail(input),
    }),

    email_read: tool({
      description: "Read a single email by its message ID.",
      inputSchema: z.object({
        messageId: z.string(),
      }),
      execute: async ({ messageId }) => readMail({ messageId }),
    }),

    email_search: tool({
      description:
        'Search emails using Gmail query syntax (e.g. "from:foo@bar.com is:unread").',
      inputSchema: z.object({
        query: z.string(),
        maxResults: z.number().optional().default(10),
      }),
      execute: async ({ query, maxResults }) => searchMail({ query, maxResults }),
    }),

    email_summarize: tool({
      description: "Summarize an email using AI.",
      inputSchema: z.object({
        messageId: z.string(),
      }),
      execute: async ({ messageId }) => summarizeMail({ messageId }),
    }),

    email_reply: tool({
      description: "Reply to an existing email, keeping the same thread.",
      inputSchema: z.object({
        messageId: z.string().describe("ID of the message to reply to"),
        body: z.string().describe("Reply body text"),
      }),
      execute: async ({ messageId, body }) => replyMail({ messageId, body }),
    }),

    email_draft: tool({
      description: "Save an email as a draft without sending.",
      inputSchema: z.object({
        to: z.union([z.string(), z.array(z.string())]),
        subject: z.string(),
        body: z.string(),
        cc: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
      }),
      execute: async (input) => draftMail(input),
    }),

    email_delete: tool({
      description: "Permanently delete an email by message ID.",
      inputSchema: z.object({
        messageId: z.string(),
      }),
      execute: async ({ messageId }) => deleteMail({ messageId }),
    }),

    email_archive: tool({
      description: "Archive an email (removes it from Inbox).",
      inputSchema: z.object({
        messageId: z.string(),
      }),
      execute: async ({ messageId }) => archiveMail({ messageId }),
    }),

    email_label: tool({
      description: "Add or remove labels on an email.",
      inputSchema: z.object({
        messageId: z.string(),
        labelIds: z.array(z.string()).describe("Label IDs to add"),
        removeLabelIds: z.array(z.string()).optional().describe("Label IDs to remove"),
      }),
      execute: async ({ messageId, labelIds, removeLabelIds }) =>
        labelMail({ messageId, labelIds, removeLabelIds }),
    }),

    email_classify: tool({
      description:
        "Classify an email into a category (work, personal, newsletter, spam, finance, travel, support, social, other).",
      inputSchema: z.object({
        messageId: z.string(),
      }),
      execute: async ({ messageId }) => classifyMail({ messageId }),
    }),

    email_extract_tasks: tool({
      description: "Extract action items and tasks from an email using AI.",
      inputSchema: z.object({
        messageId: z.string(),
      }),
      execute: async ({ messageId }) => extractTasks({ messageId }),
    }),

    email_bulk_action: tool({
      description: "Perform an action on multiple emails at once.",
      inputSchema: z.object({
        messageIds: z.array(z.string()),
        action: z.enum(["delete", "archive", "markRead", "markUnread", "label"]),
        labelIds: z.array(z.string()).optional(),
      }),
      execute: async ({ messageIds, action, labelIds }) =>
        bulkAction({ messageIds, action, labelIds }),
    }),

    email_digest: tool({
      description: "Generate an AI digest summary of recent or filtered emails.",
      inputSchema: z.object({
        query: z.string().optional().default("is:unread in:inbox"),
        maxResults: z.number().optional().default(10),
      }),
      execute: async ({ query, maxResults }) => digest({ query, maxResults }),
    }),

    email_schedule_send: tool({
      description:
        "Save an email as a draft scheduled for a future time. Returns draftId to send later.",
      inputSchema: z.object({
        to: z.union([z.string(), z.array(z.string())]),
        subject: z.string(),
        body: z.string(),
        sendAt: z.string().describe("ISO 8601 datetime string for when to send"),
        cc: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
      }),
      execute: async ({ sendAt, ...rest }) =>
        scheduleSend({ ...rest, sendAt: new Date(sendAt) }),
    }),

    email_send_draft: tool({
      description: "Send a previously saved draft by its draft ID.",
      inputSchema: z.object({
        draftId: z.string(),
      }),
      execute: async ({ draftId }) => sendDraft(draftId),
    }),

    email_thread: tool({
      description: "Get all messages in an email thread.",
      inputSchema: z.object({
        threadId: z.string(),
      }),
      execute: async ({ threadId }) => getThread({ threadId }),
    }),
  };
}
