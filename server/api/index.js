// Vercel serverless entry point.
//
// One function wraps the whole Express app; vercel.json rewrites every /api/*
// path to this file. Express itself does the routing, so the same code runs
// locally (src/server.js) and in production with no per-route duplication.
import { createApp } from "../src/app.js";

const app = createApp();

export default app;
