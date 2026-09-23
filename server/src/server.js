// Local development entry point. On Vercel, api/index.js is the entry instead.
import "dotenv/config";
import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3001;

createApp().listen(port, () => {
  console.log(`whatsnew API listening on http://localhost:${port}`);
});
