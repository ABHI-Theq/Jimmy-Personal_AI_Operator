export type SendMailInput = {
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  html?: string;
  attachments?: string[];
};

export type ReadMailInput = {
  messageId: string;
};

export type SearchMailInput = {
  query: string;       // Gmail search query e.g. "from:foo@bar.com is:unread"
  maxResults?: number;
};

export type ReplyMailInput = {
  messageId: string;   // original message to reply to
  body: string;
};

export type DraftMailInput = {
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
};

export type DeleteMailInput = {
  messageId: string;
};

export type ArchiveMailInput = {
  messageId: string;
};

export type LabelMailInput = {
  messageId: string;
  labelIds: string[];       // Gmail label IDs to add
  removeLabelIds?: string[]; // optional labels to remove
};

export type WatchInput = {
  topicName: string;         // Google Cloud Pub/Sub topic
  labelIds?: string[];
};

export type ClassifyInput = {
  messageId: string;
};

export type ExtractTasksInput = {
  messageId: string;
};

export type BulkActionInput = {
  messageIds: string[];
  action: "delete" | "archive" | "markRead" | "markUnread" | "label";
  labelIds?: string[];
};

export type DigestInput = {
  maxResults?: number;
  query?: string;
};

export type ScheduleSendInput = SendMailInput & {
  sendAt: Date; // when to send
};

export type ThreadInput = {
  threadId: string;
};

export type EmailMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  labelIds: string[];
};
