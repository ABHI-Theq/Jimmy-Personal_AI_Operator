import { google } from "googleapis";
import app, { oauth2Client } from "./email_server";
import chalk from "chalk";
import open from "open";
import { saveConfig, type GoogleConfig } from "./email_pass_store";
import { syncGoogleRefreshToken } from "../scheduler/config-sync";


export const authenticate=async ()=>{

  return await new Promise((resolve,reject)=>{

    const server=app.listen(8787,async()=>{
      console.log(chalk.green.bold("✅ OAuth Started"))
      await open("http://localhost:8787/auth/google")
    })
    app.get(
      "/auth/google/callback",
      async (req, res) => {
    
        try {
    
          const code =
            req.query.code as string;
    
          const { tokens } =
            await oauth2Client.getToken(code);
    
            console.log("typ: ",typeof tokens," "+JSON.stringify(tokens))
            const googleConfig:GoogleConfig={
                refresh_token:tokens.refresh_token!,
                scope:tokens.scope!,
                token_type:tokens.token_type!,
                refresh_token_expires_in:(tokens as any)?.refresh_token_expires_in ?? 0,
                createdAt:Date.now()
            }
    
    
            saveConfig(googleConfig)

            // Auto-sync new refresh token to Supabase so the Edge Function
            // uses it immediately — no manual `supabase secrets set` needed.
            syncGoogleRefreshToken(tokens.refresh_token!).catch(() => {});
    
    
          res.send(`
           <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Close Window Example</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                background-color: #f4f4f9;
            }
            
        </style>
    </head>
    <body>
    
        <h1>Authentication</h1>
        <p>Google Connected Successfully</p>
        
       
        <script>
            function closeWindow() {
                // Trick browser into thinking this window was opened via script
                window.open('', '_self', ''); 
                
                // Execute the close command
                window.close();
            }
                closeWindow()
        </script>
    
    </body>
    </html>
    
          `);
                    resolve(tokens)

                    console.log(tokens+" while server")
          server.close()

    
        } catch (error) {
    
          console.error(error);
          reject(error)
    
          res.status(500).send(
            "Authentication failed"
          );
        }
      }
    );
  })

}