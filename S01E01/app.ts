import * as dotenv from "dotenv";
import express from "express";
import { OpenAIService } from "./OpenAIService";
import type {
  ChatCompletionMessageParam,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import type OpenAI from "openai";
import { WebSearchService } from "./WebSearch";
import { answerPrompt } from "./prompts";

import { promises as fs } from "fs";

dotenv.config();
type Role = "user" | "assistant" | "system";
type Message = Omit<ChatCompletionMessageParam, "role"> & { role: Role };

interface SearchResult {
  url: string;
  title: string;
  description: string;
  content?: string;
}

const allowedDomains = [
  { name: "XYZ", url: "xyz.ag3nts.org", scrappable: true },
];

/*
Start Express server
*/
const app = express();
const port = 3000;
app.use(express.json());
app.listen(port, () =>
  console.log(
    `Server running at http://localhost:${port}. Listening for POST /api/s01e01 requests`
  )
);

const webSearchService = new WebSearchService(allowedDomains);
const openaiService = new OpenAIService();
let previousSummarization = "";

// Function to generate summarization based on the current turn and previous summarization
async function generateSummarization(
  userMessage: ChatCompletionMessageParam,
  assistantResponse: ChatCompletionMessageParam
): Promise<string> {
  const summarizationPrompt: ChatCompletionMessageParam = {
    role: "system",
    content: `Please summarize the following conversation in a concise manner, incorporating the previous summary if available:
<previous_summary>${
      previousSummarization || "No previous summary"
    }</previous_summary>
<current_turn> Adam: ${userMessage.content}\nAlice: ${
      assistantResponse.content
    } </current_turn>
`,
  };

  const response = (await openaiService.completion(
    [
      summarizationPrompt,
      {
        role: "user",
        content: "Please create/update our conversation summary.",
      },
    ],
    "gpt-4o-mini",
    false
  )) as OpenAI.Chat.Completions.ChatCompletion;
  return response.choices[0].message.content ?? "No conversation history";
}

// Function to create system prompt
function createSystemPrompt(summarization: string): ChatCompletionMessageParam {
  return {
    role: "system",
    content: `You are Alice, a helpful assistant who speaks using as few words as possible.

    ${
      summarization
        ? `Here is a summary of the conversation so far:
    <conversation_summary>
      ${summarization}
    </conversation_summary>`
        : ""
    }

    Let's chat!`,
  };
}

// Chat endpoint POST /api/chat
// app.post("/api/chat", async (req, res) => {
//   const { message } = req.body;

//   try {
//     const systemPrompt = createSystemPrompt(previousSummarization);

//     const assistantResponse = (await openaiService.completion(
//       [systemPrompt, message],
//       "gpt-4o",
//       false
//     )) as OpenAI.Chat.Completions.ChatCompletion;

//     // Generate new summarization
//     previousSummarization = await generateSummarization(
//       message,
//       assistantResponse.choices[0].message
//     );

//     res.json(assistantResponse);
//   } catch (error) {
//     console.error("Error in OpenAI completion:", JSON.stringify(error));
//     res
//       .status(500)
//       .json({ error: "An error occurred while processing your request" });
//   }
// });

// Demo endpoint POST /api/demo
// app.post("/api/demo", async (req, res) => {
//   console.log("Received request");
//   await fs.writeFile("prompt.md", "");

//   const demoMessages: ChatCompletionMessageParam[] = [
//     { content: "Hi! I'm Adam", role: "user" },
//     { content: "How are you?", role: "user" },
//     { content: "Do you know my name?", role: "user" },
//   ];

//   let assistantResponse: OpenAI.Chat.Completions.ChatCompletion | null = null;

//   for (const message of demoMessages) {
//     console.log("--- NEXT TURN ---");
//     console.log("Adam:", message.content);

//     try {
//       const systemPrompt = createSystemPrompt(previousSummarization);

//       assistantResponse = (await openaiService.completion(
//         [systemPrompt, message],
//         "gpt-4o",
//         false
//       )) as OpenAI.Chat.Completions.ChatCompletion;

//       console.log("Alice:", assistantResponse.choices[0].message.content);

//       // Generate new summarization
//       previousSummarization = await generateSummarization(
//         message,
//         assistantResponse.choices[0].message
//       );
//     } catch (error) {
//       console.error("Error in OpenAI completion:", JSON.stringify(error));
//       res
//         .status(500)
//         .json({ error: "An error occurred while processing your request" });
//       return;
//     }
//   }

//   res.json(assistantResponse);
// });

// S01E01 endpoint POST /api/s01e01
app.post("/api/s01e01", async (req, res) => {
  console.log("Received request");
  await fs.writeFile("prompt.md", "");

  console.log(req.body);
  const { messages }: { messages: Message[] } = req.body?.messages
    ? req.body
    : {
        messages: [
          {
            role: "user",
            content: "find out content on xyz.ag3nts.org page",
          },
        ],
      };

  try {
    const latestUserMessage = messages.filter((m) => m.role === "user").pop();
    if (!latestUserMessage) {
      throw new Error("No user message found");
    }

    const shouldSearch = await webSearchService.isWebSearchNeeded(
      latestUserMessage.content as string
    );
    let mergedResults: SearchResult[] = [];

    if (shouldSearch) {
      const { queries } = await webSearchService.generateQueries(
        latestUserMessage.content as string
      );
      if (queries.length > 0) {
        const searchResults = await webSearchService.searchWeb(queries);
        const filteredResults = await webSearchService.scoreResults(
          searchResults,
          latestUserMessage.content as string
        );
        const urlsToLoad = await webSearchService.selectResourcesToLoad(
          latestUserMessage.content as string,
          filteredResults
        );
        const scrapedContent: { url: string; content: string }[] =
          await webSearchService.scrapeUrls(urlsToLoad);

        const contentWithQuestions = await webSearchService.questionService(
          scrapedContent
        );

        return await webSearchService.forceChaptaOnXYZ(contentWithQuestions);

        // mergedResults = filteredResults.map((result) => {
        //   const scrapedItem = scrapedContent.find(
        //     (item) => item.url === result.url
        //   );
        //   return scrapedItem
        //     ? { ...result, content: scrapedItem.content }
        //     : result;
        // });
      }
    }

    const promptWithResults = answerPrompt(mergedResults);
    const allMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: promptWithResults, name: "Alice" },
      ...(messages as ChatCompletionMessageParam[]),
    ];
    const completion = await openaiService.completion(
      allMessages,
      "gpt-4o",
      false
    );

    return res.json(completion);
  } catch (error) {
    console.error("Error in chat processing:", error);
    res
      .status(500)
      .json({ error: "An error occurred while processing your request" });
  }
});
