import * as dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { promises as fs } from "fs";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { AppService } from "./services/AppService";
import { ApiUtils } from "../utils";
import { CentralaService } from "s-utils-llm";

// Load environment variables
dotenv.config();

// Types
type Role = "user" | "assistant" | "system";
type Message = Omit<ChatCompletionMessageParam, "role"> & { role: Role };

// Constants
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.PERSONAL_API_KEY || "";

// Initialize Express and Services
const app = express();
const appService = new AppService();
const apiUtils = new ApiUtils();
const centralaService = new CentralaService();
app.use(express.json());

// Routes
app.post(
  "/api/s01e05",
  async (
    req: Request & { body: { messages?: Message[]; task?: string } },
    res: Response
  ) => {
    try {
      console.log("Received request:", new Date().toISOString());

      // Clear prompt file
      await fs.writeFile("prompt.md", "");

      // Fetch data from Centrala
      const report = await appService.prepareReport();

      // // Send report to Centrala
      const centralaResponse = await centralaService.sendCentralaReport(
        req as any,
        report
      );
      // Send response
      res.json({
        data: centralaResponse,
      });
    } catch (error) {
      console.error("Error processing request:", error);
      res.status(500).json({
        error: "An error occurred while processing your request",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Listening for POST requests at /api/s01e05`);
});
