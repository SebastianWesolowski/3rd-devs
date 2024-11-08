import FirecrawlApp from "@mendable/firecrawl-js";
import type { ScrapeResponse } from "@mendable/firecrawl-js";
import type OpenAI from "openai";
import { OpenAIService } from "./OpenAIService";
import {
  useSearchPrompt,
  extractKeywordsPrompt,
  askDomainsPrompt,
  scoreResultsPrompt,
  selectResourcesToLoadPrompt,
  answerQuestionsChaptaPrompt,
} from "./prompts";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// New type definition
type SearchNecessityResponse = 0 | 1;

type ContentWithQuestion = {
  url: string;
  content: string;
  question?: string;
  answer?: number;
};

export class WebSearchService {
  private openaiService: OpenAIService;
  private allowedDomains: { name: string; url: string; scrappable: boolean }[];
  private apiKey: string;
  private firecrawlApp: FirecrawlApp;

  constructor(
    allowedDomains: { name: string; url: string; scrappable: boolean }[]
  ) {
    this.openaiService = new OpenAIService();
    this.allowedDomains = allowedDomains;
    this.apiKey = process.env.FIRECRAWL_API_KEY || "";
    this.firecrawlApp = new FirecrawlApp({ apiKey: this.apiKey });
  }

  async isWebSearchNeeded(userMessage: string): Promise<boolean> {
    console.log("Input (isWebSearchNeeded):", userMessage);
    const systemPrompt: ChatCompletionMessageParam = {
      role: "system",
      content: useSearchPrompt,
    };

    const userPrompt: ChatCompletionMessageParam = {
      role: "user",
      content: userMessage,
    };

    try {
      const response = (await this.openaiService.completion(
        [systemPrompt, userPrompt],
        "gpt-4o",
        false
      )) as OpenAI.Chat.Completions.ChatCompletion;
      if (response.choices[0].message.content) {
        console.log(
          "Is web search needed?",
          response.choices[0].message.content
        );
        const result = JSON.parse(
          response.choices[0].message.content
        ) as SearchNecessityResponse;
        console.log("Output (isWebSearchNeeded):", result === 1);
        return result === 1;
      }

      throw new Error("Unexpected response format");
    } catch (error) {
      console.error("Error in WebSearchService:", error);
      return false;
    }
  }

  async generateQueries(
    userMessage: string
  ): Promise<{ queries: { q: string; url: string }[]; thoughts: string }> {
    console.log("Input (generateQueries):", userMessage);
    const systemPrompt: ChatCompletionMessageParam = {
      role: "system",
      content: askDomainsPrompt(this.allowedDomains),
    };

    const userPrompt: ChatCompletionMessageParam = {
      role: "user",
      content: userMessage,
    };

    try {
      const response = (await this.openaiService.completion(
        [systemPrompt, userPrompt],
        "gpt-4o",
        false,
        true
      )) as OpenAI.Chat.Completions.ChatCompletion;

      if (response.choices[0].message.content) {
        const result = JSON.parse(response.choices[0].message.content);
        // Filter queries to only include allowed domains
        const filteredQueries = result.queries.filter(
          (query: { q: string; url: string }) =>
            this.allowedDomains.some((domain) => query.url.includes(domain.url))
        );
        console.log("generated queries:", filteredQueries);
        console.log("Output (generateQueries):", {
          queries: filteredQueries,
          thoughts: result._thoughts,
        });
        return { queries: filteredQueries, thoughts: result._thoughts };
      }

      throw new Error("Unexpected response format");
    } catch (error) {
      console.error("Error generating queries:", error);
      return { queries: [], thoughts: "" };
    }
  }

