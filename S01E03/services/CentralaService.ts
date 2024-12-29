import { ApiUtils } from "../../utils";
import * as dotenv from "dotenv";
import { OpenAIService } from "../OpenAIService";

import * as fs from "fs/promises";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { prepareAnswerQauestinPrompt } from "../prompts";
import type OpenAI from "openai";

dotenv.config();

interface CentralaResponse {
  // Add specific response type based on the API response structure
  [key: string]: any;
}

export class CentralaService {
  private apiUtils: ApiUtils;
  private baseUrl: string;
  private apiKey: string;
  private openaiService: OpenAIService;

  constructor() {
    this.apiKey = process.env.PERSONAL_API_KEY || "";
    this.baseUrl = "https://centrala.ag3nts.org";
    this.apiUtils = new ApiUtils(this.baseUrl);

    this.openaiService = new OpenAIService();
  }

  async fetchData(): Promise<CentralaResponse> {
    try {
      if (!this.apiKey) {
        throw new Error("PERSONAL_API_KEY is not set in environment variables");
      }

      const endpoint = `/data/${this.apiKey}/json.txt`;
      interface TestData {
        question: string;
        answer: number;
        test?: {
          q: string;
          a: string;
        };
      }

      interface CentralaSuccessResponse {
        apikey: string;
        description: string;
        copyright: string;
        "test-data": TestData[];
      }

      let response: CentralaSuccessResponse;
      try {
        const savedData = await fs.readFile("./S01E03/response.json", "utf8");
        response = JSON.parse(savedData);
        console.log("Using cached response data");
      } catch (error) {
        console.log("No cached data found, fetching from API...");
        response = await this.apiUtils.get<CentralaSuccessResponse>(endpoint);
        await fs.writeFile(
          "./S01E03/response.json",
          JSON.stringify(response, null, 2)
        );
      }

      // Cleanup previous responseUpdated.json if exists
      try {
        await fs.unlink("./S01E03/responseUpdated.json");
      } catch (error) {
        // File doesn't exist, ignore error
      }

      // Validate calculation questions
      for (const item of response["test-data"]) {
        const calculatedAnswer = eval(item.question);
        if (calculatedAnswer !== item.answer) {
          const previousAnswer = item.answer;
          item.answer = calculatedAnswer;
          console.log(
            `Updated answer for "${item.question}" from ${previousAnswer} to ${calculatedAnswer}`
          );

          // Save updated response to file
          await fs.writeFile(
            "./S01E03/responseUpdated.json",
            JSON.stringify(response, null, 2)
          );
        }
      }

      const testQuestions = response["test-data"]
        .filter((item) => item.test)
        .map((item, idx) => ({
          index: response["test-data"].indexOf(item), // Use the original array index
          q: item.test!.q,
          a: item.test!.a,
        }));

      // Process test questions in parallel
      const processTestQuestions = async () => {
        if (testQuestions.length > 0) {
          const systemPrompt: ChatCompletionMessageParam = {
            role: "system",
            content: prepareAnswerQauestinPrompt,
          };
          const userPrompt: ChatCompletionMessageParam = {
            role: "user",
            content: `Please answer the following questions and format your response as a JSON array with index, question, and answer fields:

Questions:
${testQuestions.map((q) => `${q.index}. ${q.q}`).join("\n")}

Response format:
[
  {
    "index": number,
    "q": "question text",
    "a": "answer text"
  }
]`,
          };

          const llmResponse = (await this.openaiService.completion(
            [systemPrompt, userPrompt],
            "gpt-4o-mini",
            false,
            true
          )) as OpenAI.Chat.Completions.ChatCompletion;

          let answers;
          try {
            answers = JSON.parse(
              llmResponse.choices[0].message.content || "[]"
            );
          } catch (error) {
            console.error("Failed to parse LLM response:", error);
            answers = [];
          }
          console.log(answers);
          answers.response.forEach(
            (q: { index: number; q: string; a: string }) => {
              if (
                q.index >= 0 &&
                q.index < response["test-data"].length &&
                response["test-data"][q.index].test
              ) {
                const previousAnswer = response["test-data"][q.index].test!.a;
                if (
                  response["test-data"][q.index].test &&
                  typeof q.a === "string"
                ) {
                  response["test-data"][q.index].test!.a = q.a;
                }
                console.log(
                  `Updated test answer at index ${q.index} from "${previousAnswer}" to "${q.a}"`
                );
              } else {
                console.warn(`Invalid answer index: ${q.index}`);
              }
            }
          );

          await fs.writeFile(
            "./S01E03/responseUpdated.json",
            JSON.stringify(response, null, 2)
          );
        }
      };

      await processTestQuestions();

      // if (false) {
      //   const systemPrompt: ChatCompletionMessageParam = {
      //     role: "system",
      //     content: prepareAnswerQauestinPrompt,
      //   };
      //   const userPrompt: ChatCompletionMessageParam = {
      //     role: "user",
      //     content: `Answer the following question: ${item.test.q}`,
      //   };

      //   const llmResponse = (await this.openaiService.completion(
      //     [systemPrompt, userPrompt],
      //     "gpt-4o-mini",
      //     false,
      //     false
      //   )) as OpenAI.Chat.Completions.ChatCompletion;
      //   const aiAnswer = llmResponse.choices[0].message.content;
      //   item.test.a = aiAnswer || "";

      //   // Save updated response to file
      //   await fs.writeFile(
      //     "./S01E03/responseUpdated.json",
      //     JSON.stringify(response, null, 2)
      //   );
      // }

      // Read updated response if it exists
      let updatedResponse = response;
      try {
        const updatedData = await fs.readFile(
          "./S01E03/responseUpdated.json",
          "utf8"
        );
        updatedResponse = JSON.parse(updatedData);
      } catch (error) {
        // File doesn't exist, use original response
      }

      return {
        description: updatedResponse.description,
        copyright: updatedResponse.copyright,
        apikey: this.apiKey,
        "test-data": updatedResponse["test-data"].map((item) => ({
          question: item.question,
          answer: item.answer,
          test: item.test
            ? {
                q: item.test.q,
                a: item.test.a,
              }
            : undefined,
        })),
      };
    } catch (error) {
      console.error("Error fetching data from Centrala:", error);
      throw error;
    }
  }
}
