const OpenAI = require("openai");

// DeepSeek's strict tool-calling mode lives under the /beta path.
function resolveBaseUrl(baseUrl) {
  const resolved = (baseUrl || "https://api.deepseek.com").replace(/\/$/, "");
  return resolved.endsWith("/beta") ? resolved : `${resolved}/beta`;
}

function createDeepSeekClient({ apiKey, baseUrl } = {}) {
  return new OpenAI({
    apiKey,
    baseURL: resolveBaseUrl(baseUrl)
  });
}

function objectSchema(properties) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false
  };
}

function toolDefinition(name, description, parameters) {
  return {
    type: "function",
    function: {
      name,
      strict: true,
      description,
      parameters
    }
  };
}

// Sends one prompt to DeepSeek and returns the structured tool result plus any reasoning trace.
async function callTool(client, { prompt, systemPrompt, tool, model, maxTokens, thinkingEnabled = false, reasoningEffort = "high" }) {
  const toolName = tool.function.name;

  const params = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
    tools: [tool],
    tool_choice: { type: "function", function: { name: toolName } },
    max_tokens: maxTokens,
    stream: false
  };

  if (thinkingEnabled) {
    params.thinking = { type: "enabled" };
    params.reasoning_effort = reasoningEffort;
    params.temperature = 1;
  } else {
    params.thinking = { type: "disabled" };
    params.temperature = 0.2;
  }

  const response = await client.chat.completions.create(params);
  const choice = response.choices[0];
  const msg = choice.message;

  const call = msg.tool_calls?.find(toolCall => toolCall.function?.name === toolName);
  if (!call) {
    throw new Error(`DeepSeek did not return required tool call "${toolName}" (finish_reason: ${choice.finish_reason})`);
  }

  let result;
  try {
    result = JSON.parse(call.function.arguments);
  } catch (err) {
    throw new Error(`DeepSeek returned invalid tool arguments for "${toolName}" (finish_reason: ${choice.finish_reason}, argument_length: ${call.function.arguments?.length || 0}): ${err.message}`);
  }

  return { result, reasoningContent: msg.reasoning_content };
}

module.exports = { createDeepSeekClient, callTool, objectSchema, toolDefinition };
