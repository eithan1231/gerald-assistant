import { AdapterInterface } from "./adapters/index.js";
import { AdapterLifx } from "./adapters/lifex.js";
import { AdapterTimer } from "./adapters/timer.js";
import { InterpreterAction } from "./interpreter.js";
import { timeout, unixTimestamp } from "./util.js";

export type AdapterActionResultScheduleAction = {
  type: "schedule";

  executeAt: number;

  actionId: string;
  actionProperties: any;
};

export type AdapterActionResultInterpreterMessage = {
  type: "interpreter-message";
  message: string;
};

export type AdapterActionResultTTS = {
  type: "tts";
  message: string;
};

export type AdapterActionResultSound = {
  type: "sound";
  data: Buffer;
};

export type AdapterActionResult = {
  success: true;
  results: Array<
    | AdapterActionResultScheduleAction
    | AdapterActionResultInterpreterMessage
    | AdapterActionResultTTS
    | AdapterActionResultSound
  >;
};

type AdapterActionSchedule = {
  status: "pending" | "running" | "finished";

  createdAt: number;
  executeAt: number;

  clientName: string;

  actionId: string;
  actionProperties: any;
};

type AdapterSubscription = {
  clientName: string;
  callback: (result: AdapterActionResult) => Promise<void>;
};

export class Adapter {
  private adapters: AdapterInterface[] = [];

  private schedules: AdapterActionSchedule[] = [];

  private subscriptions: AdapterSubscription[] = [];

  private disruptLoop = false;

  constructor() {
    this.adapters.push(new AdapterTimer());
    this.adapters.push(new AdapterLifx());
  }

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

        const result = await this.runAction(
          schedule.clientName,
          schedule.actionId,
          schedule.actionProperties
        );

        if (result) {
          this.publish(schedule.clientName, result);
        }

        schedule.status = "finished";
      }

      this.schedules = schedules.filter(
        (schedule) => schedule.status !== "finished"
      );

      await timeout(1000);
    }
  };

  public runAction = async (
    clientName: string,
    actionId: string,
    actionProperties: any
  ): Promise<AdapterActionResult | null> => {
    console.log(
      `[Adapter/runAction] clientName ${clientName}, actionId ${actionId}, actionProperties ${JSON.stringify(
        actionProperties
      )}`
    );

    for (const adapter of this.adapters) {
      const result = await adapter.runAction(actionId, actionProperties);

      if (!result) {
        continue;
      }

      for (const actionResult of result.results) {
        if (actionResult.type === "schedule") {
          this.schedules.push({
            status: "pending",

            createdAt: unixTimestamp(),
            executeAt: actionResult.executeAt,

            clientName: clientName,

            actionId: actionResult.actionId,
            actionProperties: actionResult.actionProperties,
          });
        }
      }

      return result;
    }

    return null;
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

  private publish = async (clientName: string, result: AdapterActionResult) => {
    const subscription = this.subscriptions.find(
      (sub) => sub.clientName === clientName
    );

    if (!subscription) {
      return;
    }

    await subscription.callback(result);
  };
}
