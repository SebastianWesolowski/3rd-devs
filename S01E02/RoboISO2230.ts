import { ApiUtils } from "../utils";
import * as fs from "fs/promises";
import * as path from "path";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { OpenAIService } from "s-utils-llm";
import {
  normalizeQuestionPrompt,
  prepareAnswerQauestinPrompt,
} from "./prompts";
interface VerifyResponse {
  text: string;
  msgID: string;
}

interface DuplicateCount {
  [key: string]: number;
}

interface AIResponse {
  question: string;
  normalizedQuestion: string;
  answer?: string;
}

interface DatabaseContent {
  questions: string[];
}

export class RoboISO2230 {
  private apiUtils: ApiUtils;
  private answer: string = "";
  private question: string = "";
  private response!: VerifyResponse;
  private normalizedQuestion: string = "";
  private currentMsgId: string = "0";
  private static readonly BASE_URL = "https://xyz.ag3nts.org";
  private duplicateCounts: DuplicateCount = {};
  private readonly filePath = "S01E02/question.md";
  private openaiService: OpenAIService;

  constructor() {
    this.openaiService = new OpenAIService();
    this.apiUtils = new ApiUtils(RoboISO2230.BASE_URL);
  }

  async verify(text: string = "READY"): Promise<VerifyResponse> {
    const response = await this.apiUtils.post<VerifyResponse>("/verify", {
      text,
      msgID: 0,
    });

    // Update the message ID for the next request
    this.response = response;
    this.currentMsgId = this.response.msgID;
    this.question = this.response.text;

    // Wait for the processing to complete
    await this.processVerifyResponse(response);

    return response;
  }

  private async processVerifyResponse(
    response: VerifyResponse
  ): Promise<VerifyResponse> {
    await this.saveToDatabase(response);
    await this.normalizeQuestion();
    await this.prepareAnswerQauestin();
    return await this.prepareResponse();
  }

  // Uprość metodę prepareAnswerQauestin
  private async prepareAnswerQauestin(
    normalizeQuestion: string = this.normalizedQuestion
  ): Promise<string> {
    const prompts: ChatCompletionMessageParam[] = [
      { role: "system", content: prepareAnswerQauestinPrompt },
      {
        role: "user",
        content: `answer the following question: ${normalizeQuestion}`,
      },
    ];

    try {
      const response = (await this.openaiService.completion(
        prompts,
        "gpt-4o",
        false,
        false
      )) as OpenAI.Chat.Completions.ChatCompletion;
      const result = await this.processAIResponse(response);

      console.log("NormalizeQuestion:", {
        question: this.question,
        normalizedQuestion: this.normalizedQuestion,
        answer: result,
      } as AIResponse);

      this.answer = result;
      return result;
    } catch (error) {
      console.error("Error processing with AI:", error);
      throw error;
    }
  }

  // Wydziel wspólną logikę przetwarzania odpowiedzi AI
  private async processAIResponse(
    response: OpenAI.Chat.Completions.ChatCompletion
  ): Promise<string> {
    if (!response.choices[0].message.content) {
      throw new Error("Unexpected AI response format");
    }

    try {
      return JSON.parse(response.choices[0].message.content);
    } catch {
      return response.choices[0].message.content;
    }
  }

  // Uprość metodę saveToDatabase
  private async saveToDatabase(response: VerifyResponse): Promise<void> {
    try {
      const data: DatabaseContent = await this.readOrCreateDatabase();

      if (data.questions.includes(response.text)) {
        this.handleDuplicate(response.text);
        return;
      }

      data.questions.push(response.text);
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Error saving to question.md:", error);
      throw error;
    }
  }

  private async readOrCreateDatabase(): Promise<DatabaseContent> {
    if (!(await this.fileExists(this.filePath))) {
      const initialData: DatabaseContent = { questions: [] };
      await fs.writeFile(this.filePath, JSON.stringify(initialData, null, 2));
      return initialData;
    }

    const content = await fs.readFile(this.filePath, "utf-8");
    try {
      return JSON.parse(content);
    } catch {
      return { questions: [] };
    }
  }

  private handleDuplicate(text: string): void {
    this.duplicateCounts[text] = (this.duplicateCounts[text] || 0) + 1;
    console.log(
      `Duplicate found for "${text}" (${this.duplicateCounts[text]} times)`
    );
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async prepareResponse(
    normalizeQuestion: string = this.normalizedQuestion
  ): Promise<VerifyResponse> {
    try {
      const responseBody = {
        text: this.answer,
        msgID: this.currentMsgId,
      };

      const response = await this.apiUtils.post("/verify", responseBody);

      console.log("Response sent successfully:", response);
      return response;
    } catch (error) {
      console.error("Error preparing response:", error);
      throw error;
    }
  }

  private async normalizeQuestion(
    question: string = this.question
  ): Promise<string> {
    const systemPrompt: ChatCompletionMessageParam = {
      role: "system",
      content: normalizeQuestionPrompt,
    };

    const userPrompt: ChatCompletionMessageParam = {
      role: "user",
      content: `Please normalize this text: ${question}`,
    };

    try {
      const response = (await this.openaiService.completion(
        [systemPrompt, userPrompt],
        "gpt-4o",
        false,
        false
      )) as OpenAI.Chat.Completions.ChatCompletion;

      if (response.choices[0].message.content) {
        let result;

        try {
          result = JSON.parse(response.choices[0].message.content);
        } catch {
          result = response.choices[0].message.content;
        }

        console.log("NormalizeQuestion:", {
          question: this.question,
          normalizedQuestion: result,
        });

        this.normalizedQuestion = result;
        return result;
      }

      throw new Error("Unexpected AI response format");
    } catch (error) {
      console.error("Error processing with AI:", error);
      throw error;
    }
  }
}
