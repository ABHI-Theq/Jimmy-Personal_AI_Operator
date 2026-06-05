import express from "express";
import { google } from "googleapis";
import open from "open";
import { saveConfig, type GoogleConfig } from "./email_pass_store";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

const REDIRECT_URI =
  "http://localhost:8787/auth/google/callback";

export const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const app = express();

app.get("/auth/google", async (req, res) => {

  const authUrl =
    oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send"
      ]
    });

  res.redirect(authUrl);
});




export default app
