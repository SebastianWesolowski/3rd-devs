import * as dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { promises as fs } from "fs";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { CentralaService } from "s-utils-llm";
import { ApiUtils } from "../utils";
import { AppService } from "./services/AppService";

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
const centralaService = new CentralaService();

const apiUtils = new ApiUtils();
app.use(express.json());

// Routes
app.post(
  "/api/s01e03",
  async (req: Request & { body: { task?: string } }, res: Response) => {
    try {
      console.log("Received request:", new Date().toISOString());

      // Clear prompt file
      await fs.writeFile("prompt.md", "");

      // Fetch data from Centrala
      const centralData = await appService.fetchData();

      // // Send report to Centrala
      const centralaResponse = await centralaService.sendCentralaReport(
        req as any,
        centralData
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
  console.log(`Listening for POST requests at /api/s01e03`);
});
