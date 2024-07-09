import { AdapterActionResult } from "~/adapter.js";
import { InterpreterAction } from "~/interpreter.js";
import { unixTimestamp } from "~/util.js";
import { Action } from "./index.js";
import { readFile } from "node:fs/promises";

export class AdapterTimer {
  private actions: Action[] = [];

  public initialise = async () => {
    this.actions.push({
      type: "command",
      id: "set_timer",
      description: "Sets a timer for a specified duration for an alarm",
      handler: this.handlerSetTimer,
      properties: [
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
      properties: [],
    });
  };

  public handlerSetTimer = async (properties: {
    duration: number;
  }): Promise<AdapterActionResult> => {
    console.log("setting timer in ", properties.duration);
    return {
      success: true,
      results: [
        {
          type: "interpreter-message",
          message: "Timer set",
        },
        {
          type: "schedule",

          executeAt: unixTimestamp() + properties.duration,

          actionId: "run_timer",
          actionProperties: {},
        },
      ],
    };
  };

  public handlerRunTimer = async (
    properties: any
  ): Promise<AdapterActionResult> => {
    const content = await readFile("./config/audio/ding-dong.wav");

    return {
      success: true,
      results: [
        {
          type: "sound",
          data: content,
        },
      ],
    };
  };

  public runAction = async (id: string, properties: any) => {
    for (const action of this.actions) {
      if (action.id === id) {
        return await action.handler(properties);
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
          properties: action.properties,
        };
      });
  };
}
