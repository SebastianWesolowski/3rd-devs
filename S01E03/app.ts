import * as dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { promises as fs } from "fs";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { CentralaService } from "./services/CentralaService";
import { ApiUtils } from "../utils";

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
const centralaService = new CentralaService();
const apiUtils = new ApiUtils();
app.use(express.json());

// Routes
app.post(
  "/api/s01e03",
  async (
    req: Request & { body: { messages?: Message[]; task?: string } },
    res: Response
  ) => {
    try {
      console.log("Received request:", new Date().toISOString());

      // Clear prompt file
      await fs.writeFile("prompt.md", "");

      // Fetch data from Centrala
      const centralData = await centralaService.fetchData();

      // Validate task ID
      if (!req.body.task) {
        throw new Error("Task ID is required");
      }

      // Send report to Centrala
      const reportResponse = await apiUtils.sendCentralaReport(
        req.body.task,
        API_KEY,
        centralData
      );

      // Send response
      res.json({
        data: reportResponse,
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
