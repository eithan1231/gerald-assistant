import { AdapterActionResult } from "~/adapter.js";
import { InterpreterAction } from "~/interpreter.js";
import { unixTimestamp } from "~/util.js";
import { Action, AdapterInterfaceRunActionData } from "./index.js";
import { readFile } from "node:fs/promises";

export class AdapterTimer {
  private actions: Action[] = [];

  public initialise = async () => {
    console.log("[AdapterTimer/initialise] Started");

    this.actions.push({
      type: "command",
      id: "set_timer",
      description: "Sets a timer for a specified duration for an alarm",
      handler: this.handlerSetTimer,
      parameters: [
        {
          name: "duration",
          description: "Duration of timer, in seconds",
          type: "number",
        },
      ],
    });

    this.actions.push({
      type: "job",
      id: "run_timer",
      handler: this.handlerRunTimer,
      parameters: [],
    });
  };

  public handlerSetTimer = async (
    payload: AdapterInterfaceRunActionData<{ duration: number }>
  ): Promise<AdapterActionResult> => {
    if (!payload.toolId) {
      throw new Error("Tool ID not set");
    }

    console.log(
      `[AdapterTimer/handlerSetTimer] Setting timer for in ${payload.parameters.duration} seconds`
    );

    return {
      success: true,
      results: [
        {
          type: "interpreter-tool-message",
          toolId: payload.toolId,
          message: "Timer set",
        },
        {
          type: "interpreter-evaluate",
        },
        {
          type: "schedule",

          executeAt: unixTimestamp() + payload.parameters.duration,

          actionId: "run_timer",
          actionParameters: {},
        },
      ],
    };
  };

  public handlerRunTimer = async (
    payload: AdapterInterfaceRunActionData
  ): Promise<AdapterActionResult> => {
    const content = await readFile("./config/audio/ding-dong.wav");

    return {
      success: true,
      results: [
        {
          type: "client-sound",
          data: content,
        },
      ],
    };
  };

  public runAction = async (payload: AdapterInterfaceRunActionData) => {
    for (const action of this.actions) {
      if (action.id === payload.id) {
        return await action.handler(payload);
      }
    }

    return null;
  };

  public getInterpreterActions = async (): Promise<InterpreterAction[]> => {
    return this.actions
      .filter((action) => action.type === "command")
      .map((action) => {
        return {
          id: action.id,
          description: action.description,
          parameters: action.parameters,
        };
      });
  };
}
