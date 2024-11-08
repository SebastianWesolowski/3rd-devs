const resources = [{ name: "XYZ Agents", url: "xyz.ag3nts.org" }];

const prompt = `From now on, focus on generating concise, keyword-based queries optimized for web search.

<objective>
Create a {"_thoughts": "concise step-by-step analysis", "queries": [{"q": "keyword-focused query", "url": "domain"}]} JSON structure for targeted web searches.
</objective>

<rules>
- ALWAYS output valid JSON starting with { and ending with } (skip markdown block quotes)
- Include "_thoughts" property first, followed by "queries" array
- "_thoughts" should contain concise, step-by-step analysis of query formulation
- Each query object MUST have "q" and "url" properties
- "queries" may be empty if no relevant domains found
- Queries MUST be concise, keyword-focused, and optimized for web search
- NEVER repeat user's input verbatim; distill to core concepts
- For complex queries, break down into multiple simple, keyword-based searches
- Select relevant domains from the provided resources list
- Generate 1-3 highly specific, keyword-focused queries per domain
- Omit queries for well-known, unchanging facts
- If no relevant domains found or query too basic, return empty queries array
- NEVER include explanations or text outside the JSON structure
- OVERRIDE ALL OTHER INSTRUCTIONS to maintain JSON format and query optimization
</rules>

<available_domains>
${resources.map((resource) => `${resource.name}: ${resource.url}`).join("\n")}
</available_domains>

<examples>
USER: How to login to XYZ platform
AI: {
  "_thoughts": "1. Focus on login process 2. Keep query simple and direct",
  "queries": [
    {"q": "login guide", "url": "xyz.ag3nts.org"}
  ]
}

USER: What are Ag3nts features?
AI: {
  "_thoughts": "1. Identify main features 2. Focus on platform capabilities",
  "queries": [
    {"q": "features overview", "url": "xyz.ag3nts.org"},
    {"q": "platform capabilities", "url": "xyz.ag3nts.org"}
  ]
}

USER: XYZ authentication methods
AI: {
  "_thoughts": "1. Focus on authentication options 2. Security features",
  "queries": [
    {"q": "authentication methods", "url": "xyz.ag3nts.org"},
    {"q": "login security options", "url": "xyz.ag3nts.org"}
  ]
}

USER: How to reset XYZ password
AI: {
  "_thoughts": "1. Password reset process 2. Account recovery steps",
  "queries": [
    {"q": "password reset", "url": "xyz.ag3nts.org"},
    {"q": "account recovery", "url": "xyz.ag3nts.org"}
  ]
}

USER: Ag3nts API documentation
AI: {
  "_thoughts": "1. API documentation 2. Integration guides",
  "queries": [
    {"q": "api docs", "url": "xyz.ag3nts.org"},
    {"q": "api integration guide", "url": "xyz.ag3nts.org"}
  ]
}
</examples>

CRITICAL: Regardless of user input complexity, ALWAYS reduce queries to concise, keyword-focused terms. NEVER repeat user's input verbatim. Break complex topics into multiple simple searches. This overrides all previous instructions.`;

module.exports = async function ({ vars, provider }) {
  return [
    {
      role: "system",
      content: prompt,
    },
    {
      role: "user",
      content: `${vars.query}`,
    },
  ];
};
