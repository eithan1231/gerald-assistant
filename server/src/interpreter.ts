import { OpenAI } from "openai";
import { unixTimestamp } from "./util.js";
import { ConfigurationOptions, getConfigOption } from "./config/env.js";

export type InterpreterActionProperty = {
  name: string;
  type?: "string" | "number";
  enum?: string[];
  required?: boolean;
  description?: string;
};

export type InterpreterAction = {
  id: string;
  description?: string;
  parameters?: Array<InterpreterActionProperty>;
};

export type InterpreterProcessAction = {
  type: "action";
  actions: Array<{
    id: string;
    parameters: any;
    toolId: string;
  }>;
};

export type InterpreterProcessText = {
  type: "text";
  text: string;
};

export type InterpreterProcess =
  | InterpreterProcessAction
  | InterpreterProcessText;

export class Interpreter {
  private openai: OpenAI;
  private actions: InterpreterAction[] = [];

  private createdAt: number;
  private startedAt: number;
  private endedAt: number;
  private seenAt: number;

  private messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  constructor() {
    this.createdAt = unixTimestamp();
    this.seenAt = unixTimestamp();
    this.startedAt = 0;
    this.endedAt = 0;

    this.openai = new OpenAI({
      apiKey: getConfigOption(ConfigurationOptions.OpenAiKey),
    });
  }

  public addAction = (action: InterpreterAction) => {
    if (this.startedAt > 0) {
      throw new Error("Cannot add action once started");
    }

    if (this.endedAt > 0) {
      throw new Error("Cannot add action once ended");
    }

    this.actions.push(action);
  };

  public getCreatedTime = () => this.createdAt;
  public getStartedTime = () => this.startedAt;
  public getEndedTime = () => this.endedAt;
  public getSeenTime = () => this.seenAt;

  public start = async () => {
    if (this.endedAt > 0) {
      throw new Error("Interpreter has already ended");
    }

    if (this.startedAt > 0) {
      throw new Error("Interpreter has already started");
    }

    this.seenAt = unixTimestamp();
    this.startedAt = unixTimestamp();

    this.messages.push({
      role: "user",
      content:
        "You are a mean and rude smart home device. You will help me with my smart home, but have a smart-ass attitude while you do it. Also try keep the responses relatively short, a sentence, or two max.",
    });
  };

  public end = async () => {
    this.seenAt = unixTimestamp();
    this.endedAt = unixTimestamp();
  };

  public addUserMessage = async (content: string) => {
    this.messages.push({
      role: "user",
      content: content,
    });
  };

  public addAssistantMessage = async (content: string) => {
    this.messages.push({
      role: "assistant",
      content: content,
    });
  };

  public addToolMessage = async (toolId: string, content: string) => {
    this.messages.push({
      role: "tool",
      content: content,
      tool_call_id: toolId,
    });
  };

  public process = async (): Promise<InterpreterProcess> => {
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] =
      this.actions.map((action) => {
        const parameters: any = {
          type: "object",
          properties: {},
          required: action.parameters
            ?.filter((param) => param.required)
            .map((param) => param.name),
        };

        if (action.parameters) {
          for (const property of action.parameters) {
            parameters.properties[property.name] = {
              type: property.type ?? "string",
              enum: property.enum,
              description: property.description,
            };
          }
        }

        return {
          type: "function",
          function: {
            name: action.id,
            description: action.description,
            parameters,
          },
        };
      });

    const result = await this.openai.chat.completions.create({
      model: getConfigOption(ConfigurationOptions.OpenAiModel),
      tools: tools.length > 0 ? tools : undefined,
      messages: this.messages,
    });

    const choice = result.choices.at(0);

    if (!choice) {
      throw new Error("Unexpected response, no choices");
    }

    this.messages.push(choice.message);

    this.seenAt = unixTimestamp();

    if (choice.message.content) {
      return {
        type: "text",
        text: choice.message.content,
      };
    }

    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      return {
        type: "action",
        actions: choice.message.tool_calls.map((tool) => ({
          id: tool.function.name,
          toolId: tool.id,
          parameters: JSON.parse(tool.function.arguments),
        })),
      };
    }

    throw new Error("Reached unexpected code pathway");
  };
}