  async searchWeb(queries: { q: string; url: string }[]): Promise<
    {
      query: string;
      results: {
        url: string;
        title: string;
        description: string;
        content: string;
      }[];
    }[]
  > {
    console.log("Input (searchWeb):", queries);
    const searchResults = await Promise.all(
      queries.map(async ({ q, url }) => {
        try {
          const domain = new URL(
            url.startsWith("http") ? url : `https://${url}`
          );
          const siteQuery = `site:${domain.hostname} ${q}`;

          // Fetch the webpage content
          const response = await fetch(domain.href, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.text();
          const titleMatch = result.match(/<title>(.*?)<\/title>/i);
          const title = titleMatch ? titleMatch[1] : "No title";

          const descriptionMatch =
            result.match(
              /<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i
            ) || result.match(/<p>(.*?)<\/p>/i);
          const description = descriptionMatch
            ? descriptionMatch[1]
            : "No description"; // TODO: add prompt to describe the page

          // Extract main content
          const bodyContent = result
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove scripts
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "") // Remove styles
            .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "") // Remove header
            .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "") // Remove footer
            .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "") // Remove navigation
            .replace(/<[^>]+>/g, " ") // Remove remaining HTML tags
            .replace(/\s+/g, " ") // Replace multiple spaces with single space
            .trim(); // Trim whitespace

          const content = bodyContent.slice(0, 5000); // Limit content length to first 5000 chars

          if (response.ok) {
            return {
              query: q,
              results: [
                {
                  url: domain.href,
                  title: title,
                  description: description,
                  content: content,
                },
              ],
            };
          } else {
            console.warn(`No results found for query: "${siteQuery}"`);
            return { query: q, results: [] };
          }
        } catch (error) {
          console.error(`Error searching for "${q}":`, error);
          return { query: q, results: [] };
        }
      })
    );

    console.log("Output (searchWeb):", searchResults);
    return searchResults;
  }

  async scoreResults(
    searchResults: {
      query: string;
      results: {
        url: string;
        title: string;
        description: string;
        content: string;
      }[];
    }[],
    originalQuery: string
  ): Promise<{ url: string; title: string; description: string }[]> {
    console.log("Input (scoreResults):", { searchResults, originalQuery });
    const scoringPromises = searchResults.flatMap((result) =>
      result.results.map(async (item) => {
        const userMessage = `<context>
        Resource: ${item.url}
        Snippet: ${item.description}
        ContentPage: ${item.content}
        </context>

        The following is the original user query that we are scoring the resource against. It's super relevant.
        <original_user_query_to_consider>
        ${originalQuery}
        </original_user_query_to_consider>

        The following is the generated query that may be helpful in scoring the resource.
        <query>
        ${result.query}
        </query>`;

        const response = (await this.openaiService.completion(
          [
            { role: "system", content: scoreResultsPrompt },
            { role: "user", content: userMessage },
          ],
          "gpt-4o-mini",
          false
        )) as OpenAI.Chat.Completions.ChatCompletion;

        if (response.choices[0].message.content) {
          const scoreResult = JSON.parse(response.choices[0].message.content);
          console.log("Score for", item.url, scoreResult.score);
          console.log("Thoughts:", scoreResult.reason);
          return { ...item, score: scoreResult.score };
        }
        return { ...item, score: 0 };
      })
    );

    const scoredResults = await Promise.all(scoringPromises);
    const sortedResults = scoredResults.sort((a, b) => b.score - a.score);
    const filteredResults = sortedResults.slice(0, 3);

    console.log("Output (scoreResults):", filteredResults);
    return filteredResults;
  }

  async selectResourcesToLoad(
    userMessage: string,
    filteredResults: { url: string; title: string; description: string }[]
  ): Promise<string[]> {
    const systemPrompt: ChatCompletionMessageParam = {
      role: "system",
      content: selectResourcesToLoadPrompt,
    };

    const userPrompt: ChatCompletionMessageParam = {
      role: "user",
      content: `Original query: "${userMessage}"
Filtered resources:
${JSON.stringify(
  filteredResults.map((r) => ({ url: r.url, snippet: r.description })),
  null,
  2
)}`,
    };

    console.log("userPrompt:", userPrompt);

    try {
      const response = (await this.openaiService.completion(
        [systemPrompt, userPrompt],
        "gpt-4o",
        false,
        true
      )) as OpenAI.Chat.Completions.ChatCompletion;

      if (response.choices[0].message.content) {
        console.log(
          "response.choices[0].message.content:",
          response.choices[0].message.content
        );
        const result = JSON.parse(response.choices[0].message.content);
        const selectedUrls = result.urls;

        // Filter out URLs that aren't in the filtered results
        const validUrls = selectedUrls.filter((url: string) =>
          filteredResults.some((r) => r.url === url)
        );

        return validUrls;
      }

      throw new Error("Unexpected response format");
    } catch (error) {
      console.error("Error selecting resources to load:", error);
      return [];
    }
  }

  async questionService(
    scrapedContent: { url: string; content: string }[]
  ): Promise<ContentWithQuestion[]> {
    const content = [...scrapedContent];

    const extractQuestion = (text: string): string => {
      const questionMatch = text.match(/Question:\s*\n\s*(.*?)(?:\n|$)/i);
      return questionMatch ? questionMatch[1].trim() : "";
    };

    (content as ContentWithQuestion[]).forEach((item, index) => {
      if (item.content.includes("Question:")) {
        (content as ContentWithQuestion[])[index] = {
          ...item,
          question: extractQuestion(item.content),
        };
      }
    });

    // Second pass: process with OpenAI
    try {
      const processedContent = await Promise.all(
        content.map(async (item) => {
          if (!(item as ContentWithQuestion).question) {
            throw new Error("No question found");
          }

          const systemPrompt: ChatCompletionMessageParam = {
            role: "system",
            content: answerQuestionsChaptaPrompt,
          };

          const userPrompt: ChatCompletionMessageParam = {
            role: "user",
            content: `answer the following question: ${
              (item as ContentWithQuestion).question
            }`,
          };

          console.log("userPrompt:", userPrompt);

          try {
            const response = (await this.openaiService.completion(
              [systemPrompt, userPrompt],
              "gpt-4o",
              false,
              true
            )) as OpenAI.Chat.Completions.ChatCompletion;

            if (response.choices[0].message.content) {
              console.log(
                "response.choices[0].message.content:",
                response.choices[0].message.content
              );
              const result = JSON.parse(response.choices[0].message.content);

              // Ensure we have a number for the answer
              const answerNumber = result;

              return {
                url: item.url,
                content: item.content,
                question: (item as ContentWithQuestion).question,
                answer: answerNumber.answer,
              } as ContentWithQuestion;
            }

            throw new Error("Unexpected response format");
          } catch (error) {
            console.error("Error processing question:", error);
            return null;
          }
        })
      );

      // Filter out any failed processing (null results)
      return processedContent.filter(
        (item): item is ContentWithQuestion => item !== null
      );
    } catch (error) {
      console.error("Error in questionSeparated:", error);
      return [];
    }
  }

  async forceChaptaOnXYZ(
    contentWithQuestions: ContentWithQuestion[]
  ): Promise<ContentWithQuestion[]> {
    // Find XYZ domain content
    const xyzContent = contentWithQuestions.find((item) =>
      item.url.includes("xyz.ag3nts.org")
    );

    if (!xyzContent) {
      return contentWithQuestions;
    }

    try {
      // Format the body as application/x-www-form-urlencoded
      const formData = new URLSearchParams({
        username: "tester",
        password: "574e112a",
        answer: xyzContent.answer?.toString() || "",
      }).toString();
      console.log(formData);

      // First POST request to submit the form
      const postResponse = await fetch(xyzContent.url, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        },
        body: formData,
      }).then(async (response) => {
        console.log("postResponse:", response);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const content = await response.text();
        console.log("Response content:", content);
        return content;
      });

      // Get the response URL after form submission
      const responseUrl = postResponse.url;

      // Second GET request to fetch content from response URL
      const getResponse = await fetch(responseUrl);
      const text = await getResponse.text();

      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        // If response is HTML, just use it as the content
        result = { content: text };
      }

      // Update the content of the XYZ item
      return contentWithQuestions.map((item) => {
        if (item.url === xyzContent.url) {
          return {
            ...item,
            content: result.content || item.content,
          };
        }
        return item;
      });
    } catch (error) {
      console.error("Error posting to XYZ:", error);
      return contentWithQuestions;
    }
  }
  async scrapeUrls(
    urls: string[]
  ): Promise<{ url: string; content: string }[]> {
    // Filter out URLs that are not scrappable based on allowedDomains
    const scrappableUrls = urls.filter((url) => {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      console.log("domain:", domain);
      const allowedDomain = this.allowedDomains.find((d) => d.url === domain);
      console.log("allowedDomain:", allowedDomain);
      return allowedDomain && allowedDomain.scrappable;
    });

    console.log("scrappableUrls:", scrappableUrls);

    const scrapePromises = scrappableUrls.map(async (url) => {
      try {
        const scrapeResult = await this.firecrawlApp.scrapeUrl(url, {
          formats: ["markdown"],
        });

        if (scrapeResult && scrapeResult.markdown) {
          console.log("scrapeResult:", scrapeResult);
          return { url, content: scrapeResult.markdown };
        } else {
          console.warn(`No markdown content found for URL: ${url}`);
          return { url, content: "" };
        }
      } catch (error) {
        console.error(`Error scraping URL ${url}:`, error);
        return { url, content: "" };
      }
    });

    const scrapedResults = await Promise.all(scrapePromises);
    return scrapedResults.filter((result) => result.content !== "");
  }
}
