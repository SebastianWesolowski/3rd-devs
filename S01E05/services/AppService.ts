import * as dotenv from "dotenv";
import { CentralaService, OpenAIService } from "s-utils-llm";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { systemPromptAnonimisedData } from "./prompts";
import type OpenAI from "openai";
dotenv.config();

interface CentralaResponse {
  [key: string]: any;
}

export class AppService {
  private openaiService: OpenAIService;
  private centralaService: CentralaService;

  constructor() {
    this.openaiService = new OpenAIService();
    this.centralaService = new CentralaService();
  }

  async getDate(): Promise<unknown> {
    return await this.centralaService.fetchFile("cenzura.txt");
  }

  async parseRespone(data: string): Promise<unknown> {
    const systemPrompt: ChatCompletionMessageParam = {
      role: "system",
      content: systemPromptAnonimisedData,
    };
    const userPrompt: ChatCompletionMessageParam = {
      role: "user",
      content: data,
    };

    const llmResponse = (await this.openaiService.completion(
      [systemPrompt, userPrompt],
      "gpt-4o-mini",
      false,
      false
    )) as OpenAI.Chat.Completions.ChatCompletion;

    let answers;
    return (answers = llmResponse.choices[0].message.content);
    // console.log(answers);
    // try {
    //   answers = JSON.parse(llmResponse.choices[0].message.content || "[]");
    // } catch (error) {
    //   console.warn("Failed to parse json LLM response:", error);
    //   return (answers = llmResponse.choices[0].message.content);
    // }
    // return answers;
  }

  async prepareReport(): Promise<unknown> {
    const data = await this.getDate();
    const answers = await this.parseRespone(data as string);
    return answers;
  }
}
