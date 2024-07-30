import {
  AdapterInterface,
  AdapterInterfaceRunActionData,
} from "./adapters/index.js";
import { InterpreterAction } from "./interpreter.js";
import { timeout, unixTimestamp } from "./util.js";

export type AdapterActionResultItemScheduleAction = {
  type: "schedule";

  executeAt: number;

  actionId: string;
  actionParameters: any;
};

export type AdapterActionResultItemInterpreterUserMessage = {
  type: "interpreter-user-message";
  message: string;
};

export type AdapterActionResultItemInterpreterAssistantMessage = {
  type: "interpreter-assistant-message";
  message: string;
};

export type AdapterActionResultItemInterpreterToolMessage = {
  type: "interpreter-tool-message";
  toolId: string;
  message: string;
};

export type AdapterActionResultItemInterpreterEvaluate = {
  type: "interpreter-evaluate";
};

export type AdapterActionResultItemTTS = {
  type: "client-tts";
  message: string;
};

export type AdapterActionResultItemSound = {
  type: "client-sound-wave";
  data: Buffer;
};

export type AdapterActionResultItem =
  | AdapterActionResultItemScheduleAction
  | AdapterActionResultItemInterpreterUserMessage
  | AdapterActionResultItemInterpreterAssistantMessage
  | AdapterActionResultItemInterpreterToolMessage
  | AdapterActionResultItemInterpreterEvaluate
  | AdapterActionResultItemTTS
  | AdapterActionResultItemSound;

export type AdapterActionResult = {
  success: boolean;
  results: Array<AdapterActionResultItem>;
};

type AdapterActionSchedule = {
  status: "pending" | "running" | "finished";

  createdAt: number;
  executeAt: number;

  clientName: string;

  actionId: string;
  actionParameters: any;
};

type AdapterSubscription = {
  clientName: string;
  callback: (result: AdapterActionResultItem) => Promise<void>;
};

export class Adapter {
  private adapters: AdapterInterface[] = [];

  private schedules: AdapterActionSchedule[] = [];

  private subscriptions: AdapterSubscription[] = [];

  private disruptLoop = false;

  constructor() {}

  public addAdapter = (adapter: AdapterInterface) => {
    this.adapters.push(adapter);
  };

  public start = async () => {
    await Promise.all(this.adapters.map((adapter) => adapter.initialise()));

    this.disruptLoop = false;
    this.loop();
  };

  public stop = async () => {
    this.disruptLoop = true;
  };

  private loop = async () => {
    while (!this.disruptLoop) {
      const schedules = this.schedules;

      for (const schedule of schedules) {
        if (schedule.status !== "pending") {
          continue;
        }

        if (schedule.executeAt > unixTimestamp()) {
          continue;
        }

        schedule.status = "running";

        await this.runActions(schedule.clientName, [
          {
            id: schedule.actionId,
            parameters: schedule.actionParameters,
          },
        ]);

        schedule.status = "finished";
      }

      this.schedules = schedules.filter(
        (schedule) => schedule.status !== "finished"
      );

      await timeout(1000);
    }
  };

  public runActions = async (
    clientName: string,
    actions: Array<AdapterInterfaceRunActionData>
  ) => {
    console.log(`[Adapter/runActions] clientName ${clientName}`);

    let results: AdapterActionResultItem[] = [];

    for (const action of actions) {
      for (const adapter of this.adapters) {
        const res = await adapter.runAction(action);

        if (!res || !res.success) {
          continue;
        }

        console.log(
          `[Adapter/runActions] Action run with results, clientName ${clientName}, action.id ${action.id}, action.parameters ${action.parameters}`
        );

        results.push(...res.results);
      }
    }

    for (const result of results) {
      if (result.type === "interpreter-evaluate") {
        continue;
      }

      if (result.type === "schedule") {
        this.schedules.push({
          status: "pending",

          createdAt: unixTimestamp(),
          executeAt: result.executeAt,

          clientName: clientName,

          actionId: result.actionId,
          actionParameters: result.actionParameters,
        });
      }

      await this.publish(clientName, result);
    }

    if (results.find(({ type }) => type === "interpreter-evaluate")) {
      await this.publish(clientName, {
        type: "interpreter-evaluate",
      });
    }
  };

  public getActions = async (): Promise<InterpreterAction[]> => {
    const result: InterpreterAction[] = [];

    for (const adapter of this.adapters) {
      const actions = await adapter.getInterpreterActions();

      result.push(...actions);
    }

    return result;
  };

  public subscribe = (
    clientName: string,
    callback: AdapterSubscription["callback"]
  ) => {
    if (
      this.subscriptions.find(
        (subscription) => subscription.clientName === clientName
      )
    ) {
      throw new Error(`clientName already subscribed, ${clientName}`);
    }

    this.subscriptions.push({
      clientName: clientName,
      callback: callback,
    });
  };

  public unsubscribe = (clientName: string) => {
    const index = this.subscriptions.findIndex(
      (subscription) => subscription.clientName === clientName
    );

    if (index >= 0) {
      this.subscriptions.splice(index, 1);
    }
  };

  private publish = async (
    clientName: string,
    result: AdapterActionResultItem
  ) => {
    const subscription = this.subscriptions.find(
      (sub) => sub.clientName === clientName
    );

    if (!subscription) {
      return;
    }

    await subscription.callback(result);
  };
}
