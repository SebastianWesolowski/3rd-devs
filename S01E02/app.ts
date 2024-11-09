import * as dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { promises as fs } from "fs";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { RoboISO2230 } from "./RoboISO2230";

// Load environment variables
dotenv.config();

// Types
type Role = "user" | "assistant" | "system";
type Message = Omit<ChatCompletionMessageParam, "role"> & { role: Role };

// Constants
const PORT = process.env.PORT || 3000;

// Initialize Express and RoboISO2230
const app = express();
const roboISO2230 = new RoboISO2230();
app.use(express.json());

// Routes
app.post(
  "/api/s01e02",
  async (req: Request & { body: { messages?: Message[] } }, res: Response) => {
    try {
      console.log("Received request:", new Date().toISOString());

      // Clear prompt file
      await fs.writeFile("prompt.md", "");

      // Verify request using the service
      const verifyResponse = await roboISO2230.verify();
      res.json(verifyResponse);
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
  console.log(`Listening for POST requests at /api/s01e02`);
});
